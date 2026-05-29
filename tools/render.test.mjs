import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

async function tempFiles() {
  const dir = await mkdtemp(join(tmpdir(), 'trmnl-render-test-'));
  await writeFile(join(dir, 'tpl.liquid'), '<p>{{ name }} — {{ IDX_0.x }}</p>');
  await writeFile(join(dir, 'form.json'), JSON.stringify({ name: 'hi' }));
  await writeFile(join(dir, 'idx0.json'), JSON.stringify({ x: 42 }));
  return dir;
}

test('CLI renders a template against form fields and IDX inputs', async () => {
  const dir = await tempFiles();
  const { stdout } = await exec(process.execPath, [
    'tools/render.mjs',
    '--template', join(dir, 'tpl.liquid'),
    '--form-fields', join(dir, 'form.json'),
    '--idx-0', join(dir, 'idx0.json'),
  ]);
  assert.equal(stdout.trim(), '<p>hi — 42</p>');
});
