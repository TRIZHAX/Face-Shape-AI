// Main entry — orchestrates camera, detector, analyzer, recommender, UI.

import { Camera } from './camera.js';
import { initDetector, detect, isFallback } from './detector.js';
import { measure, classify, shapeDescription } from './analyzer.js';
import { recommend } from './recommender.js';
import {
  renderShapeVisual, renderMetrics, hairstyleCard,
  renderPicks, renderAvoid, renderCare, renderProducts, bindCardActions, toast
} from './ui.js';
import { registerRoute, initRouter, go } from './router.js';
import { getPrefs, setPrefs, put, del, getAll, clearAll, exportAll, importAll } from './storage.js';

const state = {
  lastAnalysis: null,     // { metrics, cls, imageDataUrl, timestamp }
  filters: { search: '', length: 'all' },
};

// ------- Prefs / theme -------
function applyPrefs() {
  const p = getPrefs();
  const theme = p.theme || 'dark';
  const resolved = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  document.body.classList.toggle('mirror', p.mirror !== false);
  document.body.classList.toggle('no-anim', p.animBg === false);

  // reflect in settings controls
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) themeSelect.value = theme;
  const animToggle = document.getElementById('animToggle');
  if (animToggle) animToggle.checked = p.animBg !== false;
  const mirrorToggle = document.getElementById('mirrorToggle');
  if (mirrorToggle) mirrorToggle.checked = p.mirror !== false;
  const hqToggle = document.getElementById('hqToggle');
  if (hqToggle) hqToggle.checked = p.hq !== false;
  const g = document.getElementById('genderSelect');
  if (g) g.value = p.gender || 'any';
  const h = document.getElementById('hairTypeSelect');
  if (h) h.value = p.hairType || 'any';
}

// ------- Camera + Scan -------
const videoEl = document.getElementById('video');
const overlay = document.getElementById('overlay');
const cameraEmpty = document.getElementById('cameraEmpty');
const scanAnim = document.getElementById('scanAnim');
const camera = new Camera(videoEl);

const btnStart = document.getElementById('startCam');
const btnSwitch = document.getElementById('switchCam');
const btnCapture = document.getElementById('captureBtn');
const btnRetake = document.getElementById('retakeBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');

function setProgress(pct, label) {
  progressWrap.hidden = false;
  progressBar.style.width = Math.round(pct*100) + '%';
  if (label) progressLabel.textContent = label;
  if (pct >= 1) setTimeout(() => { progressWrap.hidden = true; }, 800);
}

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  setProgress(0.05, 'Requesting camera…');
  try {
    const p = getPrefs();
    await camera.start({ hq: p.hq !== false });
    cameraEmpty.hidden = true;
    scanAnim.hidden = false;
    btnCapture.disabled = false;
    btnSwitch.disabled = camera.devices.length <= 1;
    setProgress(0.20, 'Loading AI model…');
    const { fallback } = await initDetector((p2, msg) => setProgress(0.20 + p2*0.75, msg));
    setProgress(1, fallback ? 'Ready (fallback mode)' : 'Ready — face the camera');
    if (fallback) toast('Model CDN unavailable — using on-device fallback detector', '');
  } catch (e) {
    toast('Camera access failed: ' + (e.message||e), 'error');
    btnStart.disabled = false;
    progressWrap.hidden = true;
  }
});

btnSwitch.addEventListener('click', async () => {
  try { await camera.switch(); toast('Camera switched'); }
  catch (e) { toast('Could not switch camera', 'error'); }
});

btnCapture.addEventListener('click', async () => {
  btnCapture.disabled = true;
  setProgress(0.1, 'Analyzing face…');
  try {
    const shot = camera.capture({ maxWidth: 1280 });
    setProgress(0.35, 'Detecting landmarks…');
    const face = await detect(videoEl);
    if (!face) {
      toast('No face detected — try better lighting & face the camera', 'error');
      btnCapture.disabled = false; progressWrap.hidden = true; return;
    }
    drawOverlay(face);
    setProgress(0.65, 'Measuring proportions…');
    const m = measure(face);
    if (!m) { toast('Analysis failed', 'error'); btnCapture.disabled = false; progressWrap.hidden = true; return; }
    setProgress(0.85, 'Classifying face shape…');
    const cls = classify(m);
    setProgress(1, 'Complete');

    state.lastAnalysis = {
      id: 'scan-' + Date.now(),
      timestamp: Date.now(),
      metrics: m,
      classification: cls,
      imageDataUrl: shot.dataUrl,
    };
    await put('history', state.lastAnalysis);

    btnRetake.hidden = false;
    await refreshResults();
    go('results');
  } catch (e) {
    toast('Analysis error: ' + (e.message||e), 'error');
    btnCapture.disabled = false; progressWrap.hidden = true;
  }
});

btnRetake.addEventListener('click', () => {
  btnRetake.hidden = true;
  btnCapture.disabled = false;
  overlay.getContext('2d').clearRect(0,0,overlay.width, overlay.height);
  go('scan');
});

function drawOverlay(face) {
  const v = videoEl;
  const rect = v.getBoundingClientRect();
  overlay.width = v.videoWidth || rect.width;
  overlay.height = v.videoHeight || rect.height;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0,0,overlay.width, overlay.height);
  ctx.strokeStyle = 'rgba(124,92,255,0.9)';
  ctx.lineWidth = 2;
  const b = face.box;
  ctx.strokeRect(b.xMin, b.yMin, b.xMax-b.xMin, b.yMax-b.yMin);
  ctx.fillStyle = 'rgba(34,211,238,0.9)';
  for (const p of face.keypoints.slice(0, 200)) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2); ctx.fill();
  }
}

// ------- Results -------
const resultsEmpty = document.getElementById('resultsEmpty');
const resultsView = document.getElementById('resultsView');
const recoGrid = document.getElementById('recoGrid');

async function refreshResults() {
  const a = state.lastAnalysis || (await getAll('history')).sort((x,y)=>y.timestamp-x.timestamp)[0];
  if (!a) { resultsEmpty.hidden = false; resultsView.hidden = true; return; }
  state.lastAnalysis = a;
  resultsEmpty.hidden = true; resultsView.hidden = false;

  const shape = a.classification.shape;
  renderShapeVisual(document.getElementById('shapeVisual'), shape);
  document.getElementById('shapeName').textContent = shape[0].toUpperCase() + shape.slice(1);
  document.getElementById('shapeDesc').textContent = shapeDescription(shape);
  document.getElementById('shapeConfidence').textContent = `Confidence · ${Math.round(a.classification.confidence*100)}%`;
  renderMetrics(document.getElementById('metricsGrid'), a.metrics);

  const res = await recommend(shape, {
    ...state.filters, gender: getPrefs().gender, hairType: getPrefs().hairType,
  });
  recoGrid.innerHTML = res.top10.map(h => hairstyleCard(h)).join('');
  await bindCardActions(recoGrid, { shape, onFeedback: refreshResults, onFavChange: refreshFavorites });

  renderPicks(document.getElementById('bestList'), res.picks);
  renderAvoid(document.getElementById('avoidList'), res.avoid);
  renderCare(document.getElementById('careBlock'), res.care);
  renderProducts(document.getElementById('productsBlock'), res.care, res.colors);
}

document.getElementById('hairSearch').addEventListener('input', (e) => {
  state.filters.search = e.target.value;
  refreshResults();
});
document.getElementById('hairFilter').addEventListener('change', (e) => {
  state.filters.length = e.target.value;
  refreshResults();
});

// ------- Favorites -------
const favoritesGrid = document.getElementById('favoritesGrid');
const favoritesEmpty = document.getElementById('favoritesEmpty');
async function refreshFavorites() {
  const favs = await getAll('favorites');
  if (!favs.length) { favoritesGrid.innerHTML = ''; favoritesEmpty.hidden = false; return; }
  favoritesEmpty.hidden = true;
  const { HAIRSTYLES } = await import('./data/hairstyles.js');
  const byId = Object.fromEntries(HAIRSTYLES.map(h => [h.id, h]));
  favoritesGrid.innerHTML = favs
    .map(f => byId[f.id]).filter(Boolean)
    .map(h => hairstyleCard(h, { isFavorite: true })).join('');
  const shape = state.lastAnalysis?.classification?.shape || 'oval';
  await bindCardActions(favoritesGrid, { shape, onFavChange: refreshFavorites, onFeedback: refreshFavorites });
}

// ------- History -------
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
async function refreshHistory() {
  const items = (await getAll('history')).sort((a,b)=>b.timestamp-a.timestamp);
  if (!items.length) { historyList.innerHTML=''; historyEmpty.hidden=false; return; }
  historyEmpty.hidden = true;
  historyList.innerHTML = items.map(it => {
    const s = it.classification.shape;
    const d = new Date(it.timestamp);
    return `<div class="history-item glass">
      <div class="history-thumb"><img alt="scan" src="${it.imageDataUrl||''}"/></div>
      <div class="history-meta">
        <h4>${s[0].toUpperCase()+s.slice(1)} · ${Math.round(it.classification.confidence*100)}%</h4>
        <p>${d.toLocaleString()} · ratio ${it.metrics.facialRatio.toFixed(2)}, symmetry ${(it.metrics.symmetry*100).toFixed(0)}%</p>
      </div>
      <div>
        <button class="btn" data-load="${it.id}">Load</button>
        <button class="btn btn-danger" data-del="${it.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  historyList.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', async () => {
    const it = items.find(x => x.id === b.dataset.load);
    if (it) { state.lastAnalysis = it; await refreshResults(); go('results'); }
  }));
  historyList.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    await del('history', b.dataset.del); toast('Deleted'); refreshHistory();
  }));
}

// ------- Settings -------
document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = getPrefs().theme || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  setPrefs({ theme: next });
  applyPrefs();
});
document.getElementById('themeSelect').addEventListener('change', (e) => { setPrefs({theme:e.target.value}); applyPrefs(); });
document.getElementById('animToggle').addEventListener('change', (e) => { setPrefs({animBg:e.target.checked}); applyPrefs(); });
document.getElementById('mirrorToggle').addEventListener('change', (e) => { setPrefs({mirror:e.target.checked}); applyPrefs(); });
document.getElementById('hqToggle').addEventListener('change', (e) => { setPrefs({hq:e.target.checked}); });
document.getElementById('genderSelect').addEventListener('change', (e) => { setPrefs({gender:e.target.value}); refreshResults(); });
document.getElementById('hairTypeSelect').addEventListener('change', (e) => { setPrefs({hairType:e.target.value}); refreshResults(); });

document.getElementById('exportData').addEventListener('click', async () => {
  const payload = await exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `faceshape-ai-backup-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Exported', 'success');
});
document.getElementById('importData').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  try {
    const text = await f.text();
    await importAll(JSON.parse(text));
    toast('Imported', 'success');
    refreshResults(); refreshFavorites(); refreshHistory();
  } catch (err) { toast('Invalid file', 'error'); }
});
document.getElementById('clearData').addEventListener('click', async () => {
  if (!confirm('Clear all local data? This cannot be undone.')) return;
  await clearAll();
  toast('All local data cleared', 'success');
  state.lastAnalysis = null;
  applyPrefs(); refreshResults(); refreshFavorites(); refreshHistory();
});

// ------- Routing -------
registerRoute('scan', () => {});
registerRoute('results', refreshResults);
registerRoute('favorites', refreshFavorites);
registerRoute('history', refreshHistory);
registerRoute('settings', () => {});
registerRoute('about', () => {});

// Keyboard shortcuts (accessibility)
document.addEventListener('keydown', (e) => {
  if (e.key === '1') go('scan');
  else if (e.key === '2') go('results');
  else if (e.key === '3') go('favorites');
  else if (e.key === '4') go('history');
});

// Init
applyPrefs();
initRouter('scan');
refreshResults();

// Warn if camera API missing
if (!navigator.mediaDevices?.getUserMedia) {
  toast('This browser lacks camera support', 'error');
  btnStart.disabled = true;
}
