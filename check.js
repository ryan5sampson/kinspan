/* node check.js -- fails loudly if the Gift catalog and the game drift apart. */
const fs = require('fs'), assert = require('assert');
global.window = global;
require('./rules.js');
const play = fs.readFileSync(__dirname + '/play.html', 'utf8');

for (const kind of Object.keys(ABILITY_EFFECTS)) {
  assert(new RegExp(`case '${kind}'`).test(play), `play.html has no case for '${kind}'`);
  const lo = giftTier(kind, 'low'), hi = giftTier(kind, 'high');
  assert(lo.effect && hi.effect, `${kind} has no words`);
  assert(hi.worth > lo.worth, `${kind}: the higher tier (${hi.worth}) must be worth more than the lower (${lo.worth})`);
  if (lo.gate) assert(new RegExp(`case '${lo.gate}'`).test(play), `play.html cannot open the '${lo.gate}' gate`);
}
for (const g of GIFTS) assert(ABILITY_EFFECTS[g.kind], `${g.name}: unknown kind ${g.kind}`);
assert(GIFTS[GIFTS.length - 1].when({}), 'the last Gift must fit anyone');

const P = (id, o) => ({ id, given: id, birth_year: 1900, ...o });
const kids = Array.from({ length: 8 }, (_, i) => P('k' + i, { parent_ids: ['big'] }));
const people = [
  P('old', { age_at_death: 93, death_year: 1993, parent_ids: ['x'] }),
  P('big', { child_count: 8, death_year: 1950, parent_ids: ['x'] }),
  P('mover', { birth_place: 'Cork, Ireland', death_place: 'Ogden, Utah, United States',
               death_year: 1980, parent_ids: ['x'] }),
  P('stay', { birth_place: 'Ogden, Utah', death_place: 'Ogden, Utah', death_year: 1960, parent_ids: ['x'] }),
  ...kids,
  ...['a1', 'a2', 'a3'].map(id => P(id, { birth_year: 1800, death_year: 1850 })), // the oldest
];
const c = giftContext(people), pick = id => suggestGift(people.find(p => p.id === id), c).gift;
assert.equal(pick('old'), 'refused');
assert.equal(pick('big'), 'cook');
assert.equal(pick('mover'), 'crossed');
assert.equal(pick('stay'), 'neverleft');

// The deal: of 80 unwritten Kin at 50%, 10 Biographies, 30 Stories, 40 Sketches.
const crowd = Array.from({ length: 80 }, (_, i) => P('c' + i, { birth_year: 1900 + i }));
buildAbilities(crowd, 50);
const tally = t => crowd.filter(p => p.tier === t).length;
assert.deepEqual([tally('rare'), tally('uncommon'), tally('basic')], [10, 30, 40], 'tier split is 1/8, 3/8, 1/2');
assert(crowd.every(p => (p.tier === 'basic') === !abilitiesOf(p).length), 'Sketches carry no Gift, the rest one each');
assert(crowd.filter(p => p.tier === 'uncommon').every(p => abilitiesOf(p)[0].tier === 'low'), 'Stories carry the lower tier');

// A written Gift sets the card's rarity: lower plays as a Story, else a Biography.
const story = P('w1', { abilities: [{ kind: 'draw', name: 'Low one', tier: 'low' }] });
buildAbilities([story], 0);
assert.equal(story.tier, 'uncommon'); assert.equal(abilitiesOf(story)[0].tier, 'low');
// The demo family ships playable, with Gifts written on most cards.
const demo = JSON.parse(fs.readFileSync(__dirname + '/demo.kinspan', 'utf8'));
assert(demo.people.filter(p => (p.abilities || []).length).length > demo.people.length / 2, 'demo cards carry Gifts');
assert(!/"lds_ordinances": \{\s*"/.test(JSON.stringify(demo, null, 1)) && demo.people.every(p => !p.fs_id), 'demo is stripped');

buildAbilities(people, 0);
const legacy = { ...people[0], abilities: [{ name: 'Grandma\'s Pie', text: 'She baked.' }] };
const [a] = abilitiesOf(legacy);
assert.equal(a.kind, 'time', 'an old effect-less Gift borrows the one its life suggests');
assert.equal(a.why, 'She baked.');
assert(abilitiesOf(people[0]).length === 0, 'rate 0 gives no generated Gift');
for (const m of MODES) for (const k of Object.keys(m.set))
  assert(k in DEFAULT_SETTINGS, `mode ${m.id}: unknown setting ${k}`);
for (const id of [...MODES.map(m => m.id), 'tutorial', 'custom']) assert(LOGOS[id], `no logo variant for ${id}`);
assert.equal(modeSettings('quick').selection, 'random');
assert.equal(modeSettings('nope').selection, DEFAULT_SETTINGS.selection, 'an unknown mode plays Classic');
// Every page asks for the same version of the scripts, so a deploy can never
// pair a fresh page with a cached script from the one before. Bump ?v= on
// every page whenever a .js file changes.
const vs = new Set(['index', 'play', 'edit', 'settings'].flatMap(p =>
  [...fs.readFileSync(`${__dirname}/${p}.html`, 'utf8').matchAll(/(?:<script src|stylesheet" href)="\w+\.(?:js|css)(\?v=\d+)?"/g)].map(m => m[1])));
assert(vs.size === 1 && [...vs][0], `pages ask for different script versions: ${[...vs]}`);
console.log(`ok — ${MODES.length} modes, ${GIFTS.length} Gifts, ${Object.keys(ABILITY_EFFECTS).length} effects`);
