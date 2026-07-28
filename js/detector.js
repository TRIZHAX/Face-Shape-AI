// TensorFlow.js face landmark detector. Loads lazily; falls back to a
// lightweight ellipse-based detector if TF.js cannot be loaded (offline
// after first load or restricted environment).
//
// TF.js is loaded from a CDN on first use, then cached by the browser's
// HTTP cache and service-worker-less mechanism; once cached, subsequent
// runs are fully offline.

let mod = null;
let detector = null;
let loading = null;
let usingFallback = false;

const TF_URLS = [
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection@1.0.6/dist/face-landmarks-detection.min.js',
];

function loadScript(src) {
  return new Promise((res, rej) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) { existing.addEventListener('load', () => res()); existing.addEventListener('error', rej); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('load fail ' + src));
    document.head.appendChild(s);
  });
}

export async function initDetector(onProgress) {
  if (detector || usingFallback) return { fallback: usingFallback };
  if (loading) return loading;
  loading = (async () => {
    try {
      onProgress?.(0.05, 'Loading TensorFlow.js…');
      await loadScript(TF_URLS[0]);
      onProgress?.(0.35, 'Loading face landmarks model…');
      await loadScript(TF_URLS[1]);
      onProgress?.(0.65, 'Warming up model…');
      const flm = window.faceLandmarksDetection;
      if (!flm) throw new Error('face-landmarks-detection missing');
      const model = flm.SupportedModels.MediaPipeFaceMesh;
      detector = await flm.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: false,
        maxFaces: 1,
      });
      onProgress?.(1, 'Ready');
      return { fallback: false };
    } catch (err) {
      console.warn('TF.js load failed, using fallback detector', err);
      usingFallback = true;
      onProgress?.(1, 'Using lightweight fallback detector');
      return { fallback: true };
    }
  })();
  return loading;
}

export function isFallback() { return usingFallback; }

// Detect on a HTMLVideoElement or ImageBitmap-like source.
// Returns { keypoints: [{x,y,z?,name?}], box:{xMin,yMin,xMax,yMax} } or null.
export async function detect(source) {
  if (detector) {
    try {
      const faces = await detector.estimateFaces(source, { flipHorizontal: false });
      if (!faces || !faces.length) return null;
      return normalizeFace(faces[0]);
    } catch (e) {
      console.warn('detector error, falling back', e);
      return fallbackDetect(source);
    }
  }
  return fallbackDetect(source);
}

function normalizeFace(f) {
  const keypoints = f.keypoints || [];
  let xMin=Infinity,yMin=Infinity,xMax=-Infinity,yMax=-Infinity;
  for (const p of keypoints) {
    if (p.x<xMin) xMin=p.x;
    if (p.y<yMin) yMin=p.y;
    if (p.x>xMax) xMax=p.x;
    if (p.y>yMax) yMax=p.y;
  }
  return { keypoints, box: { xMin, yMin, xMax, yMax } };
}

// -- Fallback detector: skin-tone/edge based bounding ellipse --
// Not as accurate as TF.js, but always works offline. Enough to compute
// rough face proportions when the user faces the camera.
function fallbackDetect(source) {
  const w = source.videoWidth || source.width || 640;
  const h = source.videoHeight || source.height || 480;
  const cw = 160, ch = Math.round(cw * h / w);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;
  let sx=0,sy=0,n=0, minX=cw, minY=ch, maxX=0, maxY=0;
  const cols = new Uint16Array(cw), rows = new Uint16Array(ch);
  for (let y=0; y<ch; y++) {
    for (let x=0; x<cw; x++) {
      const i = (y*cw+x)*4;
      const r=data[i], g=data[i+1], b=data[i+2];
      if (isSkin(r,g,b)) {
        sx+=x; sy+=y; n++;
        cols[x]++; rows[y]++;
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
      }
    }
  }
  if (n < 200) return null;
  const cx = sx/n, cy = sy/n;
  const scaleX = w/cw, scaleY = h/ch;
  const bx1 = minX*scaleX, by1 = minY*scaleY, bx2 = maxX*scaleX, by2 = maxY*scaleY;
  // Sample landmark-ish keypoints from row/col histograms
  const widthAt = (yFrac) => {
    const yi = Math.round(minY + (maxY-minY)*yFrac);
    // scan that row's skin extents by re-checking data
    let l=maxX, r=minX;
    for (let x=minX; x<=maxX; x++) {
      const i=(yi*cw+x)*4;
      if (isSkin(data[i],data[i+1],data[i+2])) { if (x<l) l=x; if (x>r) r=x; }
    }
    return { l:l*scaleX, r:r*scaleX, y: yi*scaleY };
  };
  const foreheadRow = widthAt(0.10);
  const cheekRow = widthAt(0.45);
  const jawRow = widthAt(0.85);
  const chinRow = widthAt(0.95);
  const keypoints = [
    { x: foreheadRow.l, y: foreheadRow.y, name: 'foreheadL' },
    { x: foreheadRow.r, y: foreheadRow.y, name: 'foreheadR' },
    { x: cheekRow.l,    y: cheekRow.y,    name: 'cheekL' },
    { x: cheekRow.r,    y: cheekRow.y,    name: 'cheekR' },
    { x: jawRow.l,      y: jawRow.y,      name: 'jawL' },
    { x: jawRow.r,      y: jawRow.y,      name: 'jawR' },
    { x: (chinRow.l+chinRow.r)/2, y: chinRow.y, name: 'chin' },
    { x: (foreheadRow.l+foreheadRow.r)/2, y: minY*scaleY, name: 'foreheadTop' },
    { x: cx*scaleX, y: cy*scaleY, name: 'center' },
  ];
  return {
    keypoints,
    box: { xMin: bx1, yMin: by1, xMax: bx2, yMax: by2 },
    fallback: true,
  };
}

function isSkin(r,g,b) {
  // Simple skin heuristic in RGB.
  return r>60 && g>40 && b>20 &&
         Math.abs(r-g)>10 &&
         r>g && r>b &&
         (Math.max(r,g,b) - Math.min(r,g,b)) > 15;
}
