import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { VideoJobStatus } from '../../src/components/studio/video-job-status';

function renderStatus(
  status: string,
  refunded: boolean,
  message: string | null = null
) {
  const id = 'a'.repeat(32);
  return renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          fallback: {
            [`/api/studio/videos/${id}`]: {
              id,
              status,
              refunded,
              message,
              videoUrl: null,
            },
          },
        },
      },
      createElement(VideoJobStatus, { id })
    )
  );
}

describe('失败告知与退款事实一致', () => {
  it('服务端确认退款后，结果区域告知失败及次数已回到账户', () => {
    const html = renderStatus('failed', true);
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      'Your 100 credits have been returned to your balance.'
    );
  });
  it('没有完成退款时，不能默认告知次数已返还', () => {
    expect(renderStatus('failed', false)).not.toContain('returned');
    expect(renderStatus('processing', false)).not.toContain('returned');
  });
});
