import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('the Git bundle is discoverable and has matching runtime and locale entries', async () => {
  assert.notEqual(pkg.private, true);
  assert.ok(pkg.keywords.includes('dsh-plugin'));
  assert.ok(pkg.engines.dsh);
  assert.equal(pkg.dsh.client.platform, 'web');
  const patch = await readFile(new URL(pkg.dsh.bundle.patch, root), 'utf8');
  assert.ok(patch.includes(`name: "${pkg.name}"`));
  for (const entry of ['.', './client', './icon']) await readFile(new URL(pkg.exports[entry], root));
  for (const lang of ['en', 'zh']) {
    const file = pkg.exports['./locale/*'].replace('*', `${lang}.json`);
    const locale = JSON.parse(await readFile(new URL(file, root), 'utf8'));
    assert.ok(locale.meta.title && locale.meta.description);
  }
  for (const hook of ['prepare', 'preinstall', 'install', 'postinstall']) assert.equal(pkg.scripts[hook], undefined);
  assert.equal(pkg.dependencies, undefined, 'No runtime dependencies are installed by this presentation bundle');
});

test('the committed browser entry exactly matches a fresh build', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'dsh-ascii-build-'));
  try {
    const output = path.join(temporary, 'client.js');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/build.mjs', root))], {
      env: { ...process.env, DSH_BUNDLE_OUT: output }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(output, 'utf8'), await readFile(new URL('client.js', root), 'utf8'));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
