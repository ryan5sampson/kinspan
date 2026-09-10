/* Legacy scoring. Tune here -- play.html reads this, nothing else does.
 *
 * The shape is Wingspan-ish, and as of the bonus update it is Wingspan-ish in
 * one more way: a card on its own is worth a flat point, and EVERYTHING else
 * comes from the bonus cards in play. Marriage, descent and lineage used to be
 * hard-wired into every game; they are now three bonuses among two dozen, so a
 * game where nobody drafted them genuinely scores differently.
 */
window.RULES = {
  PRESENCE:     1,   // per card played -- the only unconditional points
  HAND_LIMIT:   7,
  OPENING_HAND: 3,
  BONUS_DEAL:   5,   // bonus cards offered at the start of a game
  BONUS_KEEP:   2,   // how many of them you keep
};

const NOW_Y = new Date().getFullYear();

/* ---- shared predicates ------------------------------------------------
 * Written against the fields ancestors.json actually carries. Every place
 * field is folded into one lowercase haystack, because a Utah connection is
 * a Utah connection whether it shows up as a birth, a death or a grave.   */
const born  = p => p.birth_year;
const ended = p => p.living ? NOW_Y : p.death_year;
function ageOf(p){
  if (p.age_at_death) return p.age_at_death;
  if (p.living && p.birth_year) return NOW_Y - p.birth_year;
  return null;
}
/* Only the three places a person actually WAS -- `places_lived` folds in
 * marriage venues too, which made a place card cover more people than the
 * ranking that priced it thought, and priced it a full tier too cheap. */
function placesOf(p){
  return [p.birth_place, p.death_place, p.burial_place]
    .filter(Boolean).join(' | ').toLowerCase();
}
const placeHas = (p, ...needles) => {
  const h = placesOf(p);
  return needles.some(n => h.includes(n));
};
/* Alive at any point in [a,b]. Someone with no death year is assumed to have
 * lived a normal span rather than forever, or every open-ended record would
 * qualify for every modern event. */
function aliveDuring(p, a, b){
  const s = born(p); if (!s) return false;
  const e = ended(p) || (s + 85);
  return s <= b && e >= a;
}
function first(p){ return (p.given || p.name || '').split(' ')[0]; }
function short(p){
  if (!p) return '?';
  return first(p) + ' ' + (p.surname || '').charAt(0) + '.';
}

/* A bonus scores a context: {played, ids, byId, has}. It returns points and
 * the people it counted, so the sidebar can show WHY -- a bonus you can't see
 * the workings of is just a number that moves on its own. */
function perPerson(test, pts){
  return ctx => {
    const hits = ctx.played.filter(test);
    return { pts: hits.length * pts, hits: hits.map(p => p.id),
             detail: hits.map(short).join(', ') };
  };
}
/* Score sets of played people who share a value: each group of n is worth
 * (n-1) x pts, so the first one is setup and every one after it pays. */
function perGroup(keyOf, pts, label){
  return ctx => {
    const g = {};
    for (const p of ctx.played){
      const k = keyOf(p); if (!k) continue;
      (g[k] = g[k] || []).push(p);
    }
    let total = 0; const hits = [], detail = [];
    for (const k of Object.keys(g)){
      if (g[k].length < 2) continue;
      total += (g[k].length - 1) * pts;
      g[k].forEach(p => hits.push(p.id));
      detail.push(`${label(k)} ×${g[k].length}`);
    }
    return { pts: total, hits, detail: detail.join(', ') };
  };
}

/* ---- more shared predicates ------------------------------------------ */
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function birthMonth(p){
  const m = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/.exec((p.birth_date||'').toUpperCase());
  return m ? m[1] : null;
}
function parts(str){ return String(str||'').split(',').map(x=>x.trim()).filter(Boolean); }
function townOf(p){ return (parts(p.birth_place)[0] || '').toLowerCase() || null; }
function marriagesOf(p, byId){
  return (p.marriages||[]).map(m => ({...m, sp: byId[m.spouse_id]})).filter(m => m.sp);
}
/* Longest marriage in years, measured to whichever of them died first. */
function marriageYears(p, byId){
  let best = null;
  for (const m of marriagesOf(p, byId)){
    if (!m.year) continue;
    const e = Math.min(ended(p) || 9999, ended(m.sp) || 9999);
    if (e < 9000) best = Math.max(best ?? 0, e - m.year);
  }
  return best;
}
function marriedAges(p){
  return (p.marriages||[]).filter(m=>m.year && p.birth_year).map(m=>m.year - p.birth_year);
}
function rootOf(byId){ return Object.values(byId).find(p=>p.relationship_to_root==='self'); }

window.BONUSES = [
  /* ---- era: what they lived through ---------------------------------- */
  { id:'great_war', group:'Era', name:'The Great War', per:'1 each',
    blurb:'Born 1874–1900. Old enough to be sent.',
    score: perPerson(p => born(p) && born(p) >= 1874 && born(p) <= 1900, 1) },

  { id:'depression_kid', group:'Era', name:'Grew Up On Nothing', per:'3 each',
    blurb:'Born 1915–1939. They told you about it. Often.',
    score: perPerson(p => born(p) && born(p) >= 1915 && born(p) <= 1939, 3) },

  { id:'home_front', group:'Era', name:'Home Front', per:'2 each',
    blurb:'Born 1900–1927. Grown by the second war.',
    score: perPerson(p => born(p) && born(p) >= 1900 && born(p) <= 1927, 2) },

  { id:'two_centuries', group:'Era', name:'Two Centuries', per:'2 each',
    blurb:'Born in the 1800s, still here in 1950.',
    score: perPerson(p => born(p) && born(p) < 1900 && (ended(p) || 0) >= 1950, 2) },

  { id:'moonshot', group:'Era', name:'Watched The Moon Landing', per:'2 each',
    blurb:'Born before 1930, alive in 1969. Had opinions about it.',
    score: perPerson(p => born(p) && born(p) < 1930 && (ended(p) || 0) >= 1969, 2) },

  { id:'millennium', group:'Era', name:'Survived Y2K', per:'1 each',
    blurb:'Still here on New Year\'s Day, 2000.',
    score: perPerson(p => (ended(p) || 0) >= 2000, 1) },

  { id:'winter', group:'Era', name:'Born In The Cold', per:'2 each',
    blurb:'A November to February baby. Do the maths.',
    score: perPerson(p => ['NOV','DEC','JAN','FEB'].includes(birthMonth(p)), 2) },

  /* ---- who they were to you ------------------------------------------ */
  { id:'never_met', group:'Ancestry', name:'Never Had The Pleasure', per:'1 each',
    blurb:'Gone before you were born. Most of them.',
    score(ctx){
      const r = rootOf(ctx.byId); if (!r || !r.birth_year) return { pts:0, hits:[], detail:'' };
      const hits = ctx.played.filter(p => p.id !== r.id && (ended(p) || 9999) < r.birth_year);
      return { pts: hits.length, hits: hits.map(p=>p.id), detail: hits.map(short).join(', ') };
    } },

  { id:'living_memory', group:'Ancestry', name:'You Actually Met Them', per:'1 each',
    blurb:'Alive at the same time as you.',
    score(ctx){
      const r = rootOf(ctx.byId); if (!r || !r.birth_year) return { pts:0, hits:[], detail:'' };
      const hits = ctx.played.filter(p => p.id !== r.id && (ended(p) || 0) >= r.birth_year);
      return { pts: hits.length, hits: hits.map(p=>p.id), detail: hits.map(short).join(', ') };
    } },

  { id:'the_ancients', group:'Ancestry', name:'The Ancients', per:'5 each',
    blurb:'The three earliest-born Kin. The end of the paper trail.',
    score(ctx){
      const oldest = Object.values(ctx.byId).filter(born).sort((a,b)=>born(a)-born(b))
        .slice(0,3).map(p=>p.id);
      const hits = ctx.played.filter(p => oldest.includes(p.id));
      return { pts: hits.length * 5, hits: hits.map(p=>p.id), detail: hits.map(short).join(', ') };
    } },

  { id:'namesakes', group:'Ancestry', name:'Naming Is Hard', per:'4 per extra',
    blurb:'Two Kin, one first name.',
    score: perGroup(p => first(p), 4, k => k) },

  { id:'initials', group:'Ancestry', name:'Monogrammed', per:'3 per extra',
    blurb:'Two Kin, the same initials. Handy for towels.',
    score: perGroup(p => ((p.given||' ')[0] + (p.surname||' ')[0]).toUpperCase().trim() || null,
                    3, k => k) },

  /* ---- love and its consequences ------------------------------------- */
  { id:'long_marriage', group:'Marriage', name:'Fifty Years Of This', per:'1 each',
    blurb:'Married fifty years or more.',
    score(ctx){
      const hits = ctx.played.filter(p => (marriageYears(p, ctx.byId) || 0) >= 50);
      return { pts: hits.length, hits: hits.map(p=>p.id), detail: hits.map(short).join(', ') };
    } },

  { id:'young_love', group:'Marriage', name:'What Was The Rush', per:'1 each',
    blurb:'Married before 22. Different times.',
    score: perPerson(p => marriedAges(p).some(a => a > 0 && a < 22), 1) },

  { id:'age_gap', group:'Marriage', name:'People Talked', per:'4 each',
    blurb:'Married someone eight years apart. People talked.',
    score(ctx){
      const hits = ctx.played.filter(p => marriagesOf(p, ctx.byId).some(m =>
        p.birth_year && m.sp.birth_year && Math.abs(p.birth_year - m.sp.birth_year) >= 8));
      return { pts: hits.length * 4, hits: hits.map(p=>p.id), detail: hits.map(short).join(', ') };
    } },

  { id:'outlived', group:'Marriage', name:'Carried On Without Them', per:'5 each',
    blurb:'Outlived their husband or wife by fifteen years.',
    score(ctx){
      const hits = ctx.played.filter(p => marriagesOf(p, ctx.byId).some(m =>
        ended(m.sp) && ended(p) && ended(p) - ended(m.sp) >= 15));
      return { pts: hits.length * 5, hits: hits.map(p=>p.id), detail: hits.map(short).join(', ') };
    } },

  { id:'big_family', group:'Marriage', name:'Full House', per:'4 each',
    blurb:'Four or more children. Somebody was tired.',
    score: perPerson(p => (p.child_count ?? p.children_in_tree ?? 0) >= 4, 4) },

  /* ---- a life: how it went ------------------------------------------- */
  { id:'long_life', group:'A life', name:'Good Genes', per:'1 each',
    blurb:'Made it to 80.',
    score: perPerson(p => (ageOf(p) || 0) >= 80, 1) },

  { id:'venerable', group:'A life', name:'Absolute Unit', per:'5 each',
    blurb:'Made it to 90. Outlasted the doubters.',
    score: perPerson(p => (ageOf(p) || 0) >= 90, 5) },

  { id:'taken_early', group:'A life', name:'Gone Too Soon', per:'4 each',
    blurb:'Died before 60. The living never count.',
    score: perPerson(p => !p.living && p.age_at_death && p.age_at_death < 60, 4) },

  { id:'rest_together', group:'A life', name:'Neighbours Forever', per:'2 per extra',
    blurb:'Resting in the same ground. Each one after the first counts.',
    score: perGroup(p => p.burial_place, 2, k => k.split(',')[0]) },

  /* ---- the family: what used to be hard-wired ------------------------- */
  { id:'wedded', group:'Family', name:'Wedded', per:'2 per couple',
    blurb:'Both halves of a marriage, connected.',
    score(ctx){
      const seen = new Set(); const detail = [], hits = [];
      for (const p of ctx.played) for (const sid of (p.spouse_ids || [])){
        if (!ctx.has(sid)) continue;
        const k = [p.id, sid].sort().join('|'); if (seen.has(k)) continue;
        seen.add(k); hits.push(p.id, sid);
        detail.push(`${short(p)} + ${short(ctx.byId[sid])}`);
      }
      return { pts: seen.size * 2, hits, detail: detail.join(', ') };
    } },

  { id:'descent', group:'Family', name:'Descent', per:'1 per link',
    blurb:'A parent and child, both connected.',
    score(ctx){
      let n = 0; const detail = [], hits = [];
      for (const p of ctx.played) for (const pid of (p.parent_ids || [])){
        if (!ctx.has(pid)) continue;
        n++; hits.push(p.id, pid);
        detail.push(`${short(ctx.byId[pid])} → ${short(p)}`);
      }
      return { pts: n, hits, detail: detail.join(', ') };
    } },

  { id:'lineage', group:'Family', name:'Lineage', per:'3 / 9 / 27', big:true,
    blurb:'Your longest unbroken line. Only the deepest one counts.',
    score(ctx){
      let best = null;
      for (const ch of maximalChains(ctx.played, ctx.ids))
        if (!best || ch.length > best.length) best = ch;
      if (!best || best.length < 3) return { pts: 0, hits: [],
        detail: best ? `longest run is ${best.length} — needs 3` : '' };
      const pts = Math.pow(3, best.length - 2);
      return { pts, hits: best,
               detail: `${best.length} gens: ${best.map(id => short(ctx.byId[id])).join(' → ')}` };
    } },

  { id:'direct_line', group:'Family', name:'Straight Up', per:'3 each', big:true,
    blurb:'Walk back from yourself, parent by parent. One gap ends the line.',
    score(ctx){
      const root = ctx.played.find(p => p.relationship_to_root === 'self');
      if (!root) return { pts: 0, hits: [], detail: 'You are not on the table yet.' };
      const seen = new Set([root.id]); const q = [root.id]; const reached = [];
      while (q.length){
        const cur = ctx.byId[q.shift()];
        for (const pid of (cur.parent_ids || [])){
          if (!ctx.has(pid) || seen.has(pid)) continue;
          seen.add(pid); q.push(pid); reached.push(pid);
        }
      }
      return { pts: reached.length * 3, hits: [root.id, ...reached],
               detail: reached.map(id => short(ctx.byId[id])).join(', ') };
    } },

  { id:'balanced', group:'Family', name:'No Favourites', per:'1 per pair',
    blurb:'You count the smaller side of the family. Keep it even.',
    score(ctx){
      const pat = ctx.played.filter(p => p.relationship_side === 'paternal');
      const mat = ctx.played.filter(p => p.relationship_side === 'maternal');
      const n = Math.min(pat.length, mat.length);
      return { pts: n, hits: pat.concat(mat).map(p => p.id),
               detail: `${pat.length} paternal · ${mat.length} maternal → ${n} pairs` };
    } },

  { id:'generation', group:'Family', name:'Same Remove', per:'1 each, +8 complete',
    blurb:'Your fullest step of the ladder. All of it is worth 8 more.',
    score(ctx){
      const need = {}, got = {};
      for (const p of Object.values(ctx.byId)) if (p.generation != null)
        need[p.generation] = (need[p.generation] || 0) + 1;
      for (const p of ctx.played) if (p.generation != null)
        got[p.generation] = (got[p.generation] || 0) + 1;
      let best = null;
      for (const g of Object.keys(got)) if (!best || got[g] > got[best]) best = g;
      if (best == null) return { pts: 0, hits: [], detail: '' };
      const done = got[best] === need[best] && need[best] > 1;
      const hits = ctx.played.filter(p => String(p.generation) === best).map(p => p.id);
      return { pts: got[best] + (done ? 8 : 0), hits,
               detail: `${got[best]} of ${need[best]} at generation ${best}`
                       + (done ? ' — complete, +8' : '') };
    } },
];

/* ---- bonuses that read YOUR tree -------------------------------------
 * Everything above works on any family. These are built from the loaded
 * people at run time, so "everyone from Ogden" on this tree becomes
 * "everyone from Cork" or "everyone from Guadalajara" on somebody else's --
 * the card is the same idea, bound to whatever place that family actually
 * came from. Call buildBonuses(people) once the data is in.            */
/* How many PEOPLE each place token touches. It must read exactly the fields
 * placeHas() searches, or the ranking and the card's own predicate disagree --
 * which is how "United States" once ranked below "Utah" and a card that 87% of
 * the tree qualified for got dealt as if it were selective. */
function tokenCounts(people){
  const c = new Map(), label = new Map();
  for (const p of people){
    const seen = new Map();
    for (const f of ['birth_place','death_place','burial_place'])
      for (const t of parts(p[f])) seen.set(t.toLowerCase(), t);
    for (const [k, disp] of seen){
      c.set(k, (c.get(k)||0) + 1);
      if (!label.has(k)) label.set(k, disp);   // match lowercase, DISPLAY as written
    }
  }
  return [...c.entries()].sort((a,b)=>b[1]-a[1])
    .map(([k, n]) => ({ key:k, n, name:label.get(k) }));
}

window.buildBonuses = function (people){
  const dyn = [];
  const n = people.length || 1;
  const ranked = tokenCounts(people);

  /* A place card wants to be selective: the country everyone shares is not a
   * card, and neither is a hamlet two people passed through. 12%-60% of the
   * tree is the band where choosing it is actually a decision. */
  const regions = ranked.filter(r => r.n >= 3 && r.n/n >= 0.12 && r.n/n <= 0.6);
  const claimed = new Set();
  const add = (id, group, name, per, blurb, test, pts) =>
    dyn.push({ id, group, name, per, blurb, dynamic: true, score: perPerson(test, pts) });
  const rate = r => r.n/n;
  // Points per person, tuned so a place card lands near the ~7-point average
  // the rest of the set sits at whatever slice of the tree it happens to cover.
  const tier = r => rate(r) >= 0.4 ? 1 : rate(r) >= 0.24 ? 2 : 3;

  /* "Got Out" hangs off the BROADEST place in the tree, not a selective one --
   * pegged to a mid-sized token it fires on most of the deck and becomes the
   * best card in the game by a factor of four. Leaving the country you all
   * come from is rare, which is the entire point of the card. */
  const broad = ranked[0];
  if (broad){
    add('left_home', 'Place', 'Got Out', '4 each',
        `Born outside ${broad.name}. Somebody had to leave.`,
        p => p.birth_place && !p.birth_place.toLowerCase().includes(broad.key), 4);
  }

  const R = [regions[0], regions[1], regions[2]];
  R.forEach(r => r && claimed.add(r.key));
  if (R[0]) add('home_region', 'Place', `Practically ${R[0].name}`,
        `${tier(R[0])} each`,
        `Born, died or resting in ${R[0].name}.`,
        p => placeHas(p, R[0].key), tier(R[0]));
  if (R[1]) add('second_region', 'Place', `The ${R[1].name} Branch`,
        `${tier(R[1])} each`,
        `A ${R[1].name} connection.`,
        p => placeHas(p, R[1].key), tier(R[1]));
  if (R[2]) add('third_region', 'Place', `Something About ${R[2].name}`,
        `${tier(R[2])} each`,
        `A ${R[2].name} connection. They kept ending up there.`,
        p => placeHas(p, R[2].key), tier(R[2]));

  // The single most common birthplace, at town level.
  const towns = new Map();
  for (const p of people){ const t = townOf(p); if (t) towns.set(t, (towns.get(t)||0)+1); }
  const top = [...towns.entries()].filter(([t])=>!claimed.has(t))
    .sort((a,b)=>b[1]-a[1])[0];
  if (top && top[1] >= 3){
    const label = parts(people.find(p => townOf(p) === top[0]).birth_place)[0];
    const pts = top[1] >= 8 ? 2 : top[1] >= 5 ? 3 : 5;
    add('hometown', 'Place', `Everyone From ${label}`, `${pts} each`,
        `Born in ${label} itself. The dot they kept returning to.`,
        p => townOf(p) === top[0], pts);
  }

  /* Two people born in the same town a lifetime apart -- the family that
   * never moved. Works anywhere, because the town comes from the data. */
  dyn.push({ id:'never_left', group:'Place', name:'Never Left', per:'8 per town',
    dynamic: true,
    blurb:'Two Kin, same town, 40 years apart. Some families stay.',
    score(ctx){
      const g = {};
      for (const p of ctx.played){ const t = townOf(p); if (t && born(p)) (g[t] = g[t]||[]).push(p); }
      let pts = 0; const hits = [], detail = [];
      for (const t of Object.keys(g)){
        const ys = g[t].map(born);
        if (g[t].length < 2 || Math.max(...ys) - Math.min(...ys) < 40) continue;
        pts += 8; g[t].forEach(p => hits.push(p.id));
        detail.push(`${parts(g[t][0].birth_place)[0]} — ${Math.min(...ys)} and ${Math.max(...ys)}`);
      }
      return { pts, hits, detail: detail.join(', ') };
    } });

  window.BONUSES = window.BONUSES.filter(b => !b.dynamic).concat(dyn);
  window.BONUS_BY_ID = Object.fromEntries(window.BONUSES.map(b => [b.id, b]));
  return window.BONUSES;
};

window.BONUS_BY_ID = Object.fromEntries(window.BONUSES.map(b => [b.id, b]));

/* ---- game settings ----------------------------------------------------
 * One object, saved to localStorage, read by /play and edited at /settings.
 * Everything about how bonuses reach the table lives here; the bonuses
 * themselves don't know or care which mode dealt them.
 *
 * BASELINE is the old hard-wired scoring: a point per parent-child link, two
 * per married couple, and the compounding longest line. With `defaults` on
 * they are always active AND removed from the draftable pool, so you can
 * never draft a card you are already scoring.                             */
window.BASELINE = ['descent', 'wedded', 'lineage'];

window.DEFAULT_SETTINGS = {
  defaults:    true,     // BASELINE always on
  selection:  'draft',   // 'draft' (deal N keep K) | 'all' (pick any) | 'random' (blind)
  deal:        5,        // cards offered per draft
  keep:        2,        // cards kept
  reveal:     'none',    // 'none' | 'poker'
  pokerFlips:  3,        // extra bonuses turned up in poker mode
  pokerEvery:  5,        // ...one every N turns
  river:       true,     // the last flip scores double
  drawBonus:   true,     // spending a turn to take a bonus is a legal move
  maxBonuses:  5,        // cap on how many you can hold
  swapAtCap:   true,     // at the cap, drawing replaces instead of being blocked
  openingHand: 3,
  drawCount:   2,        // cards a draw turn takes
  handLimit:   7,        // draw past this and you discard back down to it
  pairPlay:    true,     // a play turn may add one spouse / parent / child
  showIntro:   true,     // the welcome card at the start of every round
  /* ---- the clock ----------------------------------------------------
     A marker walks the timeline. Each action pushes it along by that
     action's cost in years, and the game ends when it runs off the end --
     so the real question every turn is what you got for the years spent. */
  clockOn:     true,
  clockDir:   'forward',  // forward | backward | forwardback | backwardforward
  clockStep:   10,        // the default cost of an action, in years
  costDraw:    10,
  costPlay:    10,
  costBonus:   15,        // an objective is worth more of your remaining time
  abilityRate: 45,        // % of people who carry a generated ability; 0 = off

  /* 'normal'  everything on show
     'hard'    no per-action preview -- you work out what a card is worth
     'brutal'  no running total and no per-bonus scores either, until the end */
  difficulty: 'normal',
};
/* Two questions the UI asks constantly; naming them beats re-deriving the
   comparison at every call site. */
window.showsPreview = s => (s.difficulty || 'normal') === 'normal';
window.showsScore   = s => (s.difficulty || 'normal') !== 'brutal';

const SKEY = 'ancestor-deck.settings';
window.loadSettings = function (){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) {}
  // Merge over the defaults rather than replacing, so a setting added after
  // someone last saved doesn't come back undefined and silently break a mode.
  return Object.assign({}, window.DEFAULT_SETTINGS, saved);
};
window.saveSettings = function (s){
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
  return s;
};
/* The pool a draft may deal from: everything, minus whatever the baseline is
 * already scoring for free. */
window.draftPool = function (s){
  const off = s.defaults ? new Set(window.BASELINE) : new Set();
  return window.BONUSES.filter(b => !off.has(b.id)).map(b => b.id);
};

/* ------------------------------------------------------------------ */
window.scoreBoard = function (played, byId, active){
  const R = window.RULES;
  const ids = new Set(played.map(p => p.id));
  const ctx = { played, ids, byId, has: id => ids.has(id) };
  const lines = [];

  if (played.length){
    lines.push({ label: 'Kin connected', pts: played.length * R.PRESENCE,
                 detail: `${played.length} × ${R.PRESENCE}` });
  }

  /* `active` is a list of ids, or of {id, mult, baseline, faceDown} entries --
   * the richer form is what poker mode and the baseline need. A face-down card
   * still scores; it is only hidden from the sidebar. */
  const bonuses = [];
  for (const raw of (active || [])){
    const e = typeof raw === 'string' ? { id: raw } : raw;
    const b = window.BONUS_BY_ID[e.id]; if (!b) continue;
    const mult = e.mult || 1;
    const r = b.score(ctx);
    const pts = r.pts * mult;
    bonuses.push({ id: e.id, name: b.name, per: b.per, blurb: b.blurb, big: b.big,
                   baseline: !!e.baseline, mult, faceDown: !!e.faceDown,
                   pts, detail: r.detail, hits: r.hits || [] });
    if (pts) lines.push({ label: b.name + (mult > 1 ? ` ×${mult}` : ''),
                          pts, detail: r.detail, big: b.big });
  }

  const total = lines.reduce((s, l) => s + l.pts, 0);
  return { total, lines, bonuses, chains: maximalChains(played, ids) };
};

/* Every root-to-leaf parent->child path within the played set. A person with
 * two played parents yields two paths; that is intended -- both lines are real. */
function maximalChains(played, ids){
  const childrenOf = {};
  for (const p of played){
    for (const pid of (p.parent_ids || [])){
      if (!ids.has(pid)) continue;
      (childrenOf[pid] = childrenOf[pid] || []).push(p.id);
    }
  }
  const hasPlayedParent = p => (p.parent_ids || []).some(x => ids.has(x));
  const roots = played.filter(p => !hasPlayedParent(p)).map(p => p.id);
  const out = [];
  const walk = (id, path) => {
    if (path.length > 12) return;                 // safety, tree is shallow
    const kids = childrenOf[id] || [];
    if (!kids.length) { out.push(path); return; }
    for (const k of kids) walk(k, path.concat(k));
  };
  for (const r of roots) walk(r, [r]);
  return out;
}

/* How many people in a given set each bonus would ever apply to. A bonus that
 * nothing in the tree satisfies is a dead card in the deal, so tests/ checks
 * this against the real ancestors.json rather than against my guesses. */
window.bonusCoverage = function (all){
  const byId = Object.fromEntries(all.map(p => [p.id, p]));
  return window.BONUSES.map(b => {
    const ids = new Set(all.map(p => p.id));
    const r = b.score({ played: all, ids, byId, has: id => ids.has(id) });
    return { id: b.id, name: b.name, group: b.group,
             people: new Set(r.hits || []).size, maxPts: r.pts };
  });
};

if (typeof module !== 'undefined') module.exports = window;

/* ======================================================================
   THE CLOCK, AND THE ABILITIES IT GATES

   A marker starts at the decade of the earliest recorded birth and walks the
   timeline. Every action costs years. An ancestor's ability can only be used
   while the marker stands inside their lifetime -- so WHEN you play someone
   matters as much as whether you do, and a card played after the clock has
   passed them is a card whose ability you will never see.

   Abilities are once each, and they all come back at the turnaround point, so
   the there-and-back modes are genuinely a second pass rather than a victory
   lap.
   ====================================================================== */

/* Decade floor: 1883 -> 1880. */
const decade = y => Math.floor(y/10)*10;

window.clockRange = function (people){
  const births = people.map(p => p.birth_year).filter(Boolean);
  const ends   = people.map(p => p.living ? NOW_Y : p.death_year).filter(Boolean);
  if (!births.length) return [NOW_Y, NOW_Y];
  return [decade(Math.min(...births)), Math.ceil(Math.max(NOW_Y, ...ends)/10)*10];
};

window.aliveAt = function (p, year){
  const b = p.birth_year; if (!b) return false;
  const e = p.living ? NOW_Y : (p.death_year || b + 85);
  return year >= b && year <= e;
};

/* ---- the effects an ability can have ---------------------------------
 * Each is something you could not do with a plain turn: cards without paying
 * the years, years back, points from nothing, or a play that costs nothing.
 * `n` is the magnitude; `apply` is run by play.html against the live game. */
window.ABILITY_EFFECTS = {
  draw:     { verb: n => `Pull ${n} Kin from the Archive. It costs you no years.` },
  time:     { verb: n => `Give yourself ${n} years back on the timeline.` },
  points:   { verb: n => `Take ${n} Legacy, right now.` },
  freeplay: { verb: n => `Your next Connect costs no years.` },
  playkin:  { verb: n => `Connect their spouse, parent or child from your hand. Free.` },
};

/* ---- generating an ability from a life -------------------------------
 * Ordered, first match wins, most characteristic fact first. The effect is
 * meant to rhyme with the person rather than simulate them: someone who
 * outlived everybody gives you time back, a big household hands you cards.
 * Purely derived from vitals, so it works before any story is written --
 * an authored ability on cards.json always takes precedence over these. */
const ABILITY_RULES = [
  { when: (p, c) => (c.ageOf(p) || 0) >= 90,
    kind:'time', n:10, name:'Refused To Go',
    why: p => `Reached ${c_age(p)}. Some people simply take longer.` },

  { when: (p, c) => c.isAncient(p),
    kind:'time', n:8, name:'End Of The Paper Trail',
    why: p => `Born ${p.birth_year}, as far back as the record goes.` },

  { when: (p, c) => (p.child_count ?? p.children_in_tree ?? 0) >= 4,
    kind:'draw', n:2, name:'Full House',
    why: p => `A house that size teaches you to keep your options open.` },

  { when: (p, c) => c.marriageYears(p) >= 50,
    kind:'playkin', n:1, name:'Inseparable',
    why: p => `Fifty years married. They do not go anywhere alone.` },

  { when: (p, c) => !p.living && p.age_at_death && p.age_at_death < 55,
    kind:'points', n:4, name:'Cut Short',
    why: p => `Gone at ${p.age_at_death}. Worth remembering twice over.` },

  { when: (p, c) => c.movedFar(p),
    kind:'freeplay', n:1, name:'Already Packed',
    why: p => `Died a long way from where they were born.` },

  { when: (p, c) => c.marriedYoung(p),
    kind:'freeplay', n:1, name:'Wasted No Time',
    why: p => `Married before they were 22.` },

  { when: (p, c) => (p.marriages||[]).length >= 2,
    kind:'draw', n:2, name:'Second Innings',
    why: p => `Married more than once. They knew how to start again.` },

  { when: (p, c) => c.bornInWar(p),
    kind:'points', n:3, name:'Born In A Bad Year',
    why: p => `Born ${p.birth_year}, into the middle of it.` },

  { when: (p, c) => (p.parent_ids||[]).length === 0,
    kind:'draw', n:2, name:'Came From Nowhere',
    why: p => `Nobody above them on the record at all.` },

  { when: (p, c) => (c.ageOf(p) || 0) >= 80,
    kind:'time', n:5, name:'Good Innings',
    why: p => `Reached ${c_age(p)} — that is time you can borrow.` },

  { when: () => true,
    kind:'draw', n:1, name:'Lent A Hand',
    why: p => `Nothing remarkable on the record. Still here.` },
];
let c_age_of = null;
function c_age(p){ return c_age_of ? c_age_of(p) : (p.age_at_death || '?'); }

/* Stable per-person hash, so the same people carry the same abilities from one
 * game to the next -- an ability is part of who the card IS, not a die roll. */
function hashId(id){
  let h = 2166136261;
  for (let i = 0; i < id.length; i++){ h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

window.buildAbilities = function (people, rate){
  const oldest = people.filter(p=>p.birth_year).sort((a,b)=>a.birth_year-b.birth_year)
    .slice(0,3).map(p=>p.id);
  const byId = Object.fromEntries(people.map(p=>[p.id,p]));
  const c = {
    ageOf,
    isAncient: p => oldest.includes(p.id),
    marriageYears: p => marriageYears(p, byId) || 0,
    marriedYoung: p => marriedAges(p).some(a => a > 0 && a < 22),
    movedFar: p => {
      if (!p.birth_place || !p.death_place) return false;
      const a = parts(p.birth_place), b = parts(p.death_place);
      return a[a.length-1] !== b[b.length-1] || a[0] !== b[0];
    },
    bornInWar: p => p.birth_year &&
      ((p.birth_year>=1914&&p.birth_year<=1918)||(p.birth_year>=1939&&p.birth_year<=1945)),
  };
  c_age_of = ageOf;

  // Who gets one: the lowest hashes, so raising the rate only ever ADDS people
  // rather than reshuffling who has what.
  const ranked = people.map(p => ({ p, h: hashId(p.id) })).sort((a,b)=>a.h-b.h);
  const take = Math.round(people.length * Math.max(0, Math.min(100, rate)) / 100);
  const chosen = new Set(ranked.slice(0, take).map(x => x.p.id));

  for (const p of people){
    p.gen_ability = null;
    if (!chosen.has(p.id)) continue;
    const r = ABILITY_RULES.find(r => { try { return r.when(p, c); } catch(e){ return false; } });
    if (!r) continue;
    p.gen_ability = { kind:r.kind, n:r.n, name:r.name,
                      effect: window.ABILITY_EFFECTS[r.kind].verb(r.n),
                      why: r.why(p) };
  }
  return people;
};

/* The ability a card actually offers: whatever was authored in the builder
 * first, otherwise the generated one. */
window.abilityOf = function (p){
  const authored = (p.abilities || [])[0];
  if (authored && authored.name) return { ...authored, authored: true, kind: authored.kind || null };
  return p.gen_ability || null;
};
