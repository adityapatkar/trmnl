import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS = join(REPO_ROOT, 'plugins');

// TRMNL's form builder wants a bare top-level YAML sequence of field mappings.
// Wrapping them under a root key — `custom_fields:` is the tempting one, since
// that's what the transform's input calls them — is rejected in admin with
// "custom fields should be valid yaml", which doesn't point at the cause.
test('every form-fields.yaml is a bare top-level sequence', async () => {
  const dirs = (await readdir(PLUGINS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let checked = 0;
  for (const name of dirs) {
    const path = join(PLUGINS, name, 'form-fields.yaml');
    if (!existsSync(path)) continue;
    checked++;

    const lines = (await readFile(path, 'utf8'))
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'));
    const roots = lines.filter((l) => /^\S/.test(l));

    assert.ok(roots.length > 0, `${name}: no fields defined`);
    for (const line of roots) {
      assert.ok(
        line.startsWith('- '),
        `${name}/form-fields.yaml has a root key ${JSON.stringify(line)} — TRMNL wants a bare list of fields, not a wrapper mapping`,
      );
    }
  }
  assert.ok(checked >= 5, `expected to check several plugins, checked ${checked}`);
});

test('every form-fields.yaml field declares keyname, field_type and name', async () => {
  const dirs = (await readdir(PLUGINS, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const name of dirs) {
    const path = join(PLUGINS, name, 'form-fields.yaml');
    if (!existsSync(path)) continue;

    const body = await readFile(path, 'utf8');
    // Split on the "- keyname:" boundaries that start each field.
    const blocks = body.split(/^- /m).slice(1);
    assert.ok(blocks.length > 0, `${name}: no field blocks found`);
    for (const block of blocks) {
      for (const key of ['keyname', 'field_type', 'name']) {
        assert.match(block, new RegExp(`(^|\\n)\\s*${key}:`), `${name}: a field is missing ${key}`);
      }
    }
  }
});
