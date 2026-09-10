/* tree.js — the Python pipeline, in the browser.
 *
 * The game used to need card_builder.py for two things: /api/people (the Kin)
 * and /api/relate (trace the line). Both are pure computation over a GEDCOM,
 * so both run here instead, and the whole game is static files any host can
 * serve with no backend at all.
 *
 * This is a deliberate port, not a reimplementation. It mirrors, in order:
 *   gedcom_model.py   -> parseGedcom()
 *   kinship.py        -> Graph, describe(), connectionPath()
 *   build_ancestors.py-> buildPeople()
 *   card_builder.py   -> deriveTraits(), applyDerived(), relate()
 * Keep them in step. web/test/port.html diffs this file's output against a
 * Python build of the same GEDCOM and fails on any drift.
 *
 * A file the player brings is parsed in the browser and never sent anywhere.
 * That is a privacy property the site promises in writing — do not
 * "helpfully" add an upload endpoint.
 */
(function () {
'use strict';

/* ---------------------------------------------------------------- parsing */

/* GEDCOM is a flat list of "<level> [xref] <tag> [value]" lines. ged4py did
 * the tokenising in Python; the format is small enough to do here directly. */
function parseLines(text) {
  const out = [];
  // Strip a BOM (RootsMagic writes one) and accept either line ending.
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const m = /^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/.exec(line);
    if (!m) continue;               // tolerate junk rather than dying on it
    out.push({ level: +m[1], xref: m[2] || null, tag: m[3], value: m[4] || '' });
  }
  return out;
}

/* Group the flat lines into level-0 records with a nested child tree. */
function parseRecords(text) {
  const recs = [];
  let cur = null;
  const stack = [];
  for (const ln of parseLines(text)) {
    if (ln.level === 0) {
      cur = { tag: ln.tag, xref: ln.xref, value: ln.value, kids: [] };
      recs.push(cur);
      stack.length = 0;
      stack.push(cur);
      continue;
    }
    if (!cur) continue;
    // CONT is a new line of the parent's value; CONC glues on with no space.
    const parent = stack[ln.level - 1];
    if (!parent) continue;
    if (ln.tag === 'CONT') { parent.value += '\n' + ln.value; continue; }
    if (ln.tag === 'CONC') { parent.value += ln.value; continue; }
    const node = { tag: ln.tag, xref: ln.xref, value: ln.value, kids: [] };
    parent.kids.push(node);
    stack[ln.level] = node;
    stack.length = ln.level + 1;
  }
  return recs;
}

const kid  = (rec, tag) => (rec.kids || []).find(k => k.tag === tag) || null;
const kids = (rec, tag) => (rec.kids || []).filter(k => k.tag === tag);
const val  = (rec, tag) => { const k = kid(rec, tag); return k && k.value ? k.value : null; };

const EVENT_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI'];
const ORDINANCE_TAGS = ['BAPL', 'CONL', 'ENDL', 'WAC', 'SLGC'];

/* Pull a 4-digit year out of a date string, tolerating ABT / AFT / BET. */
function yearOf(date) {
  if (!date) return null;
  const m = /\b(\d{4})\b/.exec(String(date));
  return m ? +m[1] : null;
}

function eventOf(rec, tag) {
  const node = kid(rec, tag);
  if (!node) return null;
  const date = val(node, 'DATE');
  return {
    tag,
    date: date || null,
    year: yearOf(date),
    place: val(node, 'PLAC'),
    temple: val(node, 'TEMP'),
  };
}

/* RootsMagic puts the readable name in GIVN/SURN; NAME is 'Given /Surname/'.
 * Files from other programs often carry only NAME, so fall back to parsing it. */
function nameParts(rec) {
  const nameNode = kid(rec, 'NAME');
  let given = nameNode ? val(nameNode, 'GIVN') : null;
  let surname = nameNode ? val(nameNode, 'SURN') : null;
  const suffix = nameNode ? val(nameNode, 'NSFX') : null;
  const rawName = nameNode ? nameNode.value : '';
  if (!given && !surname && rawName) {
    const m = /^(.*?)\s*\/([^/]*)\/\s*(.*)$/.exec(rawName);
    if (m) { given = m[1] || null; surname = m[2] || null; }
    else { given = rawName; }
  }
  let display = [given, surname, suffix].filter(Boolean).join(' ').trim();
  if (!display) display = (rawName || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return { name: display || '(unknown)', given, surname, suffix };
}

function parseGedcom(text) {
  const ind = {}, fam = {};
  for (const rec of parseRecords(text)) {
    if (rec.tag === 'INDI' && rec.xref) {
      const np = nameParts(rec);
      const person = {
        xref: rec.xref,
        name: np.name, given: np.given, surname: np.surname, suffix: np.suffix,
        sex: val(rec, 'SEX'),
        fs_id: val(rec, '_FSFTID'),
        uid: val(rec, '_UID'),
        events: {}, ordinances: {},
        fams: kids(rec, 'FAMS').map(k => k.value).filter(Boolean),
        famc: kids(rec, 'FAMC').map(k => k.value).filter(Boolean),
        note_count: kids(rec, 'NOTE').length,
        source_count: kids(rec, 'SOUR').length,
      };
      for (const t of EVENT_TAGS) { const e = eventOf(rec, t); if (e) person.events[t] = e; }
      for (const t of ORDINANCE_TAGS) { const e = eventOf(rec, t); if (e) person.ordinances[t] = e; }
      ind[rec.xref] = person;
    } else if (rec.tag === 'FAM' && rec.xref) {
      const husb = kids(rec, 'HUSB').map(k => k.value).filter(Boolean);
      const wife = kids(rec, 'WIFE').map(k => k.value).filter(Boolean);
      fam[rec.xref] = {
        xref: rec.xref,
        husband: husb[0] || null,
        wife: wife[0] || null,
        children: kids(rec, 'CHIL').map(k => k.value).filter(Boolean),
        marriage: eventOf(rec, 'MARR'),
      };
    }
  }
  // A FAM may name a person the file never defines. Drop those pointers rather
  // than letting an undefined id become a node with no name later on.
  for (const f of Object.values(fam)) {
    if (f.husband && !ind[f.husband]) f.husband = null;
    if (f.wife && !ind[f.wife]) f.wife = null;
    f.children = f.children.filter(c => ind[c]);
  }
  return { ind, fam };
}

/* ---------------------------------------------------------------- kinship */

class Graph {
  constructor(ind, fam) {
    this.ind = ind;
    this.fam = fam;
    this.parents = {}; this.children = {}; this.spouses = {};
    for (const x of Object.keys(ind)) { this.parents[x] = []; this.children[x] = []; this.spouses[x] = []; }
    for (const f of Object.values(fam)) {
      const pair = [f.husband, f.wife].filter(Boolean);
      for (const a of pair) for (const b of pair) {
        if (a !== b && !this.spouses[a].includes(b)) this.spouses[a].push(b);
      }
      for (const c of f.children) {
        if (!(c in this.parents)) continue;
        for (const p of pair) { this.parents[c].push(p); this.children[p].push(c); }
      }
    }
    this._ancCache = new Map();
  }

  /* {ancestor: shortest generation distance}, including the person at 0. */
  ancestors(person) {
    if (this._ancCache.has(person)) return this._ancCache.get(person);
    const dist = { [person]: 0 };
    let frontier = [person];
    while (frontier.length) {
      const next = [];
      for (const x of frontier) for (const p of (this.parents[x] || [])) {
        if (!(p in dist)) { dist[p] = dist[x] + 1; next.push(p); }
      }
      frontier = next;
    }
    this._ancCache.set(person, dist);
    return dist;
  }

  /* Everyone reachable ignoring edge direction (parent / child / spouse). */
  connected(person) {
    const seen = new Set([person]);
    const stack = [person];
    while (stack.length) {
      const x = stack.pop();
      for (const y of [...(this.parents[x] || []), ...(this.children[x] || []), ...(this.spouses[x] || [])]) {
        if (!seen.has(y)) { seen.add(y); stack.push(y); }
      }
    }
    return seen;
  }
}

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd' };
const ordinal = n => ORDINALS[n] || `${n}th`;

function greats(n) {
  if (n <= 0) return '';
  if (n === 1) return 'great-';
  if (n === 2) return 'great-great-';
  return `${n}x-great-`;
}

const sexed = (sex, female, male, neutral) =>
  sex === 'F' ? female : sex === 'M' ? male : neutral;

/* paternal / maternal, judged by which of root's parents leads to the common
 * ancestor — and null when the answer is genuinely both.
 *
 * Takes EVERY equally-near common ancestor, not just the one lca() happened to
 * return. A full sibling has two of them, the father and the mother, and
 * picking one made the side an arbitrary coin flip: the same brother came back
 * "paternal" here and "maternal" from the Python it was ported from. He is
 * neither — he is a brother on both sides — so a split verdict reports none.
 * kinship.py::_side does the same thing; keep them together. */
function sideOf(graph, root, cands) {
  const father = (graph.parents[root] || []).find(p => graph.ind[p] && graph.ind[p].sex === 'M');
  const mother = (graph.parents[root] || []).find(p => graph.ind[p] && graph.ind[p].sex === 'F');
  const list = Array.isArray(cands) ? cands : [cands];
  const pat = father && list.some(c => c in graph.ancestors(father));
  const mat = mother && list.some(c => c in graph.ancestors(mother));
  if (pat && !mat) return 'paternal';
  if (mat && !pat) return 'maternal';
  return null;
}

/* The lowest common ancestor minimising (dRoot + dPerson), ties to the nearer
 * one on root's side — the same key Python's min() sorts on. */
function lca(rootAnc, persAnc) {
  let best = null, bestKey = null;
  for (const c of Object.keys(persAnc)) {
    if (!(c in rootAnc)) continue;
    const key = [rootAnc[c] + persAnc[c], rootAnc[c]];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = c; bestKey = key;
    }
  }
  return best;
}

/* Every common ancestor as near as the nearest — see sideOf(). */
function lcaAll(rootAnc, persAnc) {
  let best = Infinity;
  const common = [];
  for (const c of Object.keys(persAnc)) {
    if (!(c in rootAnc)) continue;
    const total = rootAnc[c] + persAnc[c];
    if (total < best) { best = total; common.length = 0; }
    if (total === best) common.push(c);
  }
  return common;
}

/* [relationship, side]. A null relationship means no blood path at all. */
function describe(graph, root, person) {
  if (person === root) return ['self', null];
  const rootAnc = graph.ancestors(root);
  const persAnc = graph.ancestors(person);
  const ca = lca(rootAnc, persAnc);
  if (!ca) return [null, null];

  const dr = rootAnc[ca], dp = persAnc[ca];
  const sex = graph.ind[person] ? graph.ind[person].sex : null;
  const side = sideOf(graph, root, lcaAll(rootAnc, persAnc));

  if (dp === 0) {                                   // an ancestor of root
    if (dr === 1) return [sexed(sex, 'mother', 'father', 'parent'), side];
    if (dr === 2) return [sexed(sex, 'grandmother', 'grandfather', 'grandparent'), side];
    return [greats(dr - 2) + sexed(sex, 'grandmother', 'grandfather', 'grandparent'), side];
  }
  if (dr === 0) {                                   // a descendant of root
    if (dp === 1) return [sexed(sex, 'daughter', 'son', 'child'), null];
    if (dp === 2) return [sexed(sex, 'granddaughter', 'grandson', 'grandchild'), null];
    return [greats(dp - 2) + sexed(sex, 'granddaughter', 'grandson', 'grandchild'), null];
  }
  if (dr === 1 && dp === 1) return [sexed(sex, 'sister', 'brother', 'sibling'), side];
  if (dp === 1) return [greats(dr - 2) + sexed(sex, 'aunt', 'uncle', 'aunt/uncle'), side];
  if (dr === 1) return [greats(dp - 2) + sexed(sex, 'niece', 'nephew', 'niece/nephew'), null];

  const degree = Math.min(dr, dp) - 1;
  const removed = Math.abs(dr - dp);
  let label = `${ordinal(degree)} cousin`;
  if (removed === 1) label += ' once removed';
  else if (removed === 2) label += ' twice removed';
  else if (removed > 2) label += ` ${removed}x removed`;
  return [label, side];
}

/* Shortest chain through ANY family tie, so in-laws connect too.
 * Returns [[id, howItLinksToThePrevious], ...] starting at a. */
function connectionPath(graph, a, b) {
  if (a === b) return [[a, null]];
  const prev = new Map([[a, null]]);
  let frontier = [a];
  while (frontier.length) {
    const next = [];
    for (const x of frontier) {
      const edges = [
        ...(graph.parents[x] || []).map(p => [p, 'parent']),
        ...(graph.children[x] || []).map(c => [c, 'child']),
        ...(graph.spouses[x] || []).map(s => [s, 'spouse']),
      ];
      for (const [y, how] of edges) {
        if (prev.has(y)) continue;
        prev.set(y, [x, how]);
        if (y === b) {
          const chain = [];
          let cur = b;
          while (cur != null) {
            const step = prev.get(cur);
            chain.push([cur, step ? step[1] : null]);
            cur = step ? step[0] : null;
          }
          chain.reverse();
          return chain;
        }
        next.push(y);
      }
    }
    frontier = next;
  }
  return null;
}

/* ------------------------------------------------------------ place words */

/* 'Providence, Cache, Utah, United States' -> 'Providence, Utah' */
function shortPlace(place) {
  if (!place) return null;
  const parts = place.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3 && ['United States', 'USA'].includes(parts[parts.length - 1]))
    return `${parts[0]}, ${parts[parts.length - 2]}`;
  if (parts.length >= 2) return `${parts[0]}, ${parts[parts.length - 1]}`;
  return parts[0] || null;
}

/* Coarsest meaningful unit — state, or country if not the US. */
function region(place) {
  if (!place) return null;
  const parts = place.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length && ['United States', 'USA'].includes(parts[parts.length - 1]))
    return parts.length >= 2 ? parts[parts.length - 2].replace(' Territory', '') : null;
  return parts.length ? parts[parts.length - 1] : null;
}

/* ------------------------------------------------------- derived per-card */

const THIS_YEAR = new Date().getFullYear();

/* The derived half of card_builder.apply_facts: everything that has to be
 * recomputed once vitals are known, so traits, timeline and scoring agree. */
function applyDerived(q) {
  q.living = !!q.living;
  if (q.living) for (const k of ['death_year', 'death_date', 'death_place', 'burial_place']) q[k] = null;

  const mars = q.marriages || [];
  const years = mars.map(m => m.year).filter(Boolean);
  q.marriage_year = years.length ? Math.min(...years) : null;
  const ordered = [...mars].sort((a, b) => (a.year || 9999) - (b.year || 9999));
  q.marriage_place = (ordered.find(m => m.place) || {}).place || null;

  q.age_at_death = (q.birth_year && q.death_year) ? q.death_year - q.birth_year : null;
  q.current_age = (q.living && q.birth_year) ? THIS_YEAR - q.birth_year : null;
  q.children_in_tree = (q.children_ids || []).length;

  const places = [], seen = new Set();
  for (const pl of [q.birth_place, ...ordered.map(m => m.place), q.death_place, q.burial_place]) {
    if (pl && !seen.has(pl)) { seen.add(pl); places.push(pl); }
  }
  q.places_lived = places;
  return q;
}

/* Card stats that come straight from the GEDCOM — no curation needed. */
function deriveTraits(p) {
  const t = [];
  if (p.birth_year) {
    if (p.living) {
      t.push({ k: 'Lifespan', v: `${p.birth_year}–present` + (p.current_age ? `  (${p.current_age})` : '') });
    } else {
      const span = `${p.birth_year}–${p.death_year || '?'}`;
      t.push({ k: 'Lifespan', v: span + (p.age_at_death ? `  (${p.age_at_death})` : '') });
    }
  }
  if (p.birth_place) t.push({ k: 'Born', v: shortPlace(p.birth_place) });
  if (p.death_place) t.push({ k: 'Died', v: shortPlace(p.death_place) });
  const b = region(p.birth_place), d = region(p.death_place);
  if (b && d) t.push({ k: 'Journey', v: b === d ? 'stayed in ' + b : `${b} → ${d}` });
  if (p.marriage_year) {
    const mp = shortPlace(p.marriage_place);
    t.push({ k: 'Married', v: String(p.marriage_year) + (mp ? ` · ${mp}` : '') });
  }
  if ((p.marriages || []).length > 1) t.push({ k: 'Marriages', v: String(p.marriages.length) });
  if (p.child_count != null) t.push({ k: 'Children', v: String(p.child_count) });
  return t;
}

const TIERS = ['basic', 'uncommon', 'rare'];   // index = number of Gifts

/* ------------------------------------------------------------ the records */

/* Same signature as ancestors.json + the server's merge step, in one pass.
 *
 * `curation` is a cards.json-shaped layer of stories and written Gifts, keyed
 * on fs_id. Nothing passes one today — a player's writing lives in their save
 * file, not here. It is kept because it is the seam for re-importing: when
 * your tree grows and you export a fresh .ged, this is where your existing
 * writing gets laid back over it. Delete it only when that is ruled out. */
function buildPeople(parsed, rootId, curation) {
  const { ind, fam } = parsed;
  const graph = new Graph(ind, fam);
  if (!(rootId in ind)) throw new Error(`root ${rootId} is not in this file`);

  const cards = curation || {};
  const reachable = graph.connected(rootId);
  const rootAnc = graph.ancestors(rootId);

  // Numeric order where the ids are @I<n>@, so a tree keeps the same order the
  // Python build produced; anything else falls back to text.
  const order = Object.keys(ind).sort((a, b) => {
    const na = +(/@I?(\d+)@/.exec(a) || [])[1], nb = +(/@I?(\d+)@/.exec(b) || [])[1];
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const people = [];
  for (const xref of order) {
    const p = ind[xref];
    const birth = p.events.BIRT || p.events.CHR || null;
    const death = p.events.DEAT || null;
    const buri = p.events.BURI || null;

    const [rel, side] = describe(graph, rootId, xref);
    const persAnc = graph.ancestors(xref);
    const ca = lca(rootAnc, persAnc);
    const generation = ca ? rootAnc[ca] - persAnc[ca] : null;

    const spouse_ids = [], children_ids = [], marriages = [];
    for (const fx of p.fams) {
      const f = fam[fx];
      if (!f) continue;
      const other = f.husband === xref ? f.wife : f.husband;
      if (other || (f.marriage && (f.marriage.year || f.marriage.place))) {
        marriages.push({
          family_id: fx,
          year: f.marriage ? f.marriage.year : null,
          date: f.marriage ? f.marriage.date : null,
          place: f.marriage ? f.marriage.place : null,
          spouse_id: other,
          spouse_name: other && ind[other] ? ind[other].name : null,
        });
      }
      for (const s of [f.husband, f.wife]) {
        if (s && s !== xref && !spouse_ids.includes(s)) spouse_ids.push(s);
      }
      for (const c of f.children) if (!children_ids.includes(c)) children_ids.push(c);
    }
    marriages.sort((a, b) => (a.year || 9999) - (b.year || 9999));

    const c = (p.fs_id && cards[p.fs_id]) || {};
    const q = {
      id: xref,
      fs_id: p.fs_id,
      name: p.name, given: p.given, surname: p.surname, suffix: p.suffix,
      sex: p.sex,
      birth_year: birth ? birth.year : null,
      death_year: death ? death.year : null,
      birth_date: birth ? birth.date : null,
      death_date: death ? death.date : null,
      birth_place: birth ? birth.place : null,
      death_place: death ? death.place : null,
      burial_place: buri ? buri.place : null,
      places_lived: [],
      spouse_ids, children_ids,
      parent_ids: [...(graph.parents[xref] || [])],
      marriages,
      marriage_year: null, marriage_place: null,
      children_in_tree: children_ids.length,
      child_count: null,
      age_at_death: null,
      relationship_to_root: rel,
      relationship_side: side,
      generation,
      connected_to_root: reachable.has(xref),
      photo_url: c.photo_url || null,
      story: c.story || '',
      source_note_count: p.note_count + p.source_count,
      lds_ordinances: Object.fromEntries(
        Object.entries(p.ordinances).map(([t, e]) => [t, { date: e.date, temple: e.temple }])),
      possible_duplicate_of: [],
      merged_fs_ids: [], merged_ids: [],
      curation_notes: c.notes || '',
      status: c.status || 'todo',
      saved_hits: c.saved_hits || [],
      newspaper_hits: [],
      searchable: false,
      // A person with no death and a birth in living memory reads as living.
      // The server takes this from facts.json; an uploaded file has no such
      // layer, so infer it rather than drawing everyone as dead.
      living: c.living != null ? !!c.living
        : (!death && birth && birth.year != null && (THIS_YEAR - birth.year) < 100),
      abilities: (c.abilities || []).filter(a => a && a.name).slice(0, 2),
    };
    applyDerived(q);
    q.tier = TIERS[q.abilities.length];
    q.traits = deriveTraits(q);
    q.playable = !!q.birth_year;
    q.ready = !!c.ready && !!q.birth_year;
    q.edited_fields = [];
    q.gedcom = {
      birth_year: q.birth_year, birth_date: q.birth_date, birth_place: q.birth_place,
      death_year: q.death_year, death_date: q.death_date, death_place: q.death_place,
      burial_place: q.burial_place, child_count: q.child_count, living: null,
    };
    people.push(q);
  }

  const rank = { todo: 0, drafted: 1, done: 2 };
  people.sort((a, b) =>
    (rank[a.status] ?? 0) - (rank[b.status] ?? 0)
    || (a.generation ?? 99) - (b.generation ?? 99)
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { people, graph };
}

/* ------------------------------------------------- editing a loaded family
 *
 * Once a GEDCOM has been imported, the save file — not the .ged — is the
 * source of truth. People can be corrected, written about, and created, so
 * everything downstream of a change has to be rebuilt: relationships are
 * measured from the root, `generation` from the common ancestor, and traits
 * and playability from the vitals. Skipping that is how a corrected birth year
 * leaves a stale "Lifespan" on the card and a Kin in the wrong place.
 */

/* A Graph from people records rather than GEDCOM records. Used when loading a
 * save file and after every edit. Parent links are the authority — a spouse
 * link alone never implies a child. */
function graphFrom(people) {
  const ind = {}, fam = {};
  for (const p of people) ind[p.id] = { name: p.name, sex: p.sex, events: {} };
  let n = 0;
  const seen = new Set();
  for (const p of people) {
    for (const s of p.spouse_ids || []) {
      if (!ind[s]) continue;
      const key = [p.id, s].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      fam['@S' + (n++) + '@'] = { husband: p.id, wife: s, children: [], marriage: null };
    }
  }
  for (const p of people) {
    const ps = (p.parent_ids || []).filter(x => ind[x]);
    if (!ps.length) continue;
    fam['@C' + (n++) + '@'] = {
      husband: ps.find(x => ind[x].sex === 'M') || ps[0] || null,
      wife: ps.find(x => ind[x].sex === 'F') || ps[1] || null,
      children: [p.id], marriage: null,
    };
  }
  return new Graph(ind, fam);
}

/* Rebuild every derived field on every person. Call after ANY edit. */
function recompute(people, rootId) {
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  if (!byId[rootId]) rootId = people.length ? people[0].id : null;
  const graph = graphFrom(people);
  const reachable = rootId ? graph.connected(rootId) : new Set();
  const rootAnc = rootId ? graph.ancestors(rootId) : {};

  for (const q of people) {
    // Drop links to people who no longer exist, both directions.
    q.spouse_ids = (q.spouse_ids || []).filter(x => byId[x] && x !== q.id);
    q.parent_ids = (q.parent_ids || []).filter(x => byId[x] && x !== q.id);
    q.children_ids = (q.children_ids || []).filter(x => byId[x] && x !== q.id);

    // Marriages track the spouse list, so a spouse added in the editor gets a
    // row that can carry a year and place.
    const mars = (q.marriages || []).filter(m => !m.spouse_id || byId[m.spouse_id]);
    for (const s of q.spouse_ids) {
      if (!mars.some(m => m.spouse_id === s)) {
        mars.push({ family_id: null, year: null, date: null, place: null,
                    spouse_id: s, spouse_name: byId[s].name });
      }
    }
    for (const m of mars) if (m.spouse_id && byId[m.spouse_id]) m.spouse_name = byId[m.spouse_id].name;
    q.marriages = mars;

    if (rootId) {
      const [rel, side] = describe(graph, rootId, q.id);
      q.relationship_to_root = rel;
      q.relationship_side = side;
      const persAnc = graph.ancestors(q.id);
      const ca = lca(rootAnc, persAnc);
      q.generation = ca ? rootAnc[ca] - persAnc[ca] : null;
      q.connected_to_root = reachable.has(q.id);
    }

    q.abilities = (q.abilities || []).filter(a => a && a.name).slice(0, 2);
    applyDerived(q);
    q.tier = TIERS[q.abilities.length];
    q.traits = deriveTraits(q);
    q.playable = !!q.birth_year;
    q.ready = !!q.ready && !!q.birth_year;
    q.name = [q.given, q.surname, q.suffix].filter(Boolean).join(' ').trim()
             || q.name || '(unknown)';
  }

  const rank = { todo: 0, drafted: 1, done: 2 };
  people.sort((a, b) =>
    (rank[a.status] ?? 0) - (rank[b.status] ?? 0)
    || (a.generation ?? 99) - (b.generation ?? 99)
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { people, graph, rootId };
}

/* A blank person record with every field the game reads, so nothing anywhere
 * has to guard against a half-shaped object. */
function blankPerson(id) {
  return {
    id, fs_id: null, name: '', given: '', surname: '', suffix: null, sex: null,
    birth_year: null, death_year: null, birth_date: null, death_date: null,
    birth_place: null, death_place: null, burial_place: null,
    places_lived: [], spouse_ids: [], children_ids: [], parent_ids: [],
    marriages: [], marriage_year: null, marriage_place: null,
    children_in_tree: 0, child_count: null, age_at_death: null,
    relationship_to_root: null, relationship_side: null, generation: null,
    connected_to_root: false, photo_url: null, story: '',
    source_note_count: 0, lds_ordinances: {}, possible_duplicate_of: [],
    merged_fs_ids: [], merged_ids: [], curation_notes: '', status: 'todo',
    saved_hits: [], newspaper_hits: [], searchable: false, living: false,
    abilities: [], tier: 'basic', traits: [], playable: false, ready: false,
    edited_fields: [], gedcom: null,
    added: true,   // created here, not read out of a GEDCOM
  };
}

/* Ids for people created in the editor. `@K<n>@` so they never collide with a
 * GEDCOM's `@I<n>@`, and so a re-import can tell them apart. */
function nextId(people) {
  let max = 0;
  for (const p of people) {
    const m = /^@K(\d+)@$/.exec(p.id);
    if (m) max = Math.max(max, +m[1]);
  }
  return '@K' + (max + 1) + '@';
}

function addPerson(people, fields) {
  const p = Object.assign(blankPerson(nextId(people)), fields || {});
  p.name = [p.given, p.surname, p.suffix].filter(Boolean).join(' ').trim() || p.name || '(unknown)';
  people.push(p);
  return p;
}

/* Links are stored on BOTH people. Writing one side only is the classic way to
 * get a spouse who is married to someone who is not married to them — the
 * relationship walk follows whichever side it reaches first, so the tree
 * disagrees with itself depending on where you start. */
function linkSpouse(byId, a, b) {
  if (!byId[a] || !byId[b] || a === b) return false;
  for (const [x, y] of [[a, b], [b, a]]) {
    byId[x].spouse_ids = byId[x].spouse_ids || [];
    if (!byId[x].spouse_ids.includes(y)) byId[x].spouse_ids.push(y);
  }
  return true;
}

function unlinkSpouse(byId, a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    if (byId[x]) byId[x].spouse_ids = (byId[x].spouse_ids || []).filter(i => i !== y);
  }
  if (byId[a]) byId[a].marriages = (byId[a].marriages || []).filter(m => m.spouse_id !== b);
  if (byId[b]) byId[b].marriages = (byId[b].marriages || []).filter(m => m.spouse_id !== a);
}

function linkChild(byId, parentId, childId) {
  if (!byId[parentId] || !byId[childId] || parentId === childId) return false;
  // A cycle would make ancestors() run forever. Refuse rather than hang.
  if (isAncestorOf(byId, childId, parentId)) return false;
  const par = byId[parentId], kid = byId[childId];
  par.children_ids = par.children_ids || [];
  kid.parent_ids = kid.parent_ids || [];
  if (!par.children_ids.includes(childId)) par.children_ids.push(childId);
  if (!kid.parent_ids.includes(parentId)) kid.parent_ids.push(parentId);
  return true;
}

function unlinkChild(byId, parentId, childId) {
  if (byId[parentId]) byId[parentId].children_ids =
    (byId[parentId].children_ids || []).filter(i => i !== childId);
  if (byId[childId]) byId[childId].parent_ids =
    (byId[childId].parent_ids || []).filter(i => i !== parentId);
}

/* Is `a` somewhere up `b`'s parent chain? Guards against making someone their
 * own grandparent, which the editor makes trivially easy to attempt. */
function isAncestorOf(byId, a, b) {
  const seen = new Set([b]);
  const stack = [b];
  while (stack.length) {
    const x = stack.pop();
    for (const p of (byId[x] && byId[x].parent_ids) || []) {
      if (p === a) return true;
      if (!seen.has(p)) { seen.add(p); stack.push(p); }
    }
  }
  return false;
}

function removePerson(people, id) {
  const i = people.findIndex(p => p.id === id);
  if (i < 0) return false;
  people.splice(i, 1);
  for (const p of people) {
    p.spouse_ids = (p.spouse_ids || []).filter(x => x !== id);
    p.parent_ids = (p.parent_ids || []).filter(x => x !== id);
    p.children_ids = (p.children_ids || []).filter(x => x !== id);
    p.marriages = (p.marriages || []).filter(m => m.spouse_id !== id);
  }
  return true;
}

/* The /api/relate reply, computed locally. */
function relate(graph, byId, a, b) {
  if (!(a in graph.ind) || !(b in graph.ind)) return { error: 'unknown person' };
  if (a === b) return { ok: true, same: true };
  const [rel, side] = describe(graph, a, b);
  const [back] = describe(graph, b, a);
  const chain = connectionPath(graph, a, b);
  return {
    ok: true,
    a: { id: a, name: graph.ind[a].name },
    b: { id: b, name: graph.ind[b].name },
    relationship: rel,
    side,
    reverse: back,
    blood: rel !== null,
    connected: chain !== null,
    steps: chain ? chain.length - 1 : null,
    path: (chain || []).map(([x, how]) => ({
      id: x,
      name: graph.ind[x].name,
      sex: graph.ind[x].sex,
      link: how,
      playable: !!(byId[x] && byId[x].birth_year),
    })),
  };
}

/* -------------------------------------------------------- the root picker */

/* An uploaded file does not say who "you" are, and every relationship word in
 * the game is measured from that person. Rank the plausible candidates so the
 * picker can lead with a good guess instead of an alphabetical list.
 *
 * The best root is someone the whole tree hangs off: reachable from the most
 * people, and youngest — a pedigree export is almost always centred on its
 * most recent descendant.
 */
function guessRoots(parsed, limit) {
  const { ind, fam } = parsed;
  const graph = new Graph(ind, fam);
  const scored = Object.keys(ind).map(x => {
    const reach = graph.connected(x).size;
    const p = ind[x];
    const birth = p.events.BIRT || p.events.CHR;
    const year = birth ? birth.year : null;
    return {
      id: x,
      name: p.name,
      sex: p.sex,
      birth_year: year,
      reach,
      // Someone with parents in the file but no children is the classic
      // "the person this export was made for" shape.
      leaf: (graph.parents[x] || []).length > 0 && (graph.children[x] || []).length === 0,
    };
  });
  const maxReach = Math.max(1, ...scored.map(s => s.reach));
  for (const s of scored) {
    s.score = (s.reach / maxReach) * 100
      + (s.year == null ? 0 : 0)
      + (s.birth_year ? (s.birth_year - 1500) / 100 : 0)
      + (s.leaf ? 12 : 0);
  }
  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  return scored.slice(0, limit || 40);
}

/* --------------------------------------------------------------- the API */

/* One call from a file's text to everything the game needs. */
function loadGedcom(text, rootId, curation) {
  const parsed = parseGedcom(text);
  const ids = Object.keys(parsed.ind);
  if (!ids.length) throw new Error('No people found. Is this a GEDCOM (.ged) file?');
  const root = rootId && parsed.ind[rootId] ? rootId : guessRoots(parsed, 1)[0].id;
  const { people, graph } = buildPeople(parsed, root, curation);
  return { people, graph, parsed, rootId: root };
}

window.TREE = {
  parseGedcom, parseRecords, Graph, describe, connectionPath,
  buildPeople, relate, guessRoots, loadGedcom,
  shortPlace, region, deriveTraits, applyDerived, yearOf,
  // editing a loaded family
  graphFrom, recompute, blankPerson, nextId, addPerson, removePerson,
  linkSpouse, unlinkSpouse, linkChild, unlinkChild, isAncestorOf,
};

})();
