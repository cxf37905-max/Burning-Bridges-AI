import { StudioFooter } from '@/components/studio/studio-footer';
import { StudioHeader } from '@/components/studio/studio-header';
import type { ReactNode } from 'react';
import '@/styles/studio.css';

// 模板保留页面默认不索引；已改写的产品页面自行声明允许索引。
export const metadata = { robots: { index: false, follow: true } };

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bb-site">
      <a className="bb-skip" href="#main-content">Skip to content</a>
      <StudioHeader />
      <main id="main-content">{children}</main>
      <StudioFooter />
    </div>
  );
}
