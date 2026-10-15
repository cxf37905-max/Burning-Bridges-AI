import { RouteLink as Link } from '@/components/layout/locale-link';
import { ArrowUpRight, Clapperboard, Download, ImagePlus } from 'lucide-react';

const steps = [
  {
    icon: ImagePlus,
    title: '1. Upload one photo',
    description:
      'Choose a clear photo of one person or pet. A visible face, good lighting and a head-to-waist or full-body composition give the model a stronger reference.',
  },
  {
    icon: Clapperboard,
    title: '2. Choose your template',
    description:
      'Pick Chandelier banquet for the classic party setting or Hotel suite after-party for a different late-night version of the scene.',
  },
  {
    icon: Download,
    title: '3. Generate and download',
    description:
      'Start the generation and let the AI create the video. When it is ready, preview the result and download your finished clip.',
  },
];

export function VideoHowTo() {
  return (
    <section className="bb-how-section" id="how-it-works">
      <div className="bb-shell">
        <header className="bb-content-heading">
          <span className="bb-section-kicker">HOW IT WORKS</span>
          <h2>How to Make a Burning Bridges AI Video</h2>
          <p>
            You do not need to film the routine, edit a video, or write an AI
            prompt. Start with one clear photo and choose the version of the
            Burning Bridges scene you want to make.
          </p>
        </header>
        <div className="bb-steps">
          {steps.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <Icon size={24} strokeWidth={1.5} />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="bb-section-action">
          <Link className="bb-button" href="#create" prefetch={false}>
            Create my Burning Bridges video <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
