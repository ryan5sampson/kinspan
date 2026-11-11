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
  drawBonus:   false,    // spending a turn to take a bonus is a legal move (custom games)
  maxBonuses:  5,        // cap on how many you can hold
  swapAtCap:   true,     // at the cap, drawing replaces instead of being blocked
  openingHand: 3,
  drawCount:   2,        // cards a draw turn takes
  handLimit:   6,        // draw past this and you discard back down to it
  pairPlay:    true,     // a married couple both in hand connect as one move
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
  abilityRate: 50,        // % of Kin dealt a Gift each game (1/4 of them higher tier); 0 = off

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
/* ---- icons -------------------------------------------------------------
 * One line-drawn set, so every page speaks the same visual language instead
 * of whatever emoji the device happens to draw. icon('name') returns inline
 * SVG that takes its size from the font and its colour from the text; static
 * markup can write <i data-ic="name"></i> and gets filled in on load. */
window.ICONS = {
  spark:   'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2',
  back:    'M19 12H5M11 6l-6 6 6 6',
  close:   'M6 6l12 12M18 6L6 18',
  menu:    'M4 7h16M4 12h16M4 17h16',
  play:    'M8 5v14l11-7z',
  save:    'M12 4v11M7 10l5 5 5-5M5 20h14',
  swap:    'M4 8h14l-3-3M20 16H6l3 3',
  hourglass:'M6 3h12M6 21h12M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3',
  bolt:    'M13 3L5 13h6l-1 8 8-10h-6z',
  uturn:   'M6 20V10a5 5 0 0 1 10 0v6M12 12l4 4 4-4',
  cards:   'M9 3h9a2 2 0 0 1 2 2v12"/><rect x="4" y="7" width="11" height="14" rx="2',
  rewind:  'M11 6l-7 6 7 6zM20 6l-7 6 7 6z',
  star:    'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  heart:   'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  hand:    'M18 4v6M15 7h6"/><rect x="3" y="6" width="10" height="14" rx="2',
  half:    'M12 4a8 8 0 0 0 0 16z" fill="currentColor"/><circle cx="12" cy="12" r="8',
  pause:   'M9 5v14M15 5v14',
  echo:    'M17 3l3 3-3 3M4 11v-1a4 4 0 0 1 4-4h12M7 21l-3-3 3-3M20 13v1a4 4 0 0 1-4 4H4',
  letter:  'M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2',
  leaf:    'M5 19C5 11 11 5 19 5c0 8-6 14-14 14zM5 19l7-7',
  diamond: 'M12 3l8 9-8 9-8-9z',
  double:  'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><rect x="8" y="8" width="12" height="12" rx="2',
  home:    'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  shuffle: 'M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5',
  restart: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5',
  fan:     'M3 18a9 9 0 0 1 18 0zM12 18V9M12 18l-6.4-6.4M12 18l6.4-6.4',
  link:    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  clock:   'M12 7v5l3 2"/><circle cx="12" cy="12" r="9',
  flag:    'M5 21V4h11l-2 4 2 4H5',
  down:    'M12 5v14M6 13l6 6 6-6',
  plus:    'M12 5v14M5 12h14',
  help:    'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/><circle cx="12" cy="12" r="9',
};
/* ---- the Kinspan mark -------------------------------------------------
 * Three lives as bars on one timeline. Every variation keeps the three rows
 * and the rounded bars and only moves them, so they all read as the same
 * mark: `bars` is [x, width] per row on an 806-wide timeline, `ghost` rows
 * are drawn as outlines. Classic is logo.svg exactly. */
window.LOGOS = {
  classic:  { color:'#F0966E', bars:[[0,527],[113,625],[433,373]] },              // forward, overlapping
  quick:    { color:'#E0A43A', bars:[[0,300],[253,300],[506,300]] },              // short steps, fast
  saga:     { color:'#5B8DB8', bars:[[0,430],[376,430],[0,430]] },                // out and back again
  tutorial: { color:'#5E9E72', bars:[[0,527],[113,625],[433,373]], ghost:[1,2] }, // one drawn, two to learn
  custom:   { color:'#9A7BB0', bars:[[0,620],[0,360],[0,806]] },                  // set like sliders
};
window.logo = (cls, v) => {
  const L = window.LOGOS[v] || window.LOGOS.classic, g = new Set(L.ghost || []);
  return `<svg class="logo${cls ? ' ' + cls : ''}" style="--lc:${L.color}" viewBox="0 0 806 736" fill="currentColor" role="img" aria-label="Kinspan">`
    + L.bars.map(([x, w], r) => g.has(r)
        ? `<rect x="${x + 22}" y="${r * 256 + 22}" width="${w - 44}" height="180" rx="28" fill="none" stroke="currentColor" stroke-width="44"/>`
        : `<rect x="${x}" y="${r * 256}" width="${w}" height="224" rx="48"/>`).join('') + '</svg>';
};

/* A full-screen loader: the bars wipe in from the left, hold, and wipe off
 * to the right, one after another, in the colour of what is loading. */
window.showLoader = v => {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('kloader');
  if (!el) { el = document.createElement('div'); el.id = 'kloader'; document.body.appendChild(el); }
  el.innerHTML = window.logo('loading', v); el.className = 'on';
  // A loader must never be the reason a page will not open: it gives way on
  // its own after a few seconds, and at once on any script error.
  clearTimeout(window._kl); window._kl = setTimeout(window.hideLoader, 6000);
};
if (typeof addEventListener !== 'undefined') addEventListener('error', () => window.hideLoader());
window.hideLoader = () => {
  const el = document.getElementById('kloader'); if (!el) return;
  el.className = 'off'; setTimeout(() => el.remove(), 400);
};
window.icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${window.ICONS[name]}"/></svg>`;
if (typeof document !== 'undefined') {
  document.head.insertAdjacentHTML('beforeend', `<style>.logo{display:block;height:1em;width:auto;color:var(--lc,var(--brand,#F0966E))}
    .logo.mono{color:inherit}
    .logo.loading rect{transform-box:fill-box;animation:kwipe 1.8s cubic-bezier(.65,0,.35,1) infinite}
    .logo.loading rect:nth-child(2){animation-delay:.16s}
    .logo.loading rect:nth-child(3){animation-delay:.32s}
    @keyframes kwipe{
      0%{clip-path:inset(0 100% 0 0 round 48px);transform:translateX(-8%)}
      35%,55%{clip-path:inset(0 0 0 0 round 48px);transform:none}
      90%,100%{clip-path:inset(0 0 0 100% round 48px);transform:translateX(8%)}}
    #kloader{position:fixed;inset:0;z-index:999;display:grid;place-items:center;
      background:var(--bg,#f7f4ef);font-size:84px;transition:opacity .35s}
    #kloader.off{opacity:0;pointer-events:none}
    @media (prefers-reduced-motion: reduce){.logo.loading rect{animation-duration:4s}}
    .ic{width:1em;height:1em;flex:none;vertical-align:-.14em;
    fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;overflow:visible}</style>`);
  // Coming Back to a page from the browser's cache must not land on its loader.
  addEventListener('pageshow', e => { if (e.persisted) window.hideLoader(); });
  document.addEventListener('DOMContentLoaded', () =>
    { document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = window.icon(e.dataset.ic); });
      document.querySelectorAll('[data-logo]').forEach(e => { e.innerHTML = window.logo('', e.dataset.logo); }); });
}

/* ---- game modes --------------------------------------------------------
 * A mode is a named set of overrides on the defaults. The title screen lists
 * them; play.html?mode=<id> plays one. 'custom' is whatever the rules page
 * saved, and 'tutorial' is Classic with the tour running over it. */
window.MODES = [
  { id:'classic', icon:logo('', 'classic'), name:'Classic', blurb:'Pick 2 of 5 Legacy cards, then walk the timeline forward.', set:{} },
  { id:'quick', icon:logo('', 'quick'), name:'Quick', blurb:'Legacy cards dealt for you. Every move costs 20 years.',
    set:{ selection:'random', costDraw:20, costPlay:20, costBonus:25 } },
  { id:'saga', icon:logo('', 'saga'), name:'There and back', blurb:'Forward, then back again. New Legacy cards flip as you go.',
    set:{ clockDir:'forwardback', reveal:'poker' } },
];
window.MODE_BY_ID = Object.fromEntries(window.MODES.map(m => [m.id, m]));
window.modeSettings = function (id){
  if (id === 'custom') return window.loadSettings();
  const m = window.MODE_BY_ID[id] || window.MODES[0];
  return Object.assign({}, window.DEFAULT_SETTINGS, m.set);
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

/* ---- the effects a Gift can have -------------------------------------
 * Each is something a plain turn cannot do. `verb` is what the card says;
 * play.html's giftStatus() and useAbility() hold a case for every kind here,
 * and check.js fails if one goes missing. */
/* Every Gift comes in two strengths. A Story card carries the lower one, a
 * Biography the higher, a Sketch none. The lower one is smaller and usually
 * situational -- it waits on a `gate` you have to set up or time; the higher
 * one is bigger and works whenever its owner is alive at the marker.
 *
 * `worth` is what a Gift is worth in Legacy, priced from a bot that played 40
 * Classic games on a 23-person family with Gifts off (scratch bot, not shipped):
 * (couples-only pairs, a hand of 6): a 10-year move earned MOVE Legacy, a
 * Connect CONNECT, and a Gift used mid-game
 * still had about LEFT Connects ahead of it. A gated Gift is discounted by
 * ODDS, the share of games it ends up usable in. */
const MOVE = 2.7, CONNECT = 3.5, LEFT = 5, ODDS = 0.6;
window.GATES = {
  hand2: { say:'with 2 or fewer Kin in hand' },
  late:  { say:'in the last 15 years of their life' },
  young: { say:'in their first 20 years' },
  kin:   { say:'once one of their family is on the timeline' },
};
window.ABILITY_EFFECTS = {
  draw:     { icon:icon('cards'), worth:n => n*MOVE/2,
    low:{ n:2, gate:'hand2', say:n => `Pull ${n} Kin from the Archive. No years spent.` },
    high:{ n:3, say:n => `Pull ${n} Kin from the Archive. No years spent.` } },
  time:     { icon:icon('rewind'), worth:n => n/10*MOVE,
    low:{ n:10, gate:'late', say:n => `Take ${n} years back on the timeline.` },
    high:{ n:20, say:n => `Take ${n} years back on the timeline.` } },
  points:   { icon:icon('star'), worth:n => n,
    low:{ n:3, gate:'young', say:n => `Take ${n} Legacy, right now.` },
    high:{ n:5, say:n => `Take ${n} Legacy, right now.` } },
  freeplay: { icon:icon('bolt'), worth:n => n*MOVE,
    low:{ n:1, gate:'kin', say:() => `Your next Connect costs no years.` },
    high:{ n:2, say:n => `Your next ${n} Connects cost no years.` } },
  playkin:  { icon:icon('heart'), worth:n => n*1.5,     // ~1.5 of their family down when it is used
    low:{ n:2, say:n => `+${n} Legacy for each of their spouse, parents and children on the timeline.` },
    high:{ n:3, say:n => `+${n} Legacy for each of their spouse, parents and children on the timeline.` } },
  hold:     { icon:icon('hand'), worth:n => n*0.8,       // a slot saves about a third of a pulled card
    low:{ n:2, say:n => `Hold ${n} more Kin for the rest of the game.` },
    high:{ n:4, say:n => `Hold ${n} more Kin for the rest of the game.` } },
  discount: { icon:icon('half'), worth:n => n*MOVE/2,
    low:{ n:1, say:() => `Your next Connect costs half the years.` },
    high:{ n:3, say:n => `Your next ${n} Connects cost half the years.` } },
  pause:    { icon:icon('pause'), worth:n => n*MOVE,
    low:{ n:1, gate:'late', say:() => `The marker stands still for your next move.` },
    high:{ n:2, say:n => `The marker stands still for your next ${n} moves.` } },
  echo:     { icon:icon('echo'), worth:n => n ? 3 : 3*ODDS, // about an average higher Gift
    low:{ n:0, say:() => `Use a spent Gift from their own family once more.` },
    high:{ n:1, say:() => `Use any Gift you have already spent, once more.` } },
  summon:   { icon:icon('letter'), worth:n => n*MOVE/2*1.3, // a pulled card that is sure to be family
    low:{ n:1, say:() => `Bring one of their family out of the Archive to your hand.` },
    high:{ n:2, say:n => `Bring up to ${n} of their family out of the Archive to your hand.` } },
  keepsake: { icon:icon('leaf'), worth:n => n ? LEFT : LEFT*0.3,
    low:{ n:0, say:() => `+1 Legacy for each of their family you connect after this.` },
    high:{ n:1, say:() => `+1 Legacy for every Kin you connect after this.` } },
  objective:{ icon:icon('diamond'), worth:() => 6,         // what a drafted Legacy card scored on average
    low:{ n:1, gate:'late', say:() => `Claim a Legacy card. No years spent.` },
    high:{ n:1, say:() => `Claim a Legacy card. No years spent.` } },
  swap:     { icon:icon('swap'), worth:n => n*0.6,
    low:{ n:2, say:n => `Send up to ${n} Kin back to the Archive and pull as many.` },
    high:{ n:4, say:n => `Send up to ${n} Kin back to the Archive and pull as many.` } },
  double:   { icon:icon('double'), worth:n => n ? MOVE : MOVE/2,
    low:{ n:0, say:() => `After your next Connect, one more costs half the years.` },
    high:{ n:1, say:() => `After your next Connect, one more costs no years.` } },
  reunion:  { icon:icon('home'), worth:n => n === 1 ? 3 : n*LEFT/2, // ~3 Kin with two family down
    low:{ n:1, say:n => `+${n} Legacy for each Kin on the timeline with two family beside them.` },
    high:{ n:2, say:n => `+${n} Legacy for every Kin you connect from now on with two family already down.` } },
  reshuffle:{ icon:icon('shuffle'), worth:n => n ? 3 : 3*ODDS,
    low:{ n:0, gate:'dud', say:() => `Trade one of your Legacy cards for another. No years spent.` },
    high:{ n:1, say:() => `Trade one of your Legacy cards for another. No years spent.` } },
};
window.GATES.dud = { say:'while one of your Legacy cards is scoring nothing' };
/* What a Gift says, how strong it is, and what it is worth, at a tier. */
window.giftTier = function (kind, tier){
  const fx = window.ABILITY_EFFECTS[kind], t = fx[tier === 'low' ? 'low' : 'high'];
  const gate = t.gate && window.GATES[t.gate];
  const worth = fx.worth(t.n) * (gate ? ODDS : 1);
  return { n: t.n, gate: t.gate || null, worth: Math.round(worth * 2) / 2,
           effect: t.say(t.n) + (gate ? ` Only ${gate.say}.` : '') };
};

/* ---- the Gifts --------------------------------------------------------
 * One list feeds both places a Gift comes from:
 *   - the generator gives a Kin the FIRST entry whose `when` fits their life,
 *     so the list runs most characteristic fact first;
 *   - the editor's menu offers every entry, grouped by `group`.
 * Entries with no `when` are menu-only: nothing in a record can say "had a
 * plan", but a person writing their grandmother's card can. */
const NO = p => false;
const GIFTS = [
  { id:'refused',  group:'A long life', name:'Refused To Go', kind:'time', n:10,
    when:(p,c) => (c.ageOf(p)||0) >= 90, why: p => `Reached ${c_age(p)}. Some people simply take longer.` },
  { id:'outlasted', group:'A long life', name:'Outlasted Them All', kind:'echo',
    when:(p,c) => c.outlivedSpouse(p), why: () => `Fifteen years and more without them, and still telling the stories.` },
  { id:'ancient',  group:'The record', name:'End Of The Paper Trail', kind:'time', n:8,
    when:(p,c) => c.isAncient(p), why: p => `Born ${p.birth_year}, as far back as the record goes.` },
  { id:'cook',     group:'A full house', name:'Somebody Had To Cook', kind:'draw', n:3,
    when:(p,c) => c.kids(p) >= 7, why: p => `${c_kids(p)} children. Nobody sat down.` },
  { id:'fullhouse', group:'A full house', name:'Full House', kind:'draw', n:2,
    when:(p,c) => c.kids(p) >= 4, why: () => `A house that size teaches you to keep your options open.` },
  { id:'reunion',  group:'A full house', name:'Family Reunion', kind:'reunion',
    when:(p,c) => c.kinCount(p) >= 6, why: () => `Everybody came. Everybody always came.` },
  { id:'inseparable', group:'A full house', name:'Inseparable', kind:'playkin',
    when:(p,c) => c.marriageYears(p) >= 50, why: () => `Fifty years married. They do not go anywhere alone.` },
  { id:'cutshort', group:'A long life', name:'Cut Short', kind:'points', n:4,
    when:(p,c) => !p.living && p.age_at_death && p.age_at_death < 55, why: p => `Gone at ${p.age_at_death}. Worth remembering twice over.` },
  { id:'nohome',   group:'Leaving', name:'Never Made It Home', kind:'freeplay',
    when:(p,c) => c.abroad(p) && p.age_at_death && p.age_at_death < 60, why: () => `Died a long way from where they started, and too soon.` },
  { id:'sentfor',  group:'Leaving', name:'Sent For The Family', kind:'summon',
    when:(p,c) => c.abroad(p) && c.kids(p) >= 3, why: () => `Crossed first, then sent for the rest.` },
  { id:'crossed',  group:'Leaving', name:'Crossed The Water', kind:'summon',
    when:(p,c) => c.abroad(p), why: () => `Born in one country, buried in another.` },
  { id:'packed',   group:'Leaving', name:'Already Packed', kind:'freeplay',
    when:(p,c) => c.movedFar(p), why: () => `Died a long way from where they were born.` },
  { id:'neverleft', group:'Leaving', name:'Never Left', kind:'keepsake', n:2,
    when:(p,c) => c.stayed(p), why: () => `Born and died in the same town. Somebody had to keep the place.` },
  { id:'farm',     group:'Leaving', name:'Kept The Farm', kind:'points', n:3,
    when:(p,c) => c.buriedWith(p) >= 3, why: () => `Resting with their own. The land stayed in the family.` },
  { id:'young',    group:'A full house', name:'Wasted No Time', kind:'freeplay',
    when:(p,c) => c.marriedYoung(p), why: () => `Married before they were 22.` },
  { id:'second',   group:'A full house', name:'Second Innings', kind:'draw', n:2,
    when:(p,c) => (p.marriages||[]).length >= 2, why: () => `Married more than once. They knew how to start again.` },
  { id:'talked',   group:'A full house', name:'People Talked', kind:'points', n:3,
    when:(p,c) => c.ageGap(p) >= 8, why: () => `Eight years and more between them. People talked.` },
  { id:'twice',    group:'History', name:'Saw It Twice', kind:'pause', n:2,
    when:(p,c) => p.birth_year && p.birth_year <= 1900 && (c.ended(p)||0) >= 1945, why: () => `Lived through both wars. Learned to wait things out.` },
  { id:'badyear',  group:'History', name:'Born In A Bad Year', kind:'points', n:3,
    when:(p,c) => c.bornInWar(p), why: p => `Born ${p.birth_year}, into the middle of it.` },
  { id:'nothing',  group:'History', name:'Grew Up On Nothing', kind:'discount',
    when:(p,c) => p.birth_year >= 1915 && p.birth_year <= 1939, why: () => `Made it stretch. Made everything stretch.` },
  { id:'moon',     group:'History', name:'Watched The Moon Landing', kind:'points', n:2,
    when:(p,c) => p.birth_year < 1930 && (c.ended(p)||0) >= 1969, why: () => `Born before the aeroplane was ordinary. Saw a man on the moon.` },
  { id:'wrote',    group:'The record', name:'Wrote It All Down', kind:'hold', n:2,
    when:(p,c) => !!(p.story||'').trim(), why: () => `Kept every letter. Someone always does.` },
  { id:'twoofthem', group:'The record', name:'Two Of Them', kind:'double',
    when:(p,c) => c.sharesName(p), why: () => `Same name as another Kin. Twice the paperwork.` },
  { id:'nowhere',  group:'The record', name:'Came From Nowhere', kind:'draw', n:2,
    when:(p,c) => (p.parent_ids||[]).length === 0, why: () => `Nobody above them on the record at all.` },
  { id:'onlyname', group:'The record', name:'Only A Name', kind:'draw', n:1,
    when:(p,c) => !p.living && !p.death_year, why: () => `The record just stops. Somebody knows the rest.` },
  { id:'innings',  group:'A long life', name:'Good Innings', kind:'time', n:5,
    when:(p,c) => (c.ageOf(p)||0) >= 80, why: p => `Reached ${c_age(p)} — that is time you can borrow.` },
  { id:'plan',     group:'Your own words', name:'Had A Plan', kind:'objective', when:NO },
  { id:'changed',  group:'Your own words', name:'Changed Their Mind', kind:'reshuffle', when:NO },
  { id:'traded',   group:'Your own words', name:'Traded Up', kind:'swap', n:2, when:NO },
  { id:'lent',     group:'Ordinary', name:'Lent A Hand', kind:'draw', n:1,
    when:() => true, why: () => `Nothing remarkable on the record. Still here.` },
];
window.GIFTS = GIFTS;
window.GIFT_BY_ID = Object.fromEntries(GIFTS.map(g => [g.id, g]));

let c_age_of = null;
function c_age(p){ return c_age_of ? c_age_of(p) : (p.age_at_death || '?'); }
function c_kids(p){ return p.child_count ?? p.children_in_tree ?? 0; }
const lastPart = s => { const a = parts(s); return (a[a.length-1] || '').toLowerCase(); };

/* Stable per-person hash, so the same people carry the same abilities from one
 * game to the next -- an ability is part of who the card IS, not a die roll. */

/* Everything a `when` needs to know about the rest of the tree, built once. */
window.giftContext = function (people){
  const oldest = people.filter(p=>p.birth_year).sort((a,b)=>a.birth_year-b.birth_year)
    .slice(0,3).map(p=>p.id);
  const byId = Object.fromEntries(people.map(p=>[p.id,p]));
  const count = key => { const m = new Map();
    for (const p of people){ const k = key(p); if (k) m.set(k, (m.get(k)||0) + 1); } return m; };
  const graves = count(p => (p.burial_place||'').toLowerCase());
  const names  = count(p => first(p).toLowerCase());
  c_age_of = ageOf;
  return {
    ageOf, ended,
    kids: c_kids,
    isAncient: p => oldest.includes(p.id),
    marriageYears: p => marriageYears(p, byId) || 0,
    marriedYoung: p => marriedAges(p).some(a => a > 0 && a < 22),
    ageGap: p => Math.max(0, ...marriagesOf(p, byId).map(m =>
      p.birth_year && m.sp.birth_year ? Math.abs(p.birth_year - m.sp.birth_year) : 0)),
    outlivedSpouse: p => marriagesOf(p, byId).some(m =>
      ended(m.sp) && ended(p) && ended(p) - ended(m.sp) >= 15),
    kinCount: p => (p.spouse_ids||[]).length + (p.parent_ids||[]).length + (p.children_ids||[]).length,
    abroad: p => !!(p.birth_place && p.death_place) && lastPart(p.birth_place) !== lastPart(p.death_place),
    movedFar: p => !!(p.birth_place && p.death_place) && townOf(p) !== (parts(p.death_place)[0]||'').toLowerCase(),
    stayed: p => !!(p.birth_place && p.death_place) && townOf(p) === (parts(p.death_place)[0]||'').toLowerCase(),
    buriedWith: p => p.burial_place ? graves.get(p.burial_place.toLowerCase()) || 0 : 0,
    sharesName: p => (names.get(first(p).toLowerCase()) || 0) >= 2,
    bornInWar: p => p.birth_year &&
      ((p.birth_year>=1914&&p.birth_year<=1918)||(p.birth_year>=1939&&p.birth_year<=1945)),
  };
};

/* The Gift a life suggests: the first entry that fits, made ready to show. */
window.suggestGift = function (p, c){
  const g = GIFTS.find(g => { try { return g.when(p, c); } catch(e){ return false; } });
  return g ? giftFrom(g, p) : null;
};
function giftFrom(g, p){
  return { gift: g.id, kind: g.kind, n: g.n || 1, name: g.name,
           why: g.why ? g.why(p) : '' };
}
window.giftFrom = giftFrom;

/* Deal the tiers for a game. Kin with Gifts written in the builder keep them,
 * as a Biography. Everyone else is shuffled: `rate`% get a Gift their own life
 * suggests -- a quarter of those at the higher tier, the rest at the lower --
 * and the rest stay Sketches. At the default 50 that is 1/8 Biography, 3/8
 * Story, 1/2 Sketch, freshly drawn every game. */
window.buildAbilities = function (people, rate){
  const c = window.giftContext(people);
  const written = p => (p.abilities || []).some(a => a && a.name);
  const pool = people.filter(p => !written(p));
  for (let i = pool.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const gifted = Math.round(pool.length * Math.max(0, Math.min(100, rate)) / 100);
  const bio = Math.round(gifted / 4);
  for (const p of people){
    // `fit_ability` is what a written Gift with no effect chosen borrows.
    p.fit_ability = window.suggestGift(p, c);
    p.gen_ability = null; p.tier = written(p) ? 'rare' : 'basic';
  }
  pool.forEach((p, i) => {
    if (i >= gifted || !p.fit_ability) return;
    const tier = i < bio ? 'high' : 'low';
    p.tier = tier === 'high' ? 'rare' : 'uncommon';
    p.gen_ability = { ...p.fit_ability, tier };
  });
  return people;
};

/* Every Gift a card offers, ready to show and use: whatever was written in the
 * builder (at the higher tier -- you wrote it on purpose), otherwise the one
 * dealt this game. */
window.abilitiesOf = function (p){
  const own = (p.abilities || []).filter(a => a && a.name);
  const list = own.length
    ? own.map(a => {
        const fit = a.kind && window.ABILITY_EFFECTS[a.kind] ? a : (p.fit_ability || { kind:'draw' });
        return { ...a, kind: fit.kind, tier: 'high', why: a.why || a.text || '', authored: true };
      })
    : (p.gen_ability ? [p.gen_ability] : []);
  return list.map(a => ({ ...a, ...window.giftTier(a.kind, a.tier),
                          icon: window.ABILITY_EFFECTS[a.kind].icon }));
};
