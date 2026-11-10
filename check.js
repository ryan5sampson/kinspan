/* node check.js -- fails loudly if the Gift catalog and the game drift apart. */
const fs = require('fs'), assert = require('assert');
global.window = global;
require('./rules.js');
const play = fs.readFileSync(__dirname + '/play.html', 'utf8');

for (const kind of Object.keys(ABILITY_EFFECTS)) {
  assert(new RegExp(`case '${kind}'`).test(play), `play.html has no case for '${kind}'`);
  assert(ABILITY_EFFECTS[kind].verb(2), `${kind} has no verb`);
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

buildAbilities(people, 0);
const legacy = { ...people[0], abilities: [{ name: 'Grandma\'s Pie', text: 'She baked.' }] };
const [a] = abilitiesOf(legacy);
assert.equal(a.kind, 'time', 'an old effect-less Gift borrows the one its life suggests');
assert.equal(a.why, 'She baked.');
assert(abilitiesOf(people[0]).length === 0, 'rate 0 gives no generated Gift');
for (const m of MODES) for (const k of Object.keys(m.set))
  assert(k in DEFAULT_SETTINGS, `mode ${m.id}: unknown setting ${k}`);
assert.equal(modeSettings('quick').selection, 'random');
assert.equal(modeSettings('nope').selection, DEFAULT_SETTINGS.selection, 'an unknown mode plays Classic');
console.log(`ok — ${MODES.length} modes, ${GIFTS.length} Gifts, ${Object.keys(ABILITY_EFFECTS).length} effects`);
