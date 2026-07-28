// Face shape analyzer. Given a detection result (keypoints + box) computes
// facial measurements, symmetry, and classifies into one of 8 shapes with a
// confidence score.

import { SHAPE_INFO } from './data/hairstyles.js';

// Key landmark indices for MediaPipe FaceMesh (468 pts). See:
// https://github.com/tensorflow/tfjs-models/blob/master/face-landmarks-detection
const IDX = {
  chin: 152,
  foreheadTop: 10,
  cheekL: 234, cheekR: 454,
  jawL: 172,  jawR: 397,
  foreheadL: 71, foreheadR: 301,
  midLeft: 93, midRight: 323,
  eyeL: 33, eyeR: 263,
};

function ptFromKp(kp, name) { return kp.find(p => p.name === name); }
function d(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }

export function measure(face) {
  if (!face) return null;
  const kp = face.keypoints;
  let forehead, cheek, jaw, chin, foreheadTop;
  if (face.fallback) {
    const fl = ptFromKp(kp,'foreheadL'), fr = ptFromKp(kp,'foreheadR');
    const cl = ptFromKp(kp,'cheekL'),    cr = ptFromKp(kp,'cheekR');
    const jl = ptFromKp(kp,'jawL'),      jr = ptFromKp(kp,'jawR');
    chin = ptFromKp(kp,'chin');
    foreheadTop = ptFromKp(kp,'foreheadTop');
    forehead = { l: fl, r: fr, w: d(fl,fr) };
    cheek    = { l: cl, r: cr, w: d(cl,cr) };
    jaw      = { l: jl, r: jr, w: d(jl,jr) };
  } else {
    const fl = kp[IDX.foreheadL], fr = kp[IDX.foreheadR];
    const cl = kp[IDX.cheekL],    cr = kp[IDX.cheekR];
    const jl = kp[IDX.jawL],      jr = kp[IDX.jawR];
    chin = kp[IDX.chin];
    foreheadTop = kp[IDX.foreheadTop];
    forehead = { l: fl, r: fr, w: d(fl,fr) };
    cheek    = { l: cl, r: cr, w: d(cl,cr) };
    jaw      = { l: jl, r: jr, w: d(jl,jr) };
  }
  const faceH = d(foreheadTop, chin);
  const faceW = cheek.w;
  const chinW = jaw.w * 0.55;
  const foreheadH = d(foreheadTop, { x:(cheek.l.x+cheek.r.x)/2, y:(cheek.l.y+cheek.r.y)/2 }) * 0.6;

  // symmetry: compare left/right widths at forehead/cheek/jaw around center X
  const centerX = (cheek.l.x + cheek.r.x) / 2;
  const asym = (
    Math.abs((forehead.r.x - centerX) - (centerX - forehead.l.x)) +
    Math.abs((cheek.r.x    - centerX) - (centerX - cheek.l.x)) +
    Math.abs((jaw.r.x      - centerX) - (centerX - jaw.l.x))
  ) / (faceW * 3);
  const symmetry = Math.max(0, Math.min(1, 1 - asym));

  // Jawline angle proxy: angle between jaw-line and horizontal
  const jawAngle = Math.abs(Math.atan2(chin.y - jaw.l.y, chin.x - jaw.l.x) * 180 / Math.PI);

  const ratio = faceH / faceW; // face length / width

  return {
    faceWidth: faceW,
    faceHeight: faceH,
    foreheadWidth: forehead.w,
    jawWidth: jaw.w,
    chinWidth: chinW,
    cheekboneWidth: cheek.w,
    foreheadHeight: foreheadH,
    symmetry,           // 0..1
    jawAngle,           // degrees
    facialRatio: ratio, // height/width
  };
}

export function classify(m) {
  if (!m) return { shape: 'oval', confidence: 0, scores: {} };
  const w = m.faceWidth || 1;
  const F = m.foreheadWidth / w;
  const C = m.cheekboneWidth / w;
  const J = m.jawWidth / w;
  const R = m.facialRatio;

  // heuristic scoring per shape
  const s = {
    oval:      score([R>1.35 && R<1.55, C>=F && C>=J, absDiff(F,J)<0.10]),
    round:     score([R<1.30, absDiff(C,J)<0.10, absDiff(F,J)<0.12]),
    square:    score([R<1.35, absDiff(F,J)<0.05, absDiff(C,J)<0.08, m.jawAngle<40]),
    rectangle: score([R>1.45, absDiff(F,J)<0.08, absDiff(C,J)<0.08]),
    oblong:    score([R>1.55, absDiff(F,J)<0.10]),
    heart:     score([F>J+0.05, C>J, R>1.30]),
    diamond:   score([C>F+0.03, C>J+0.03, R>1.30]),
    triangle:  score([J>F+0.05, J>=C, R>1.20]),
  };
  // Boost by symmetry a little
  Object.keys(s).forEach(k => { s[k] = Math.max(0.05, s[k]) * (0.85 + 0.15 * (m.symmetry||0.8)); });
  // Normalize to sum=1
  const sum = Object.values(s).reduce((a,b)=>a+b,0);
  const scores = Object.fromEntries(Object.entries(s).map(([k,v])=>[k, v/sum]));
  const shape = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
  const confidence = Math.min(0.98, Math.max(0.35, scores[shape] * 1.35));
  return { shape, confidence, scores };
}

function score(booleans) {
  return booleans.filter(Boolean).length / booleans.length;
}
function absDiff(a,b){ return Math.abs(a-b); }

export function shapeDescription(shape) {
  return SHAPE_INFO[shape]?.desc || '';
}
