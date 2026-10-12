import { falVideoResult } from './fal-contract';
import type { KlingPipeline } from './kling-pipeline';
import { getKlingTemplate } from './kling-templates';

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!
  );
}

export function renderKlingTestPreview(pipeline: KlingPipeline) {
  const template = getKlingTemplate(pipeline.sceneId);
  const segmentVideos = pipeline.steps.filter(
    (step) => step.id.startsWith('segment-') && step.state === 'done'
  );
  const result = pipeline.videoUrl
    ? `<video id="result" src="${escapeHtml(pipeline.videoUrl.startsWith('https://local-test.invalid/') ? './finished.mp4' : pipeline.videoUrl)}" controls playsinline preload="metadata"></video><p><button id="seam">Replay the join (${template.segments[0].seconds}s)</button> <a href="${escapeHtml(pipeline.videoUrl.startsWith('https://local-test.invalid/') ? './finished.mp4' : pipeline.videoUrl)}" target="_blank" rel="noopener">Open MP4</a></p>`
    : '<p>The final video is not ready.</p>';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Burning Bridges AI · test preview</title><style>body{margin:0;background:#131516;color:#f4f0e7;font:16px system-ui}main{max-width:1000px;margin:auto;padding:40px 24px}h1{font-size:36px}p,figcaption{color:#babbb2;line-height:1.6}video{width:100%;max-height:650px;background:#000;border-radius:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}figure{margin:0}img{width:100%;max-height:500px;object-fit:contain;background:#000}a{color:#d5ecb2}button{padding:12px 18px;background:#d5ecb2;color:#131516;border:0;border-radius:8px;cursor:pointer}section{margin-top:36px}</style><main><h1>Burning Bridges AI</h1><p>Local generation review · ${escapeHtml(pipeline.sceneId)} · ${pipeline.tier} · 720p / 24fps. Generated video preview.</p><section><h2>Finished video</h2>${result}</section><section><h2>Generated parts</h2><div class="grid">${segmentVideos.map((step) => `<figure><video src="${escapeHtml(falVideoResult.parse(step.output).video.url)}" controls playsinline preload="metadata"></video><figcaption>${step.id}</figcaption></figure>`).join('')}</div></section></main><script>const video=document.getElementById('result');const button=document.getElementById('seam');if(video&&button){button.addEventListener('click',()=>{video.currentTime=${template.segments[0].seconds - 1};video.play().catch(()=>{});});}</script></html>`;
}
