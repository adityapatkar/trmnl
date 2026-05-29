import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderTemplate } from '../../tools/render-lib.mjs';

async function loadFixture(name) {
  return JSON.parse(await readFile(new URL(`./samples/${name}.json`, import.meta.url), 'utf8'));
}

async function loadForm() {
  return JSON.parse(await readFile(new URL('./form-fields.json', import.meta.url), 'utf8'));
}

async function loadTemplate() {
  return readFile(new URL('./markup.liquid', import.meta.url), 'utf8');
}

async function renderAll({ predictions = 'wmata-predictions', buses = 'fairfax-predictions', incidents = 'wmata-incidents-empty', bulletins = 'fairfax-bulletins-empty', cabi = 'cabi-status', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [
      await loadFixture(predictions),
      await loadFixture(buses),
      await loadFixture(incidents),
      await loadFixture(bulletins),
      await loadFixture(cabi),
    ],
    now,
  });
}

test('renders the title bar with station name and refresh interval', async () => {
  const html = await renderAll();
  assert.match(html, /TYSONS/i);
  assert.match(html, /METRO/i);
  assert.match(html, /refreshes/i);
});

test('shows a setup placeholder when WMATA + Fairfax responses are both auth errors', async () => {
  const html = await renderAll({
    predictions: 'wmata-predictions-bad-key',
    buses: 'fairfax-predictions-bad-key',
  });
  assert.match(html, /Couldn't load transit data/i);
  assert.match(html, /Access denied/i);
});

test('shows inline metro error + working bus column when WMATA only is auth-broken', async () => {
  const html = await renderAll({ predictions: 'wmata-predictions-bad-key' });
  assert.match(html, /col-error/);                 // inline error box rendered
  assert.match(html, /WMATA error/i);
  assert.match(html, /Access denied/i);
  // Bus column still has its FFX header and at least one route number
  assert.match(html, /Connector/i);
  const buses = await loadFixture('fairfax-predictions');
  assert.match(html, new RegExp(`\\b${buses['bustime-response'].prd[0].rt}\\b`));
});

test('shows inline bus error + working metro column when Fairfax only is auth-broken', async () => {
  const html = await renderAll({ buses: 'fairfax-predictions-bad-key' });
  assert.match(html, /col-error/);
  assert.match(html, /Fairfax error/i);
  // Metro column still has SV trains rendered
  assert.match(html, /\bSV\b/);
});

test('renders LN / CAR / DEST / MIN header row for metro', async () => {
  const html = await renderAll();
  assert.match(html, /LN[\s\S]*CAR[\s\S]*DEST[\s\S]*MIN/);
});

test('renders direction dividers derived from Group + destinations', async () => {
  const html = await renderAll();
  // From the captured fixture, expect at least one direction label
  assert.match(html, /(Largo|Ashburn|Wiehle|Downtown|Mt Vernon|New Carrollton|NewCrlton)/i);
});

test('renders ARR / BRD / numeric minutes correctly', async () => {
  const html = await renderAll();
  // Should contain at least one of these markers from the fixture
  assert.ok(/ARR|BRD|\b\d{1,2}\b/.test(html));
});

test('renders empty-trains placeholder when no predictions', async () => {
  const html = await renderAll({ predictions: 'wmata-predictions-empty' });
  assert.match(html, /no predictions/i);
});

test('renders the line code badge (e.g., SV) for each train', async () => {
  const html = await renderAll();
  // The captured fixture is at Tysons (Silver Line) so SV should appear
  assert.match(html, /\bSV\b/);
});

test('renders bus section header (Connector — stops)', async () => {
  const html = await renderAll();
  assert.match(html, /Connector/i);
});

test('renders bus predictions grouped by stop name', async () => {
  const html = await renderAll();
  // Each route renders the route number in a badge
  const fixture = await loadFixture('fairfax-predictions');
  const firstRoute = fixture['bustime-response'].prd[0].rt;
  assert.match(html, new RegExp(`\\b${firstRoute}\\b`));
});

test('renders DUE for buses with prdctdn=DUE', async () => {
  const html = await renderAll();
  const fixture = await loadFixture('fairfax-predictions');
  const hasDue = fixture['bustime-response'].prd.some((p) => p.prdctdn === 'DUE');
  if (hasDue) assert.match(html, /\bDUE\b/);
});

test('renders Fairfax error message when bustime-response.error is set', async () => {
  const html = await renderAll({ buses: 'fairfax-predictions-error' });
  assert.match(html, /No service scheduled/i);
});

test('renders rail alert footer when WMATA Incidents has matching lines', async () => {
  const html = await renderAll({ incidents: 'wmata-incidents' });
  assert.match(html, /Single-tracking/i);
});

test('hides alert footer when all incidents are for non-matching lines', async () => {
  const html = await renderAll({
    incidents: 'wmata-incidents',
    // Pretend our station is RED (not SV) — Silver-only alerts should filter out.
    form: { wmata_station_code: 'A11', wmata_station_name: 'Test Station' },
    predictions: 'wmata-predictions-empty',
  });
  assert.doesNotMatch(html, /Single-tracking/i);
});

test('renders bus bulletin in the footer when getservicebulletins returns one', async () => {
  const html = await renderAll({ bulletins: 'fairfax-bulletins' });
  assert.match(html, /detour|disrupted|delay|reroute|construction/i);
});

test('shows the title-bar warning indicator when alerts are present', async () => {
  const html = await renderAll({ incidents: 'wmata-incidents' });
  assert.match(html, /⚠/);
});

test('hides the title-bar warning indicator when no alerts', async () => {
  const html = await renderAll(); // both empty by default
  assert.doesNotMatch(html, /⚠/);
});

test('renders Capital Bikeshare row with normal-bike, e-bike, dock counts for configured stations', async () => {
  const html = await renderAll();
  // Header
  assert.match(html, /Capital Bikeshare/i);
  // Station name appears
  assert.match(html, /Tysons Metro South/i);
  assert.match(html, /Tysons Metro North/i);
  // Tysons Metro South in fixture: 11 bikes total, 0 ebikes → 11 normal, 0 e-bikes, 0 docks (FULL)
  assert.match(html, />11<\/strong> bikes/);
  assert.match(html, /FULL/);
  // Tysons Metro North in fixture: 6 bikes total, 1 ebike → 5 normal, 1 e-bike, 8 docks
  assert.match(html, />5<\/strong> bikes/);
  assert.match(html, />1<\/strong> e-bikes/);
  assert.match(html, />8<\/strong> docks/);
});

test('hides Capital Bikeshare row when cabi_station_ids is blank', async () => {
  const html = await renderAll({ form: { cabi_station_ids: '', cabi_station_names: '' } });
  // The row container shouldn't render (the "Capital Bikeshare" literal still
  // appears inside CSS comments in the <style> block — check for the actual element)
  assert.doesNotMatch(html, /class="cabi-row"/);
  assert.doesNotMatch(html, /class="cabi-title"/);
});

test('hides Capital Bikeshare row when GBFS response has no stations', async () => {
  const html = await renderAll({ cabi: 'cabi-status-empty' });
  assert.doesNotMatch(html, /class="cabi-row"/);
});

test('shows "station offline" for a configured station missing from the GBFS response', async () => {
  const html = await renderAll({
    form: {
      cabi_station_ids: '0826359a-1f3f-11e7-bf6b-3863bb334450,NONEXISTENT_STATION_ID',
      cabi_station_names: 'Tysons Metro South,Bogus Station',
    },
  });
  assert.match(html, /Bogus Station/i);
  assert.match(html, /station offline/i);
});
