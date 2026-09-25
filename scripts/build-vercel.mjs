import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL_ENV === 'production') {
  run(process.execPath, ['scripts/migrate.mjs']);
}

run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build']);
