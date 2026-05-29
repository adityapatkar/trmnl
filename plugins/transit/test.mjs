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

async function renderAll({ predictions = 'wmata-predictions', buses = 'fairfax-predictions', incidents = 'wmata-incidents-empty', bulletins = 'fairfax-bulletins-empty', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [
      await loadFixture(predictions),
      await loadFixture(buses),
      await loadFixture(incidents),
      await loadFixture(bulletins),
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

test('shows a setup placeholder when WMATA API key is blank', async () => {
  const html = await renderAll({ form: { wmata_api_key: '' } });
  assert.match(html, /add your WMATA API key/i);
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
