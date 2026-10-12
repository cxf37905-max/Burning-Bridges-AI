import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { VideoMotionGuide } from './video-motion-guide';
import { VideoHowTo } from './video-how-to';
import { StudioGuideList } from './studio-guide-list';
import { VideoWorkspace } from './video-workspace';
import { VideoPricing } from './video-pricing';
import { studioFaqs } from '@/studio/catalog';

export function StudioLanding({
  availability,
}: {
  availability: {
    generationReady: boolean;
    purchasesReady: boolean;
    authReady: boolean;
  };
}) {
  return (
    <>
      <section className="bb-hero bb-shell">
        <div className="bb-hero-copy">
          <h1>
            Burning Bridges AI <span>Video Generator.</span>
          </h1>
          <p className="bb-hero-description">
            Upload one photo. Make your own Burning Bridges AI video with the
            original motion and music.
          </p>
        </div>
        <VideoWorkspace {...availability} />
      </section>
      <VideoMotionGuide />
      <VideoHowTo />
      <VideoPricing purchasesReady={availability.purchasesReady} />
      <StudioGuideList />
      <section className="bb-faq bb-shell" id="faq">
        <div className="bb-faq-heading">
          <span className="bb-section-kicker">BEFORE YOU GENERATE</span>
          <h2>Burning Bridges AI FAQ</h2>
          <p>
            Photos, pricing, the Drake trend,
            <br />
            and what to expect from your take.
          </p>
          <Link
            className="bb-text-link"
            href="/guides/burning-bridges-ai-photo-guide"
          >
            Get your photo ready <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="bb-faq-list">
          {studioFaqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <span>+</span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="bb-final-cta bb-shell">
        <div className="bb-cta-art" aria-hidden="true">
          ↗
        </div>
        <div>
          <span className="bb-section-kicker">
            YOU HAVE THE PHOTO. WE HAVE THE PARTY.
          </span>
          <h2>
            Your Burning Bridges AI
            <br />
            moment starts here.
          </h2>
          <a className="bb-button" href="#studio">
            Choose your photo <ArrowUpRight size={18} />
          </a>
          <p>Explore the studio now. Generation opens soon.</p>
        </div>
      </section>
    </>
  );
}
