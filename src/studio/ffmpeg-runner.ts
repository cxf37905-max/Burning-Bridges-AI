import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

export async function assertFfmpegAvailable() {
  const executable = process.env.FFMPEG_PATH || ffmpeg;
  if (!executable) throw new Error('FFmpeg is unavailable on this server.');
  await access(
    executable,
    process.platform === 'win32' ? constants.F_OK : constants.X_OK
  );
}

export async function runFfmpeg(args: string[]) {
  await executeFfmpeg(args, 0);
}

export function readFfmpegOutput(args: string[], maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error(`Invalid FFmpeg output limit: ${maxBytes}`);
  return executeFfmpeg(args, maxBytes, 15_000);
}

async function executeFfmpeg(args: string[], maxBytes: number, timeout = 60_000) {
  const executable = process.env.FFMPEG_PATH || ffmpeg;
  if (!executable) throw new Error('FFmpeg is unavailable on this server.');
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      killSignal: 'SIGKILL',
    });
    let errorText = '';
    let received = 0;
    let overflow = false;
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      if (overflow) return;
      received += chunk.length;
      if (received > maxBytes) {
        overflow = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorText = (errorText + chunk.toString()).slice(-4096);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (overflow)
        reject(new Error(`FFmpeg output exceeds ${maxBytes} bytes.`));
      else if (code === 0) resolve(Buffer.concat(chunks, received));
      else reject(new Error(`FFmpeg failed (${code ?? signal}): ${errorText}`));
    });
  });
}
