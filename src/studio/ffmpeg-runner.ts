import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

export async function runFfmpeg(args: string[]) {
  const executable = process.env.FFMPEG_PATH || ffmpeg;
  if (!executable) throw new Error('FFmpeg is unavailable on this server.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60_000,
      killSignal: 'SIGKILL',
    });
    let errorText = '';
    child.stderr.on('data', (chunk: Buffer) => {
      errorText = (errorText + chunk.toString()).slice(-4096);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (${code ?? signal}): ${errorText}`));
    });
  });
}
