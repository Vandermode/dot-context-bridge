import { access, lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile, spawnSync } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { setup, setupNativeConfig, setupPlatformDefaults } from './setup.mjs';
import { readConfig } from '../bridge/config.mjs';
import { nativeEnvironment } from '../bridge/environment.mjs';
import { resolveNativeExecutable } from '../bridge/executable.mjs';
import { renderTunnelConfig, writeTunnelConfig } from './tunnel-config.mjs';

const runFile = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputOptions = Object.fromEntries([
  ...['id', 'label', 'codex', 'codex-home', 'out', 'tunnel-id', 'thread', 'search'].map(key => [key, { type: 'string' }]),
  ...['apply', 'prepare', 'resume', 'follow-updates', 'help'].map(key => [key, { type: 'boolean' }]),
]);
const steps = ['environment', 'build', 'configuration', 'native_schema', 'local_metadata', 'local_content',
  'tunnel_profile', 'private_tunnel', 'cloud_chat', 'cloud_dot', 'local_isolation', 'background_service'];

export const help = `Read-only server onboarding (run on the source computer as the history owner).
  node scripts/onboard.mjs                         Inspect only; no installation
  node scripts/onboard.mjs --apply --prepare       Build/test and configure a fresh reader
  node scripts/onboard.mjs --apply --resume        Revalidate an existing generated setup

Options: --out DIRECTORY --id DEVICE_ID --label LABEL --codex ABSOLUTE_EXECUTABLE
         --codex-home ABSOLUTE_HOME --follow-updates --tunnel-id EXISTING_TUNNEL_ID
         --thread EXISTING_THREAD_ID --search KNOWN_PHRASE

--prepare requires --apply and a source checkout; runs npm ci --ignore-scripts,
lint, typecheck and test. It does not install Node or Codex or log into accounts.
--thread/--search require --apply and explicitly opt into protected body reads.
--resume never overwrites configuration or silently changes the selected source.
A Tunnel profile is not a connection. Credentials, account permissions, Tunnel
startup, private plugin registration, Chat/Dot and local isolation need guided
acceptance in INSTALL.md. No public listener, service or control tools are created.
`;

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Options must be an object');
  for (const [key, value] of Object.entries(options)) {
    if (!inputOptions[key] || typeof value !== inputOptions[key].type) throw new Error('Unknown or invalid option: ' + key);
    if (typeof value === 'string' && (!value.trim() || /[\x00-\x1f\x7f]/.test(value))) throw new Error('Option must be nonblank and contain no control characters: ' + key);
  }
  for (const key of ['prepare', 'resume', 'thread', 'search']) {
    if (options[key] && !options.apply) throw new Error('--' + key + ' requires --apply');
  }
  if (options['tunnel-id'] && !/^[A-Za-z0-9_-]{3,200}$/.test(options['tunnel-id'])) throw new Error('Invalid existing Tunnel ID');
  if (options.resume && ['id', 'label', 'codex', 'codex-home', 'follow-updates'].some(key => options[key] !== undefined)) {
    throw new Error('--resume cannot change the source identity or executable; choose a new --out directory');
  }
}
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function verifyExisting(out, installationRoot = root) {
  // Never launch an arbitrary command loaded from a prior installation.
  const configPath = join(out, 'device.json');
  let config;
  try { config = await readConfig(configPath); }
  catch { throw new Error('Existing device configuration is unreadable or invalid; inspect it privately without deleting files'); }
  if (config.offline_setup || !config.native?.codex_home || (!config.native.executable && !config.native.executable_source)) {
    throw new Error('Existing configuration is not a complete native setup');
  }
  let command;
  try { command = JSON.parse(await readFile(join(out, 'command.json'), 'utf8')); }
  catch { throw new Error('Existing command configuration is unreadable or invalid; inspect it privately without deleting files'); }
  const expected = { command: process.execPath, args: [join(installationRoot, 'bridge/server.mjs'), configPath], cwd: installationRoot };
  if (!command || typeof command !== 'object' || command.command !== expected.command || command.cwd !== expected.cwd ||
      !Array.isArray(command.args) || JSON.stringify(command.args) !== JSON.stringify(expected.args) ||
      Object.keys(command).sort().join(',') !== 'args,command,cwd') {
    throw new Error('Existing command does not match this checkout and Node executable; inspect it and use a new --out directory');
  }
  return { config: configPath, command, directory: out, native: config.native };
}
function prepareBuild() {
  for (const args of [['ci', '--ignore-scripts'], ['run', 'lint'], ['run', 'typecheck'], ['test']]) {
    // Only fixed literals enter the Windows shell; no user input is interpolated.
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('Preparation failed at npm ' + args.join(' ') + '; run that command locally to inspect its output');
  }
}
async function smoke(config, options) {
  const args = [join(root, 'scripts/smoke.mjs'), '--config', config];
  if (options.thread) args.push('--thread', options.thread);
  if (options.search) args.push('--search', options.search);
  let result;
  try {
    result = await runFile(process.execPath, args, { cwd: root, shell: false, windowsHide: true,
      env: nativeEnvironment(), timeout: 180000, maxBuffer: 64 * 1024 });
  } catch { throw new Error('Local smoke failed; inspect the matching smoke command locally. No transcript or child stderr is included in this report'); }
  return parseSmokeReport(result.stdout, options);
}
export function verifySmokeReport(output, options = {}) {
  const required = ['catalog and write denial', 'native metadata listing'];
  if (options.thread) required.push('protected turn page');
  if (options.search) required.push('protected native search');
  if (!output || !Array.isArray(output.passed) || output.creates_threads !== false ||
      output.history_requested !== Boolean(options.thread) || output.search_requested !== Boolean(options.search) ||
      !output.passed.every(value => typeof value === 'string') || !required.every(value => output.passed.includes(value))) {
    throw new Error('Unexpected or incomplete smoke verification report; no success was recorded');
  }
  return output;
}
export function parseSmokeReport(text, options = {}) {
  let output;
  try { output = JSON.parse(text); }
  catch { throw new Error('Invalid smoke verification JSON; child output is not included'); }
  return verifySmokeReport(output, options);
}

export async function onboard(options = {}, dependencies = {}) {
  validateOptions(options);
  const report = { mode: options.apply ? 'apply' : 'inspect', read_only: true, end_to_end_verified: false,
    steps: Object.fromEntries(steps.map(key => [key, { status: 'not_run' }])), next: [] };
  const mark = (key, status, note) => { report.steps[key] = { status, note }; };
  let current = 'environment';
  try {
    const defaults = setupPlatformDefaults();
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required');
    const out = resolve(options.out || join(root, '.local'));
    let selected, existing;
    if (options.resume) {
      existing = await verifyExisting(out);
      await access(existing.native.codex_home);
      selected = await (dependencies.resolveExecutable || resolveNativeExecutable)(existing.native, nativeEnvironment(existing.native));
    } else {
      const home = resolve(options['codex-home'] || process.env.CODEX_HOME || join(homedir(), '.codex'));
      await access(home);
      selected = (await (dependencies.setupNativeConfig || setupNativeConfig)(options, home)).codex;
    }
    mark('environment', 'passed', `${process.platform}/${process.arch}; Node ${process.versions.node}; ${selected.version}. Source account/history ownership still needs a known-thread check.`);
    report.device = existing ? { configuration: out } : { id: options.id || defaults.id, label: options.label || defaults.label, configuration: out };
    if (options.apply && !options.resume && await exists(out)) {
      current = 'configuration';
      throw new Error('Output directory already exists; inspect it and use --resume or a fresh --out directory');
    }
    current = 'build';
    if (options.prepare) {
      if (!(await exists(join(root, 'src'))) || !(await exists(join(root, 'package-lock.json')))) throw new Error('--prepare needs the source checkout; runtime archives already include built files');
      await (dependencies.prepare || prepareBuild)();
    }
    if (!(await exists(join(root, 'dist/src/tools.js')))) {
      if (options.apply) throw new Error('Built runtime missing; run --apply --prepare from a source checkout');
      mark('build', 'pending', 'Built runtime missing. Use --apply --prepare in the source checkout.');
    } else mark('build', 'passed', options.prepare ? 'Dependencies installed; lint, typecheck and synthetic tests passed.' : 'Built runtime found; this check does not prove it matches changed source. Use --prepare after source edits.');
    current = 'configuration';
    if (!options.apply) {
      mark('configuration', 'pending', await exists(out) ? 'Existing directory found. Inspect it, then use --apply --resume; never delete or overwrite blindly.' : 'Ready for a fresh configuration with --apply.');
      if (options['tunnel-id']) mark('tunnel_profile', 'pending', 'Existing Tunnel ID supplied. Profile generation requires --apply.');
      report.next.push('Run --apply --prepare in a source checkout, or --apply for a built runtime. Existing complete setups use --apply --resume.');
      return report;
    }
    const installed = existing || await (dependencies.setup || setup)(options);
    mark('configuration', 'passed', existing ? 'Existing device and fixed reader command validated without changes.' : 'Fresh private device/stdio configuration created; no service or connection started.');
    current = 'native_schema';
    const check = dependencies.checkSchema || (async () => {
      const { checkNativeSchema, selectSchemaCodex } = await import('./check-native-schema.mjs');
      return checkNativeSchema(await selectSchemaCodex({ config: installed.config }));
    });
    await check(installed.config);
    mark('native_schema', 'passed', 'Required native read methods and fields verified against the selected executable.');
    current = 'local_metadata';
    verifySmokeReport(await (dependencies.smoke || smoke)(installed.config, {}));
    mark('local_metadata', 'passed', 'MCP catalog, mutation denial and native metadata listing passed. Empty results do not prove source ownership.');
    if (options.thread || options.search) {
      current = 'local_content';
      const result = verifySmokeReport(await (dependencies.smoke || smoke)(installed.config, options), options);
      const passed = new Set(result.passed);
      mark('local_content', 'passed', 'Only the explicitly requested protected checks passed; no full-history audit or source relocation is implied.');
      report.content_checks = {
        history: options.thread ? 'passed' : 'not_run', search: options.search ? 'passed' : 'not_run',
        turn_continuation: passed.has('native turn continuation') ? 'passed' : 'not_exercised',
        item_page: passed.has('protected item page') ? 'passed' : 'not_exercised',
        item_continuation: passed.has('native item continuation') ? 'passed' : 'not_exercised',
        search_continuation: passed.has('native search continuation') ? 'passed' : 'not_exercised',
      };
    } else mark('local_content', 'not_run', 'Pass --thread and/or --search only for owner-authorized protected content checks.');
    current = 'tunnel_profile';
    if (options['tunnel-id']) {
      const path = join(out, 'tunnel.yaml');
      const expected = renderTunnelConfig(installed.command, options['tunnel-id']);
      if (await exists(path)) {
        if (!options.resume || await readFile(path, 'utf8') !== expected) throw new Error('Tunnel profile already exists and does not qualify for unchanged resume; inspect it without overwriting');
        mark('tunnel_profile', 'passed', 'Matching existing profile verified. No credential or account ownership check was performed.');
      } else {
        await writeTunnelConfig(installed.command, options['tunnel-id'], path);
        mark('tunnel_profile', 'passed', 'Private Tunnel profile generated with an environment-variable key reference. This is not a live connection.');
      }
    } else mark('tunnel_profile', 'pending', 'Supply the owner-approved existing Tunnel ID with --apply --resume --tunnel-id. No Tunnel/account access was created.');
    report.next.push('Follow INSTALL.md section 3 for the official Tunnel client, owner-controlled runtime key and private workspace connection. No service has been started.',
      'Verify known-thread search and turn/item pagination separately in ordinary Chat and Dot, then local Codex isolation in a genuinely new chat.',
      'A persistent background service is optional and requires a separate deployment decision.');
  } catch (error) {
    mark(current, 'failed', error instanceof Error ? error.message : 'Onboarding failed');
    report.next.push('Fix the failed stage without deleting existing files. If setup completed, rerun with --apply --resume and the same --out; interrupted partial setup needs inspection and a new --out.');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: inputOptions });
    if (values.help) console.log(help);
    else {
      const report = await onboard(values);
      console.log(JSON.stringify(report, null, 2));
      if (Object.values(report.steps).some(step => step.status === 'failed')) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid onboarding options');
    process.exitCode = 1;
  }
}
