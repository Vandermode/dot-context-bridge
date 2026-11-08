import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { onboard, verifyExisting, parseSmokeReport } from '../scripts/onboard.mjs';
import { renderTunnelConfig, writeTunnelConfig } from '../scripts/tunnel-config.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(fn) {
  const temp = await mkdtemp(join(tmpdir(), 'bridge-onboard-'));
  const out = join(temp, 'installation');
  const calls = [];
  const deps = {
    setupNativeConfig: async () => ({ codex: { version: 'codex-cli test' } }),
    resolveExecutable: async () => ({ version: 'codex-cli test' }),
    prepare: async () => { calls.push('prepare'); },
    setup: async () => {
      calls.push('setup'); await mkdir(out);
      const config = join(out, 'device.json');
      const command = { command: process.execPath, args: [join(root, 'bridge/server.mjs'), config], cwd: root };
      await writeFile(config, JSON.stringify({ id: 'server', label: 'Test server', native: { executable: process.execPath, codex_home: temp } }));
      await writeFile(join(out, 'command.json'), JSON.stringify(command));
      return { config, command, directory: out };
    },
    checkSchema: async () => { calls.push('schema'); },
    smoke: async (_config, options) => {
      calls.push(options.thread || options.search ? 'content' : 'metadata');
      return { passed: ['catalog and write denial', 'native metadata listing', ...(options.thread ? ['protected turn page'] : []), ...(options.search ? ['protected native search'] : [])], creates_threads: false, history_requested: Boolean(options.thread), search_requested: Boolean(options.search) };
    },
  };
  try { await fn({ temp, out, calls, deps, options: { out, 'codex-home': temp } }); }
  finally { await rm(temp, { recursive: true, force: true }); }
}

test('inspect detects but creates no configuration, runs no schema/body reads, and never claims E2E', async () => fixture(async ({ temp, out, calls, deps, options }) => {
  const result = await onboard({ ...options, 'tunnel-id': 'example-private' }, deps);
  assert.equal(result.mode, 'inspect');
  assert.equal(result.steps.environment.status, 'passed');
  assert.equal(result.steps.configuration.status, 'pending');
  assert.equal(result.steps.tunnel_profile.status, 'pending');
  assert.equal(result.steps.local_content.status, 'not_run');
  assert.equal(result.end_to_end_verified, false);
  assert.deepEqual(calls, []); assert.deepEqual(await readdir(temp), []);
  assert.equal(result.device.configuration, out);
}));

test('apply prepares fresh reader, validates metadata, and only generates private Tunnel profile', async () => fixture(async ({ out, calls, deps, options }) => {
  const result = await onboard({ ...options, apply: true, prepare: true, 'tunnel-id': 'example-private' }, deps);
  assert.deepEqual(calls, ['prepare', 'setup', 'schema', 'metadata']);
  assert.equal(result.steps.local_metadata.status, 'passed');
  assert.equal(result.steps.local_content.status, 'not_run');
  assert.equal(result.steps.tunnel_profile.status, 'passed');
  for (const key of ['private_tunnel', 'cloud_chat', 'cloud_dot', 'local_isolation', 'background_service']) assert.equal(result.steps[key].status, 'not_run');
  const yaml = await readFile(join(out, 'tunnel.yaml'), 'utf8');
  assert.match(yaml, /env:CONTROL_PLANE_API_KEY/); assert.match(yaml, /127\.0\.0\.1:0/);
  assert.doesNotMatch(yaml, /0\.0\.0\.0/); assert.equal(result.end_to_end_verified, false);
}));

test('content reads require explicit options and pagination not encountered is never marked passed', async () => fixture(async ({ deps, options, calls }) => {
  const result = await onboard({ ...options, apply: true, thread: 'synthetic-selected-thread', search: 'synthetic-selected-phrase' }, deps);
  assert.deepEqual(calls, ['setup', 'schema', 'metadata', 'content']);
  assert.deepEqual(result.content_checks, { history: 'passed', search: 'passed', turn_continuation: 'not_exercised', item_page: 'not_exercised', item_continuation: 'not_exercised', search_continuation: 'not_exercised' });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-selected-thread|synthetic-selected-phrase/);
}));

test('resume verifies a complete prior install, changes no source and does not overwrite a matching Tunnel', async () => fixture(async ({ deps, options, calls, out }) => {
  await onboard({ ...options, apply: true, 'tunnel-id': 'example-private' }, deps);
  calls.length = 0;
  const before = await readFile(join(out, 'device.json'), 'utf8');
  const result = await onboard({ out, apply: true, resume: true, 'tunnel-id': 'example-private' }, deps);
  assert.deepEqual(calls, ['schema', 'metadata']);
  assert.equal(result.steps.tunnel_profile.status, 'passed');
  assert.equal(await readFile(join(out, 'device.json'), 'utf8'), before);
  await assert.rejects(onboard({ ...options, apply: true, resume: true }, deps), /cannot change/);
}));

test('existing or partial installation is never deleted, overwritten or silently repaired', async () => fixture(async ({ deps, options, out, calls }) => {
  await mkdir(out); await writeFile(join(out, 'marker'), 'keep');
  const result = await onboard({ ...options, apply: true }, deps);
  assert.equal(result.steps.configuration.status, 'failed'); assert.deepEqual(calls, []);
  assert.equal(await readFile(join(out, 'marker'), 'utf8'), 'keep');
  const resumed = await onboard({ out, apply: true, resume: true }, deps);
  assert.equal(resumed.steps.environment.status, 'failed');
}));

test('schema failure leaves reader configuration reusable and never starts reads or profile generation', async () => fixture(async ({ deps, options, calls, out }) => {
  const result = await onboard({ ...options, apply: true, 'tunnel-id': 'example-private' }, { ...deps, checkSchema: async () => { throw new Error('Unsupported native schema'); } });
  assert.equal(result.steps.native_schema.status, 'failed'); assert.deepEqual(calls, ['setup']);
  assert.equal(result.steps.local_metadata.status, 'not_run');
  assert.ok((await verifyExisting(out)).native);
}));

test('protected content failure never retries with exact or creates Tunnel profile', async () => fixture(async ({ deps, options, calls }) => {
  const seen = [];
  const result = await onboard({ ...options, apply: true, thread: 'known', 'tunnel-id': 'example-private' }, { ...deps, smoke: async (_config, opts) => { seen.push(opts); if (opts.thread) throw new Error('Protected content rejected'); return { passed: ['catalog and write denial', 'native metadata listing'], creates_threads: false, history_requested: false, search_requested: false }; } });
  assert.equal(result.steps.local_metadata.status, 'passed'); assert.equal(result.steps.local_content.status, 'failed');
  assert.equal(result.steps.tunnel_profile.status, 'not_run'); assert.equal(seen.length, 2);
  assert.ok(seen.every(opts => !opts.content_policy)); assert.deepEqual(calls, ['setup', 'schema']);
}));

test('resume refuses injected commands, other checkout paths and unexpected command fields', async () => fixture(async ({ deps, options, out }) => {
  await onboard({ ...options, apply: true }, deps);
  const path = join(out, 'command.json'); const original = JSON.parse(await readFile(path, 'utf8'));
  for (const changed of [{ ...original, command: '/arbitrary' }, { ...original, args: ['-e', 'throw 1'] }, { ...original, env: { EXAMPLE: 'value' } }, { ...original, cwd: '/' }]) {
    await writeFile(path, JSON.stringify(changed)); await assert.rejects(verifyExisting(out), /does not match/);
  }
}));

test('resume preserves nonmatching Tunnel profile and reports mismatch instead of switching destination', async () => fixture(async ({ deps, options, out }) => {
  await onboard({ ...options, apply: true, 'tunnel-id': 'example-first' }, deps);
  const before = await readFile(join(out, 'tunnel.yaml'), 'utf8');
  const result = await onboard({ out, apply: true, resume: true, 'tunnel-id': 'example-second' }, deps);
  assert.equal(result.steps.tunnel_profile.status, 'failed'); assert.equal(await readFile(join(out, 'tunnel.yaml'), 'utf8'), before);
}));

test('missing prerequisite fails without configuration or fallback', async () => fixture(async ({ deps, options, calls }) => {
  const result = await onboard({ ...options, apply: true }, { ...deps, setupNativeConfig: async () => { throw new Error('Selected binary unavailable'); } });
  assert.equal(result.steps.environment.status, 'failed'); assert.deepEqual(calls, []);
}));

test('side effects, content options, malformed IDs and unknown fields are rejected before work', async () => {
  for (const options of [{ resume: true }, { prepare: true }, { thread: 'x' }, { search: 'x' }, { apply: true, arbitrary: true }, { 'tunnel-id': 'bad\nvalue' }, { out: '' }, { apply: true, resume: true, codex: '/x' }]) await assert.rejects(onboard(options));
});

test('Tunnel generator has no import side effects, escapes shell args and refuses overwrite', async () => fixture(async ({ temp }) => {
  const command = { command: process.execPath, args: [join(temp, "folder with spaces", 'reader.mjs')] };
  assert.match(renderTunnelConfig(command, 'example-id'), /config_version: 1/);
  assert.throws(() => renderTunnelConfig(command, 'x\npublic'), /Tunnel ID/);
  const path = join(temp, 'profile.yaml'); await writeTunnelConfig(command, 'example-id', path);
  await assert.rejects(writeTunnelConfig(command, 'example-other', path), /EEXIST/);
}));


test('incomplete or mismatched smoke evidence never passes metadata or content checks', async () => fixture(async ({ deps, options, out }) => {
  await onboard({ ...options, apply: true }, deps);
  for (const invalid of [{ passed: [] }, { passed: ['catalog and write denial', 'native metadata listing'], creates_threads: true, history_requested: false, search_requested: false }]) {
    const report = await onboard({ out, apply: true, resume: true }, { ...deps, smoke: async () => invalid });
    assert.equal(report.steps.local_metadata.status, 'failed');
  }
  const report = await onboard({ out, apply: true, resume: true, thread: 'example-thread' }, { ...deps, smoke: async (_config, opts) => ({ passed: ['catalog and write denial', 'native metadata listing'], creates_threads: false, history_requested: Boolean(opts.thread), search_requested: false }) });
  assert.equal(report.steps.local_metadata.status, 'passed');
  assert.equal(report.steps.local_content.status, 'failed');
}));

test('malformed smoke JSON diagnostics never contain child output', () => {
  assert.throws(() => parseSmokeReport('SENTINEL_PRIVATE_CHILD_OUTPUT'), error => {
    assert.doesNotMatch(error.message, /SENTINEL_PRIVATE_CHILD_OUTPUT/);
    assert.match(error.message, /Invalid smoke verification JSON/);
    return true;
  });
});

test('existing output is rejected before prepare can rebuild dependencies', async () => fixture(async ({ deps, options, out, calls }) => {
  await mkdir(out);
  const report = await onboard({ ...options, apply: true, prepare: true }, deps);
  assert.equal(report.steps.configuration.status, 'failed');
  assert.deepEqual(calls, []);
}));
