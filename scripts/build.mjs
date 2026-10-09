import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot = resolve(root, process.env.RUST_CACHE_DIR || join(homedir(), 'rust-cache'));
const cacheDir = resolve(root, process.env.TURBO_CACHE_DIR || join(cacheRoot, 'turbo', 'eliteforge-agent-ui'));
await mkdir(cacheDir, { recursive: true });

// Turbo's Node launcher avoids Windows .cmd shims and shell quoting.
const child = spawn(process.execPath, [
  join(root, 'node_modules', 'turbo', 'bin', 'turbo'),
  'run', 'build', '--filter=./packages/*', ...process.argv.slice(2),
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TURBO_CACHE_DIR: cacheDir },
});
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
