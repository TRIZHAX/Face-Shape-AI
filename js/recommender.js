// Recommendation engine with a light on-device learning loop.
// Scores are computed from:
//   - shape compatibility (from catalog)
//   - user preferences (gender + hair type from settings)
//   - learned adjustments from previous ratings/likes/dislikes

import { HAIRSTYLES, AVOID_BY_SHAPE, BEST_PICKS, CARE_TIPS, COLOR_SUGGESTIONS } from './data/hairstyles.js';
import { getAll, getRating, getPrefs } from './storage.js';

const LEARN_WEIGHT = 1.5; // how strongly ratings affect ordering

export async function recommend(shape, opts = {}) {
  const prefs = getPrefs();
  const gender = opts.gender || prefs.gender || 'any';
  const hairType = opts.hairType || prefs.hairType || 'any';
  const search = (opts.search || '').toLowerCase().trim();
  const lengthFilter = opts.length || 'all';

  // load ratings map
  const ratingsArr = await getAll('ratings');
  const ratings = Object.fromEntries(ratingsArr.map(r => [r.id, r]));

  const scored = HAIRSTYLES
    .filter(h => matchesFilter(h, gender, hairType, search, lengthFilter))
    .map(h => {
      const base = (h.scores[shape] ?? 5) / 10; // 0..1
      const r = ratings[h.id];
      let bonus = 0;
      if (r) {
        // shape-specific learning
        const sr = (r.shapes && r.shapes[shape]) || null;
        const src = sr || r;
        const net = (src.likes||0) - (src.dislikes||0);
        const avg = src.count ? (src.sum/src.count - 3) / 2 : 0; // -1..1
        bonus = 0.08 * Math.tanh(net) + 0.10 * avg;
      }
      // preference alignment bonus
      let alignBonus = 0;
      if (gender !== 'any' && (h.gender === gender || h.gender === 'any')) alignBonus += 0.03;
      if (hairType !== 'any' && h.texture.includes(hairType)) alignBonus += 0.03;
      const score = Math.max(0, Math.min(1, base + LEARN_WEIGHT * bonus + alignBonus));
      return { ...h, matchScore: score };
    })
    .sort((a,b) => b.matchScore - a.matchScore);

  const top10 = scored.slice(0, 10);
  const best = scored[0] || null;
  const avoid = AVOID_BY_SHAPE[shape] || [];
  const picks = BEST_PICKS[shape] || {};
  const care = CARE_TIPS[hairType && hairType !== 'any' ? hairType : 'wavy'];
  const colors = COLOR_SUGGESTIONS[shape] || [];

  return { top10, best, avoid, picks, care, colors, shape, ratingsCount: ratingsArr.length };
}

function matchesFilter(h, gender, hairType, search, lengthFilter) {
  if (lengthFilter !== 'all' && h.length !== lengthFilter) return false;
  if (search) {
    const hay = (h.name + ' ' + h.tags.join(' ') + ' ' + h.desc).toLowerCase();
    if (!hay.includes(search)) return false;
  }
  if (gender && gender !== 'any' && h.gender !== 'any' && h.gender !== gender) {
    // still allow if strongly opposite preference? -> skip strict opposite
    if ((gender==='masc' && h.gender==='fem') || (gender==='fem' && h.gender==='masc')) return false;
  }
  return true;
}

// Utility for other modules
export async function getHairstyleWithRating(id) {
  const h = HAIRSTYLES.find(x => x.id === id);
  if (!h) return null;
  const r = await getRating(id);
  return { ...h, rating: r };
}

export { HAIRSTYLES };
