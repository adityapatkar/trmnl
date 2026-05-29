import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from './render-lib.mjs';

test('renders a basic Liquid template with form fields and IDX vars', async () => {
  const tpl = '<p>{{ form_field }} — {{ IDX_0.value }}</p>';
  const html = await renderTemplate(tpl, {
    formFields: { form_field: 'hello' },
    idxResponses: [{ value: 'world' }],
  });
  assert.equal(html.trim(), '<p>hello — world</p>');
});

test('renders without IDX_0 access if no responses supplied (uses blank)', async () => {
  const tpl = "{% if IDX_0 %}has{% else %}none{% endif %}";
  const html = await renderTemplate(tpl, { formFields: {}, idxResponses: [] });
  assert.equal(html.trim(), 'none');
});

test('exposes a "now" timestamp the template can use', async () => {
  const tpl = '{{ now | date: "%Y" }}';
  const html = await renderTemplate(tpl, {
    formFields: {}, idxResponses: [], now: new Date('2026-05-28T14:32:00Z'),
  });
  assert.equal(html.trim(), '2026');
});
