import Link from 'next/link';
import { ArrowUpRight, AudioLines } from 'lucide-react';

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
            <p>Your photo. Your party. Your Burning Bridges AI moment.</p>
          </div>
          <div className="bb-footer-links">
            <Link href="/guides/how-to-make-burning-bridges-ai-video">
              How to make your video <ArrowUpRight size={13} />
            </Link>
            <Link href="/guides/burning-bridges-ai-meaning">
              The trend, explained <ArrowUpRight size={13} />
            </Link>
            <Link href="/pricing">
              Video packs <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
        <div className="bb-footer-bottom">
          <span>© {new Date().getFullYear()} Burning Bridges AI</span>
          <span>
            Independent studio. Not affiliated with Drake or his label.
          </span>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
