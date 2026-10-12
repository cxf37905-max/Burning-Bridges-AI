import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import { runFfmpeg } from '../../src/studio/ffmpeg-runner';
import { renderKlingVideoFiles } from '../../src/studio/video-composition';

const execute = promisify(execFile);
describe('真实本地 FFmpeg 合成', () => {
  it('两段按顺序组成20秒视频，并带有原音轨', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'bb-composition-test-')
    );
    try {
      const first = path.join(directory, 'first.mp4');
      const second = path.join(directory, 'second.mp4');
      const audio = path.join(directory, 'song.m4a');
      const output = path.join(directory, 'finished.mp4');
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=180x320:r=24:d=12',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        first,
      ]);
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=180x320:r=24:d=8',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        second,
      ]);
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=20',
        '-c:a',
        'aac',
        audio,
      ]);
      await renderKlingVideoFiles(first, second, audio, 'chandelier', output);
      expect((await stat(output)).size).toBeGreaterThan(10_000);
      const { stdout: colors } = await execute(
        ffmpeg!,
        [
          '-v',
          'error',
          '-i',
          output,
          '-vf',
          "select='eq(n,0)+eq(n,479)+eq(n,480)',scale=1:1",
          '-fps_mode',
          'passthrough',
          '-pix_fmt',
          'rgb24',
          '-f',
          'rawvideo',
          'pipe:1',
        ],
        { encoding: 'buffer', windowsHide: true }
      );
      // 24fps 下恰好480帧：首帧为第一段红色，末帧为第二段蓝色。
      expect(colors.length).toBe(6);
      expect(colors[0]).toBeGreaterThan(200);
      expect(colors[2]).toBeLessThan(30);
      expect(colors[3]).toBeLessThan(30);
      expect(colors[5]).toBeGreaterThan(200);
      const { stdout: sound } = await execute(
        ffmpeg!,
        [
          '-v',
          'error',
          '-i',
          output,
          '-map',
          '0:a:0',
          '-t',
          '0.1',
          '-f',
          's16le',
          'pipe:1',
        ],
        { encoding: 'buffer', windowsHide: true }
      );
      expect(sound.length).toBeGreaterThan(1000);
      expect(sound.some((byte) => byte !== 0)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
