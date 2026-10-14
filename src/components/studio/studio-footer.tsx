import { RouteLink as Link } from '@/components/layout/locale-link';
import { ArrowUpRight, AudioLines } from 'lucide-react';
import { websiteConfig } from '@/config/website';

export function StudioFooter() {
  return (
    <footer className="bb-footer">
      <div className="bb-shell">
        <div className="bb-footer-main">
          <div>
            <Link className="bb-brand" href="/">
              <AudioLines size={22} />
              <span>
                burning bridges<span className="bb-brand-ai">ai</span>
              </span>
            </Link>
            <p>
              BurningBridgesAI.cc turns one photo into a personalized AI version
              of the Burning Bridges video trend.
            </p>
          </div>
          <div className="bb-footer-links">
            <a href={`mailto:${websiteConfig.legal.supportEmail}`}>
              {websiteConfig.legal.supportEmail} <ArrowUpRight size={13} />
            </a>
            <Link href="/pricing">
              Video packs <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
        <p className="bb-footer-disclaimer">
          BurningBridgesAI.cc is an independent AI video tool. It is not
          affiliated with, sponsored by, or endorsed by Drake, his label, or the
          rights holders of the original song or video.
        </p>
        <div className="bb-footer-bottom">
          <span>© {new Date().getFullYear()} Burning Bridges AI</span>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
