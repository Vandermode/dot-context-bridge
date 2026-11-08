import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, stat, rm, symlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { setup, setupPlatformDefaults } from '../scripts/setup.mjs';
import { client } from '../scripts/mcp-client.mjs';
import { READ_METHODS } from '../bridge/readonly-policy.mjs';

test('setup defaults are OS-specific and unknown systems remain unsupported', () => {
  assert.deepEqual(setupPlatformDefaults('linux'), { id: 'linux', label: 'My Linux PC' });
  assert.deepEqual(setupPlatformDefaults('darwin'), { id: 'mac', label: 'My Mac' });
  assert.deepEqual(setupPlatformDefaults('win32'), { id: 'windows', label: 'My Windows PC' });
  assert.throws(() => setupPlatformDefaults('freebsd'), /Unsupported platform freebsd/);
});

const linuxOnly = { skip: process.platform !== 'linux', timeout: 20000 };

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'context-linux-'));
  try {
    const home = join(dir, 'synthetic codex home');
    const executable = join(dir, 'synthetic codex');
    await mkdir(home);
    await writeFile(executable, `#!${process.execPath}
import { createInterface } from 'node:readline';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv.includes('--version')) { console.log('codex-cli 0.164.0'); process.exit(0); }
const home = process.env.CODEX_HOME;
writeFileSync(join(home, 'state.txt'), JSON.stringify({ pid: process.pid, home, args: process.argv.slice(2),
  secretInherited: ['CONTROL_PLANE_API_KEY','OPENAI_API_KEY','SSH_AUTH_SOCK','NODE_OPTIONS'].some(key => key in process.env) }));
const page = data => ({ data, nextCursor: null, backwardsCursor: null });
createInterface({ input: process.stdin }).on('line', line => {
  const r = JSON.parse(line); appendFileSync(join(home, 'wire.txt'), JSON.stringify(r) + '\\n');
  if (r.id === undefined) return;
  let result = {};
  if (r.method === 'thread/list' || r.method === 'thread/search') result = page([]);
  if (r.method === 'thread/read') result = { thread: { id: r.params.threadId, historyMode: 'paginated' } };
  if (r.method === 'thread/turns/list') result = page([{ id: 'synthetic-turn', items: [] }]);
  if (r.method === 'thread/items/list') result = page([{ turnId: r.params.turnId, item: { id: 'synthetic-item', type: 'agentMessage', text: 'synthetic Linux text' } }]);
  if (r.method === 'thread/searchOccurrences') result = { data: [], nextCursor: null };
  process.stdout.write(JSON.stringify({ id: r.id, result }) + '\\n');
});
`);
    // An extensionless executable must use ESM even on Node versions without syntax detection.
    await writeFile(join(dir, 'package.json'), '{"type":"module"}\n');
    await chmod(executable, 0o700);
    await run({ dir, home, executable });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('Linux setup and generated MCP command exercise only synthetic native reads end to end', linuxOnly, async () => {
  await fixture(async ({ dir, home, executable }) => {
    const out = join(dir, 'private output');
    const result = await setup({ out, codex: executable, 'codex-home': home });
    const config = JSON.parse(await readFile(result.config, 'utf8'));
    assert.deepEqual(config, { id: 'linux', label: 'My Linux PC', native: { codex_home: home, executable } });
    assert.equal((await stat(out)).mode & 0o777, 0o700);
    for (const name of ['device.json', 'mcp.json', 'command.json']) assert.equal((await stat(join(out, name))).mode & 0o777, 0o600);
    const command = JSON.parse(await readFile(join(out, 'command.json'), 'utf8'));
    assert.equal(command.command, process.execPath);
    assert.deepEqual(command.args, [resolve('bridge/server.mjs'), result.config]);
    assert.deepEqual(JSON.parse(await readFile(join(out, 'mcp.json'), 'utf8')).mcpServers['codex-linux'], { type: 'stdio', ...command });
    const before = await readFile(result.config, 'utf8');
    await assert.rejects(setup({ out, codex: executable, 'codex-home': home }), { code: 'EEXIST' });
    assert.equal(await readFile(result.config, 'utf8'), before);
    const connection = client(command.command, command.args, { cwd: command.cwd,
      env: { ...process.env, CONTROL_PLANE_API_KEY: 'synthetic', OPENAI_API_KEY: 'synthetic', SSH_AUTH_SOCK: '/synthetic/socket' } });
    let state;
    try {
      assert.ok((await connection.rpc('initialize', { protocolVersion: '2025-11-25' })).result);
      const denied = await connection.rpc('tools/call', { name: 'codex_turn', arguments: {} });
      assert.equal(denied.result.isError, true);
      await assert.rejects(readFile(join(home, 'state.txt')), { code: 'ENOENT' });
      for (const [name, args] of [
        ['codex_threads', { cwd: home, limit: 1 }],
        ['codex_threads', { thread_id: 'synthetic-thread' }],
        ['codex_history', { kind: 'turns', thread_id: 'synthetic-thread' }],
        ['codex_history', { kind: 'items', thread_id: 'synthetic-thread', turn_id: 'synthetic-turn' }],
        ['codex_search', { kind: 'threads', search_term: 'synthetic' }],
        ['codex_search', { kind: 'occurrences', thread_id: 'synthetic-thread', search_term: 'synthetic' }],
      ]) {
        const response = await connection.rpc('tools/call', { name, arguments: args });
        assert.notEqual(response.result.isError, true);
        assert.equal(response.result.structuredContent.device_id, 'linux');
      }
      state = JSON.parse(await readFile(join(home, 'state.txt'), 'utf8'));
      assert.equal(state.home, home);
      assert.equal(state.secretInherited, false);
      assert.deepEqual(state.args, ['-c', 'sandbox_mode="read-only"', '-c', 'analytics.enabled=false', 'app-server', '--listen', 'stdio://']);
      const requests = (await readFile(join(home, 'wire.txt'), 'utf8')).trim().split('\n').map(JSON.parse);
      assert.deepEqual([...new Set(requests.map(r => r.method))].sort(), ['initialize', 'initialized', ...READ_METHODS].sort());
      assert.equal(requests.find(r => r.method === 'thread/list').params.cwd, home);
    } finally { await connection.close(); }
    assert.equal(connection.child.exitCode, 0);
    assert.throws(() => process.kill(state.pid, 0), { code: 'ESRCH' });
  });
});

test('Linux setup honors CODEX_HOME, HOME fallback and stable PATH without reading a real account', linuxOnly, async () => {
  await fixture(async ({ dir, home, executable }) => {
    const bin = join(dir, 'bin'), userHome = join(dir, 'synthetic user');
    await mkdir(bin); await mkdir(join(userHome, '.codex'), { recursive: true });
    await symlink(executable, join(bin, 'codex'));
    const env = { PATH: bin + ':' + dirname(process.execPath), HOME: userHome };
    for (const [suffix, source, expectedHome] of [
      ['environment', { ...env, CODEX_HOME: home }, home],
      ['fallback', env, join(userHome, '.codex')],
    ]) {
      const out = join(dir, suffix);
      const child = spawnSync(process.execPath, [resolve('scripts/setup.mjs'), '--out', out, '--id', 'linux-test', '--label', 'Linux test'], { env: source, encoding: 'utf8', timeout: 10000 });
      assert.equal(child.status, 0, child.stderr);
      const config = JSON.parse(await readFile(join(out, 'device.json'), 'utf8'));
      assert.deepEqual(config, { id: 'linux-test', label: 'Linux test', native: { codex_home: expectedHome, executable_source: { kind: 'path', path: join(bin, 'codex') } } });
    }
    await chmod(executable, 0o600);
    const out = join(dir, 'must-not-exist');
    await assert.rejects(setup({ out, codex: executable, 'codex-home': home }), { code: 'EACCES' });
    await assert.rejects(stat(out), { code: 'ENOENT' });
  });
});
