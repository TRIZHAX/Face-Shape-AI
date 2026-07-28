// UI helpers: rendering shape visuals, recommendation cards, metrics, etc.
import { recordRating, put, del, getAll } from './storage.js';

export const SHAPE_SVGS = {
  oval:      '<svg viewBox="0 0 100 120"><ellipse cx="50" cy="60" rx="30" ry="50" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  round:     '<svg viewBox="0 0 100 120"><ellipse cx="50" cy="60" rx="42" ry="45" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  square:    '<svg viewBox="0 0 100 120"><rect x="15" y="15" width="70" height="90" rx="14" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  rectangle: '<svg viewBox="0 0 100 120"><rect x="20" y="8" width="60" height="104" rx="14" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  oblong:    '<svg viewBox="0 0 100 120"><ellipse cx="50" cy="60" rx="25" ry="55" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  heart:     '<svg viewBox="0 0 100 120"><path d="M20 25 Q50 12 80 25 Q80 60 50 108 Q20 60 20 25 Z" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  diamond:   '<svg viewBox="0 0 100 120"><polygon points="50,10 82,60 50,110 18,60" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
  triangle:  '<svg viewBox="0 0 100 120"><path d="M32 12 Q50 8 68 12 Q80 60 82 105 L18 105 Q20 60 32 12 Z" fill="none" stroke="url(#gr)" stroke-width="3"/></svg>',
};
const SVG_GRAD = '<defs><linearGradient id="gr" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>';

export function renderShapeVisual(container, shape) {
  const inner = SHAPE_SVGS[shape] || SHAPE_SVGS.oval;
  container.innerHTML = inner.replace('<svg ', `<svg xmlns='http://www.w3.org/2000/svg' `).replace('>', '>' + SVG_GRAD);
}

export function renderMetrics(container, m) {
  const items = [
    { label:'Facial Ratio', value: m.facialRatio.toFixed(2), bar: Math.min(1, m.facialRatio / 2) },
    { label:'Symmetry', value: (m.symmetry*100).toFixed(0) + '%', bar: m.symmetry },
    { label:'Jaw Angle', value: m.jawAngle.toFixed(0) + '°', bar: Math.min(1, m.jawAngle/60) },
    { label:'Face Width', value: m.faceWidth.toFixed(0), bar: Math.min(1, m.faceWidth/500) },
    { label:'Face Height', value: m.faceHeight.toFixed(0), bar: Math.min(1, m.faceHeight/600) },
    { label:'Forehead W', value: m.foreheadWidth.toFixed(0), bar: m.foreheadWidth/m.faceWidth },
    { label:'Cheekbone W', value: m.cheekboneWidth.toFixed(0), bar: m.cheekboneWidth/m.faceWidth },
    { label:'Jaw Width', value: m.jawWidth.toFixed(0), bar: m.jawWidth/m.faceWidth },
    { label:'Chin Width', value: m.chinWidth.toFixed(0), bar: m.chinWidth/m.faceWidth },
  ];
  container.innerHTML = items.map(i => `
    <div class="metric">
      <div class="metric-label">${i.label}</div>
      <div class="metric-value">${i.value}</div>
      <div class="metric-bar"><span style="width:${Math.max(4, Math.min(100, i.bar*100))}%"></span></div>
    </div>
  `).join('');
}

export function hairstyleCard(h, opts={}) {
  const badge = h.matchScore != null
    ? `<span class="match-badge">${Math.round(h.matchScore*100)}% match</span>` : '';
  const tags = (h.tags||[]).slice(0,3).map(t => `<span class="tag">${t}</span>`).join('');
  const stars = [1,2,3,4,5].map(n => `<button data-star="${n}" aria-label="${n} stars">★</button>`).join('');
  const fav = opts.isFavorite ? 'on' : '';
  return `
    <article class="reco-card glass" data-id="${h.id}">
      ${badge}
      <div class="reco-thumb">${hairstyleThumb(h.id)}</div>
      <div>
        <div class="reco-title">${h.name}</div>
        <div class="reco-sub">${h.length} · ${h.gender==='any'?'unisex':h.gender}</div>
      </div>
      <div class="reco-tags">${tags}</div>
      <div class="reco-actions">
        <button class="btn like-btn" data-action="like" aria-label="Like">👍</button>
        <button class="btn dislike-btn" data-action="dislike" aria-label="Dislike">👎</button>
        <button class="btn fav-btn ${fav}" data-action="fav" aria-label="Favorite">♥</button>
        <span class="rate-stars" role="group" aria-label="Rate">${stars}</span>
      </div>
    </article>
  `;
}

// Simple stylized SVG thumbs per id, so no external images are needed.
export function hairstyleThumb(id) {
  const map = {
    buzz:       silhouette('M30 60 Q50 32 70 60'),
    crew:       silhouette('M28 58 Q50 24 72 58'),
    ivyleague:  silhouette('M28 58 Q42 22 70 40'),
    fadepomp:   silhouette('M28 60 Q42 8 66 40 Q72 30 78 46'),
    sidepart:   silhouette('M28 56 Q42 22 74 34'),
    quiff:      silhouette('M28 58 Q40 14 60 20 Q72 34 76 52'),
    undercut:   silhouette('M28 60 L28 42 Q42 14 72 34 L72 60'),
    slickback:  silhouette('M28 58 Q52 30 84 44'),
    french:     silhouette('M28 56 Q40 26 60 30 Q68 32 72 52'),
    caesar:     silhouette('M26 54 Q38 30 62 32 Q72 34 74 52'),
    texturedcrop:silhouette('M28 56 Q34 30 48 30 Q60 30 72 48'),
    longwave:   silhouette('M22 76 Q26 30 50 22 Q76 30 78 78'),
    shag:       silhouette('M22 74 Q28 32 50 26 Q74 34 78 74'),
    bob:        silhouette('M24 68 Q30 34 50 30 Q72 32 76 68'),
    longbob:    silhouette('M22 74 Q30 32 50 28 Q72 32 78 74'),
    pixie:      silhouette('M28 52 Q42 22 70 34'),
    longlayers: silhouette('M20 90 Q26 32 50 24 Q78 32 80 90'),
    curtainbangs:silhouette('M22 68 Q34 30 50 40 Q66 30 78 68'),
    blunt:      silhouette('M22 72 Q22 30 50 26 Q78 30 78 72 L78 76 L22 76 Z'),
    afro:       silhouette('M18 60 Q18 22 50 20 Q82 22 82 60 Z'),
    twistout:   silhouette('M20 60 Q22 26 50 22 Q80 26 80 60 Q78 68 22 68 Z'),
    braids:     silhouette('M24 90 Q28 30 50 24 Q72 30 76 90'),
    manbun:     silhouette('M28 58 Q40 30 60 30 Q72 30 72 40 Q64 30 56 24 Q52 22 50 20'),
    middlepart: silhouette('M22 70 Q30 30 50 30 L50 62 M50 30 Q70 30 78 70'),
    wolfcut:    silhouette('M22 76 Q30 28 50 24 Q72 30 78 76 M40 50 Q50 44 60 50'),
  };
  return map[id] || silhouette('M28 58 Q50 26 72 58');
}

function silhouette(pathD) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    <ellipse cx="50" cy="66" rx="18" ry="24" fill="rgba(255,255,255,0.10)"/>
    <path d="${pathD}" fill="none" stroke="url(#hg)" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
}

export function renderPicks(container, picks) {
  const items = [
    ['Best Fade', picks.fade, 'FADE'],
    ['Best Taper', picks.taper, 'TAPER'],
    ['Best Beard', picks.beard, 'BEARD'],
    ['Best Side Part', picks.side, 'SIDE'],
    ['Best Middle Part', picks.middle, 'MIDDLE'],
  ];
  container.innerHTML = items.map(([label, val, kind]) =>
    `<li><span class="kind">${kind}</span><strong>${label}:</strong><span style="margin-left:8px">${val||'—'}</span></li>`
  ).join('');
}
export function renderAvoid(container, list) {
  container.innerHTML = list.map(t => `<li><span class="kind">AVOID</span>${t}</li>`).join('') || '<li class="muted">Nothing specific to avoid.</li>';
}

export function renderCare(container, care) {
  container.innerHTML = `
    <div><h4>Routine</h4><ul>${care.routine.map(x=>`<li>${x}</li>`).join('')}</ul></div>
    <div><h4>Daily Styling Tips</h4><ul>${care.styling.map(x=>`<li>${x}</li>`).join('')}</ul></div>
  `;
}
export function renderProducts(container, care, colors) {
  container.innerHTML = `
    <div><h4>Recommended Products</h4><ul>${care.products.map(x=>`<li>${x}</li>`).join('')}</ul></div>
    <div><h4>Hair Color Suggestions</h4><ul>${colors.map(x=>`<li>${x}</li>`).join('')}</ul></div>
  `;
}

export async function bindCardActions(root, ctx) {
  const favs = await getAll('favorites');
  const favSet = new Set(favs.map(f => f.id));
  root.querySelectorAll('.reco-card').forEach(card => {
    const id = card.dataset.id;
    if (favSet.has(id)) card.querySelector('.fav-btn')?.classList.add('on');
    card.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      const star = btn.dataset.star ? Number(btn.dataset.star) : null;
      if (action === 'like' || action === 'dislike') {
        await recordRating(id, action, ctx.shape);
        toast(action==='like'?'Liked — recommendations updated':'Disliked — noted');
        ctx.onFeedback?.();
      } else if (action === 'fav') {
        if (favSet.has(id)) { await del('favorites', id); favSet.delete(id); btn.classList.remove('on'); toast('Removed from favorites'); }
        else { await put('favorites', { id, savedAt: Date.now() }); favSet.add(id); btn.classList.add('on'); toast('Saved to favorites'); }
        ctx.onFavChange?.();
      } else if (star) {
        await recordRating(id, 'rate', ctx.shape, star);
        card.querySelectorAll('.rate-stars button').forEach((b,i) => b.classList.toggle('on', i < star));
        toast(`Rated ${star}/5 — learning`);
        ctx.onFeedback?.();
      }
    });
  });
}

export function toast(msg, type='') {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(6px)'; }, 2600);
  setTimeout(() => el.remove(), 3100);
}
