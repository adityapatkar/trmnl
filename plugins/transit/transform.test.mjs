import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Load the transform.js source and evaluate it in a sandbox that mimics
// TRMNL's Sandbox Runtime: no Node globals available, single function defined.
const transformSrc = await readFile(new URL('./transform.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(transformSrc, ctx);
const transform = ctx.transform;

async function loadFixture(name) {
  return JSON.parse(await readFile(new URL(`./samples/${name}.json`, import.meta.url), 'utf8'));
}

async function makeInput({ cabiIds = '0826359a-1f3f-11e7-bf6b-3863bb334450,08263601-1f3f-11e7-bf6b-3863bb334450' } = {}) {
  return {
    IDX_0: await loadFixture('wmata-predictions'),
    IDX_1: await loadFixture('fairfax-predictions'),
    IDX_2: await loadFixture('wmata-incidents-empty'),
    IDX_3: await loadFixture('fairfax-bulletins-empty'),
    IDX_4: await loadFixture('cabi-status'),
    trmnl: {
      plugin_settings: {
        custom_fields_values: { cabi_station_ids: cabiIds, cabi_station_names: '' },
      },
    },
  };
}

test('filters IDX_4 stations to the configured cabi_station_ids', async () => {
  const out = transform(await makeInput());
  assert.equal(out.IDX_4.data.stations.length, 2);
  const ids = new Set(out.IDX_4.data.stations.map(s => s.station_id));
  assert.ok(ids.has('0826359a-1f3f-11e7-bf6b-3863bb334450'));
  assert.ok(ids.has('08263601-1f3f-11e7-bf6b-3863bb334450'));
});

test('passes IDX_0..IDX_3 through untouched', async () => {
  const input = await makeInput();
  const out = transform(input);
  assert.deepEqual(out.IDX_0, input.IDX_0);
  assert.deepEqual(out.IDX_1, input.IDX_1);
  assert.deepEqual(out.IDX_2, input.IDX_2);
  assert.deepEqual(out.IDX_3, input.IDX_3);
});

test('returns empty stations array when cabi_station_ids is blank', async () => {
  const out = transform(await makeInput({ cabiIds: '' }));
  assert.equal(out.IDX_4.data.stations.length, 0);
});

test('output payload is well under the 100KB TRMNL ceiling', async () => {
  const out = transform(await makeInput());
  const size = JSON.stringify(out).length;
  assert.ok(size < 100 * 1024, `output is ${size} bytes; must be < 100KB`);
  // Sanity: should also be much smaller than the raw input
  const inputSize = JSON.stringify(await makeInput()).length;
  assert.ok(size < inputSize, `transform should shrink the payload (in=${inputSize}, out=${size})`);
});

test('preserves last_updated and ttl from the original GBFS response', async () => {
  const input = await makeInput();
  const out = transform(input);
  assert.equal(out.IDX_4.last_updated, input.IDX_4.last_updated);
  assert.equal(out.IDX_4.ttl, input.IDX_4.ttl);
});

test('handles missing IDX_4 gracefully (e.g. polling URL not yet configured)', async () => {
  // Configured stations exist but IDX_4 didn't arrive → each station gets an
  // _offline stub so the markup shows "station offline" rather than silently hiding.
  const input = await makeInput();
  delete input.IDX_4;
  const out = transform(input);
  assert.equal(out.IDX_4.data.stations.length, 2);
  assert.ok(out.IDX_4.data.stations.every(s => s._offline === true));
});

test('handles missing trmnl.plugin_settings gracefully (no configured stations)', async () => {
  // No form fields → no configured IDs → no stations rendered (row hides).
  const input = await makeInput();
  delete input.trmnl;
  const out = transform(input);
  assert.equal(out.IDX_4.data.stations.length, 0);
});

test('stamps display_name from cabi_station_names onto each filtered station', async () => {
  const input = await makeInput();
  input.trmnl.plugin_settings.custom_fields_values.cabi_station_names = 'South Dock,North Dock';
  const out = transform(input);
  assert.equal(out.IDX_4.data.stations[0].display_name, 'South Dock');
  assert.equal(out.IDX_4.data.stations[1].display_name, 'North Dock');
});

test('uses station_id as display_name when cabi_station_names is blank', async () => {
  const input = await makeInput();
  input.trmnl.plugin_settings.custom_fields_values.cabi_station_names = '';
  const out = transform(input);
  assert.equal(out.IDX_4.data.stations[0].display_name, out.IDX_4.data.stations[0].station_id);
});
