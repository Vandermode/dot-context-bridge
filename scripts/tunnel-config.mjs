import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
export function renderTunnelConfig(command, tunnelId) {
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(tunnelId ?? '')) throw new Error('Supply an existing Tunnel ID');
  if (!command || typeof command.command !== 'string' || !isAbsolute(command.command) || !Array.isArray(command.args) || !command.args.every(v => typeof v === 'string')) throw new Error('Use command.json produced by setup');
  const quote = value => {
    if (/[\0\r\n]/.test(value)) throw new Error('Invalid command argument');
    if (process.platform === 'win32') {
      if (/["%&|<>^!]/.test(value)) throw new Error('Use Windows installation paths without shell metacharacters');
      return '"' + value + '"';
    }
    return "'" + value.replaceAll("'", "'\\''") + "'";
  };
  const line = [command.command, ...command.args].map(quote).join(' ');
  const yaml = `config_version: 1\ncontrol_plane:\n  base_url: "https://api.openai.com"\n  tunnel_id: ${JSON.stringify(tunnelId)}\n  api_key: "env:CONTROL_PLANE_API_KEY"\nhealth:\n  listen_addr: "127.0.0.1:0"\nadmin_ui:\n  open_browser: false\nlog:\n  level: info\n  format: json\nmcp:\n  commands:\n    - channel: main\n      command: ${JSON.stringify(line)}\n`;
  return yaml;
}
export async function writeTunnelConfig(command, tunnelId, out) {
  await writeFile(out, renderTunnelConfig(command, tunnelId), { flag: 'wx', mode: 0o600 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { command: { type: 'string' }, 'tunnel-id': { type: 'string' }, out: { type: 'string' } } });
  if (!values.command || !values.out) throw new Error('Supply --command, your existing --tunnel-id and a new --out file');
  const command = JSON.parse(await readFile(values.command, 'utf8'));
  await writeTunnelConfig(command, values['tunnel-id'], values.out);
  console.log('Wrote local Tunnel configuration. No tunnel, credential or network service was created.');
}
