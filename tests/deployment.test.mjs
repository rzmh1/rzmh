import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../server/index.mjs';
import { config } from '../server/config.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('all shipped frontend files are served with correct MIME types; private/source paths are not public', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ruzmah-static-'));
  const app = createApp(config({ DATA_DIR: dir }));
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    for (const folder of ['dist', 'dist/assets']) {
      for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = `/${folder === 'dist' ? '' : 'assets/'}${entry.name}`;
        const response = await fetch(origin + path);
        assert.equal(response.status, 200, path);
        assert.equal(Buffer.from(await response.arrayBuffer()).length, (await readFile(join(root, folder, entry.name))).length, path);
        if (entry.name.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
        if (entry.name.endsWith('.css')) assert.match(response.headers.get('content-type'), /text\/css/);
      }
    }
    for (const path of ['/.env', '/runtime/ruzmah.sqlite', '/server/index.mjs', '/package.json', '/docs/README-v1.md', '/missing.js']) {
      assert.equal((await fetch(origin + path)).status, 404, path);
    }
    assert.equal((await fetch(origin + '/%E0%A4%A')).status, 400);
    assert.equal((await fetch(origin + '/%00')).status, 400);
    assert.equal((await fetch(origin + '/%2e%2e%2fserver/index.mjs')).status, 403);
    const head = await fetch(origin + '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const body of ['null', '[]', '1', '"text"', '{broken']) {
      const response = await fetch(origin + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, 400, body);
    }
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('production configuration fails before database access on invalid origin, key, port, storage or backup intervals', () => {
  const valid = { NODE_ENV: 'production', APP_ORIGIN: 'https://ruzmah.example', APP_KEY: randomBytes(32).toString('base64') };
  assert.equal(config(valid).host, '0.0.0.0');
  assert.equal(config({ ...valid, PORT: '8080' }).port, 8080);
  for (const invalid of [
    { APP_ORIGIN: 'http://ruzmah.example' }, { APP_ORIGIN: 'https://ruzmah.example/' },
    { APP_ORIGIN: 'file://' }, { APP_KEY: '' }, { PORT: 'bad' }, { PORT: '-1' }, { PORT: '65536' },
    { STORAGE_DRIVER: 'unknown' }, { BACKUP_INTERVAL_HOURS: '-1' }, { BACKUP_INTERVAL_HOURS: '999999' },
    { BACKUP_RETENTION_DAYS: '-1' }, { MAX_UPLOAD_BYTES: 'NaN' },
  ]) assert.throws(() => config({ ...valid, ...invalid }));
});

test('setup preserves existing secrets; CLI starts from another cwd and shuts down on SIGTERM', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ruzmah-cli-'));
  let child;
  try {
    await exec(process.execPath, [join(root, 'scripts/setup.mjs')], { cwd: dir });
    const envPath = join(dir, '.env');
    const before = await readFile(envPath, 'utf8');
    await exec(process.execPath, [join(root, 'scripts/setup.mjs')], { cwd: dir });
    assert.equal(await readFile(envPath, 'utf8'), before);
    child = spawn(process.execPath, [join(root, 'server/index.mjs')], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: 'development', DATA_DIR: join(dir, 'data'), PORT: '0', APP_ORIGIN: 'http://localhost:3000', APP_KEY: randomBytes(32).toString('base64') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    await Promise.race([
      new Promise((resolve, reject) => {
        child.stdout.on('data', () => resolve());
        child.once('error', reject);
        child.once('exit', code => reject(Error(`CLI exited early: ${code}`)));
      }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('CLI startup timed out')), 10000); timer.unref(); }),
    ]);
    child.kill('SIGTERM');
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    // Opening the same DB after termination verifies that the SQLite file survives.
    const store = createApp(config({ DATA_DIR: join(dir, 'data') }));
    assert(store.store.getContent().courses.length > 0);
    store.server.emit('close');
    await Promise.resolve();
  } finally {
    if (child && child.exitCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
