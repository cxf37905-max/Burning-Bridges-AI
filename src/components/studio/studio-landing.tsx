import { RouteLink as Link } from '@/components/layout/locale-link';
import { ArrowUpRight } from 'lucide-react';
import { VideoMotionGuide } from './video-motion-guide';
import { VideoHowTo } from './video-how-to';
import {
  StudioSongGuide,
  StudioTrendGuide,
  StudioVideoComparison,
} from './studio-trend-guide';
import { VideoTemplates } from './video-templates';
import { VideoPhotoGuide } from './video-photo-guide';
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
      <section className="bb-hero bb-shell" id="create">
        <div className="bb-hero-copy">
          <h1>
            Burning Bridges AI <span>Video Generator</span>
          </h1>
          <p className="bb-hero-description">
            Upload one photo and turn it into a 15-second Burning Bridges AI
            video inspired by the viral Drake trend. No filming, editing, or
            prompts.
          </p>
        </div>
        <VideoWorkspace {...availability} />
      </section>
      <VideoMotionGuide />
      <VideoHowTo />
      <StudioTrendGuide />
      <StudioVideoComparison />
      <VideoTemplates />
      <VideoPhotoGuide />
      <StudioSongGuide />
      <VideoPricing purchasesReady={availability.purchasesReady} />
      <section className="bb-faq bb-shell" id="faq">
        <div className="bb-faq-heading">
          <span className="bb-section-kicker">FAQ</span>
          <h2>Burning Bridges AI FAQ</h2>
        </div>
        <div className="bb-faq-list">
          {studioFaqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="bb-final-cta bb-shell">
        <div>
          <h2>Make Your Burning Bridges AI Video</h2>
          <p className="bb-final-copy">
            Choose a photo, pick a scene, and generate your own take on the
            Burning Bridges trend.
          </p>
          <p className="bb-final-specs">
            One photo · 15-second video · HD 720p
          </p>
          <Link className="bb-button" href="#create" prefetch={false}>
            Make my video <ArrowUpRight size={18} />
          </Link>
          <p>No filming. No editing. No prompt required.</p>
        </div>
      </section>
    </>
  );
}
