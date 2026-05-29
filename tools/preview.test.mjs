import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

test('preview CLI wraps rendered markup in an 800x480 frame', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trmnl-preview-test-'));
  await writeFile(join(dir, 'tpl.liquid'), '<div class="screen">hello</div>');
  const out = join(dir, 'preview.html');
  await exec(process.execPath, [
    'tools/preview.mjs',
    '--template', join(dir, 'tpl.liquid'),
    '--out', out,
  ]);
  const html = await readFile(out, 'utf8');
  assert.match(html, /<html/);
  assert.match(html, /width: 800px/);
  assert.match(html, /height: 480px/);
  assert.match(html, /hello/);
});
