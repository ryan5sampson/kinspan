/* family.js — the save file.
 *
 * Kinspan ships with NO family data. You bring your own, and what you get back
 * is a file you keep: drop in a .ged once, then everything after that is a
 * .kinspan file that carries your corrections, your writing and anyone you
 * added. Load it, play, save it, send it to your mother. Like a memory card.
 *
 * Nothing is ever uploaded. There is no server to upload to — this is a folder
 * of static files. Keep it that way: the title screen makes that promise in
 * writing, and an upload endpoint would turn it into a lie.
 *
 * The file IS the source of truth after import. A .ged is only ever an import
 * format, because it cannot hold a story, a Gift, or a person you added.
 */
(function () {
'use strict';

const FORMAT = 1;                       // bump only on a breaking shape change
const AUTOSAVE = 'kinspan.autosave';    // survives a refresh; NOT the save file
const EXT = '.kinspan';

let cache = null;   // {people, byId, graph, meta, dirty}

/* ------------------------------------------------------------ the file ---- */

function makeSave(fam) {
  return {
    kinspan: FORMAT,
    title: fam.meta.title || 'My family',
    root_id: fam.meta.root_id,
    root_name: fam.meta.root_name,
    saved: new Date().toISOString(),
    people: fam.people,
  };
}

/* Accepts a save file. Also accepts one with no `kinspan` version field —
 * that was the shape bake_web_data.py wrote before the format was versioned,
 * and files handed out then should keep opening. */
function readSave(text, name) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not a Kinspan family file — it is not valid JSON.');
  }
  if (!doc || !Array.isArray(doc.people) || !doc.people.length) {
    throw new Error('That file has no people in it.');
  }
  if (doc.kinspan && doc.kinspan > FORMAT) {
    throw new Error('That file was saved by a newer version of Kinspan.');
  }
  const people = doc.people;
  const rootId = doc.root_id && people.some(p => p.id === doc.root_id)
    ? doc.root_id : people[0].id;
  // Re-derive rather than trusting what was saved: an older file may predate a
  // change to how traits or relationships are worked out.
  const out = window.TREE.recompute(people, rootId);
  const root = out.people.find(p => p.id === out.rootId);
  return {
    people: out.people,
    graph: out.graph,
    meta: {
      kind: 'save',
      title: doc.title || (name ? name.replace(/\.[^.]+$/, '') : 'My family'),
      blurb: name || '',
      root_id: out.rootId,
      root_name: root ? root.name : null,
      saved: doc.saved || null,
    },
  };
}

/* A .ged is an import: parse it, pick who it centres on, and from then on the
 * save file takes over. */
function fromGedcom(text, rootId, title) {
  const built = window.TREE.loadGedcom(text, rootId, null);
  const root = built.people.find(p => p.id === built.rootId);
  return {
    people: built.people,
    graph: built.graph,
    meta: {
      kind: 'save',
      title: title || (root ? familyTitle(root.name) : 'My family'),
      blurb: '',
      root_id: built.rootId,
      root_name: root ? root.name : null,
      saved: null,
    },
  };
}

function familyTitle(name) {
  if (!name) return 'My family';
  const last = String(name).trim().split(/\s+/).pop();
  return last ? `The ${last} family` : 'My family';
}

/* ------------------------------------------------------- load and hold ---- */

function use(fam) {
  fam.byId = Object.fromEntries(fam.people.map(p => [p.id, p]));
  fam.dirty = false;
  cache = fam;
  autosave();
  return fam;
}

/* Rebuild everything derived, then remember. Call after any edit. */
function touched() {
  if (!cache) return null;
  const out = window.TREE.recompute(cache.people, cache.meta.root_id);
  cache.people = out.people;
  cache.graph = out.graph;
  cache.meta.root_id = out.rootId;
  const root = cache.byId[out.rootId] || out.people.find(p => p.id === out.rootId);
  cache.meta.root_name = root ? root.name : null;
  cache.byId = Object.fromEntries(cache.people.map(p => [p.id, p]));
  cache.dirty = true;
  autosave();
  return cache;
}

/* --------------------------------------------------------- the autosave ---- */

/* Not the save file — a crash net, so a refresh mid-game does not throw away
 * an hour of writing. The file the player keeps is the one they download; this
 * is per-browser and silently lost by a cleared cache, so never present it as
 * a backup. A big tree can exceed the quota, which is not an error worth
 * showing: the session still works, it just will not survive a reload. */
function autosave() {
  if (!cache) return false;
  try {
    localStorage.setItem(AUTOSAVE, JSON.stringify(makeSave(cache)));
    return true;
  } catch (e) { return false; }
}

function hasAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.people) || !doc.people.length) return null;
    return { title: doc.title, saved: doc.saved,
             people: doc.people.length,
             playable: doc.people.filter(p => p.birth_year).length };
  } catch (e) { return null; }
}

function loadAutosave() {
  const raw = localStorage.getItem(AUTOSAVE);
  if (!raw) throw new Error('Nothing saved in this browser.');
  return use(readSave(raw, null));
}

function clearAutosave() {
  try { localStorage.removeItem(AUTOSAVE); } catch (e) {}
}

/* --------------------------------------------------------------- saving ---- */

function fileName(fam) {
  const slug = (fam.meta.title || 'family').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family';
  return slug + EXT;
}

/* Hand the player their file. A blob URL + a synthetic click is the only way
 * that works everywhere, iOS Safari included. */
function download(fam) {
  fam = fam || cache;
  if (!fam) throw new Error('Nothing to save.');
  const text = JSON.stringify(makeSave(fam), null, 1);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(fam);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download on some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  fam.dirty = false;
  return a.download;
}

/* ------------------------------------------------------------ entry point -- */

/* What both game pages call. Returns null when nothing has been loaded, so the
 * caller can send the player to the title screen instead of erroring. */
async function load() {
  if (cache) return cache;
  if (hasAutosave()) {
    try { return loadAutosave(); } catch (e) { clearAutosave(); }
  }
  return null;
}

const playable = fam => fam.people.filter(p => p.playable);
const relate = (fam, a, b) => window.TREE.relate(fam.graph, fam.byId, a, b);

window.FAMILY = {
  FORMAT, EXT,
  load, use, touched, readSave, fromGedcom, familyTitle,
  makeSave, download, fileName,
  hasAutosave, loadAutosave, clearAutosave, autosave,
  playable, relate,
  get current() { return cache; },
};

})();
