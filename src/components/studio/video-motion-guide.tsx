import { RouteLink as Link } from '@/components/layout/locale-link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';

const moments = [
  {
    image: 'walk-up',
    title: 'Step into the scene',
    description:
      'Your subject enters the party as the main character while the camera moves in and establishes the setting.',
  },
  {
    image: 'grin',
    title: 'Own the close-up',
    description:
      'The camera gets closer as the performance becomes more expressive, keeping your uploaded subject at the center of the shot.',
  },
  {
    image: 'hype',
    title: 'Work the room',
    description:
      'The energy opens up with bigger gestures, movement and reactions around the lead character.',
  },
];

export function VideoMotionGuide() {
  return (
    <section
      className="bb-motion-section bb-shell"
      id="the-video"
      aria-labelledby="motion-title"
    >
      <header className="bb-content-heading">
        <span className="bb-section-kicker">THE VIDEO</span>
        <h2 id="motion-title">What Happens in a Burning Bridges AI Video?</h2>
        <p>
          Your photo becomes the lead in a fast, party-style AI video built
          around the recognizable Burning Bridges trend. The camera moves in
          close, the room reacts around your subject, and the clip builds toward
          the search-the-room moment people recognize from the trend.
        </p>
      </header>
      <div className="bb-motion-grid">
        {moments.map((moment, index) => (
          <article key={moment.image}>
            <div className="bb-motion-frame">
              <Image
                src={`/studio/beats/${moment.image}.jpg`}
                alt={`Burning Bridges AI reference: ${moment.title}`}
                fill
                sizes="(max-width: 700px) 44vw, 260px"
              />
            </div>
            <span className="bb-motion-time">0{index + 1}</span>
            <h3>{moment.title}</h3>
            <p>{moment.description}</p>
          </article>
        ))}
      </div>
      <div className="bb-section-action">
        <p>
          One photo goes in. A complete Burning Bridges-style AI video comes
          out.
        </p>
        <Link className="bb-button" href="#create">
          Make my video <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
