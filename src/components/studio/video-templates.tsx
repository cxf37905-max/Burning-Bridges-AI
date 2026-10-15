import { RouteLink as Link } from '@/components/layout/locale-link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { partyScenes } from '@/studio/catalog';

const templateCopy = {
  chandelier: {
    title: 'Chandelier banquet',
    description:
      'A chandelier-lit banquet setting with the recognizable party atmosphere of the Burning Bridges trend.',
  },
  'after-hours': {
    title: 'Hotel suite after-party',
    description:
      'A later-night hotel-suite variation with a darker, more intimate party feel.',
  },
} as const;

export function VideoTemplates() {
  return (
    <section
      className="bb-templates-section bb-shell"
      aria-labelledby="templates-title"
    >
      <header className="bb-content-heading">
        <span className="bb-section-kicker">CHOOSE A SCENE</span>
        <h2 id="templates-title">Burning Bridges AI Video Templates</h2>
        <p>
          Choose the setting that fits the version you want to make. Both
          templates use your uploaded photo as the subject reference.
        </p>
      </header>
      <div className="bb-template-showcase">
        {partyScenes.map((scene) => (
          <article key={scene.id}>
            <div className="bb-template-still">
              <Image
                src={scene.poster}
                alt={`${templateCopy[scene.id].title} Burning Bridges AI video template`}
                fill
                sizes="(max-width: 700px) 90vw, 600px"
                style={{ objectPosition: scene.posterPosition }}
              />
            </div>
            <h3>{templateCopy[scene.id].title}</h3>
            <p>{templateCopy[scene.id].description}</p>
          </article>
        ))}
      </div>
      <div className="bb-section-action">
        <Link className="bb-button" href="#create" prefetch={false}>
          Try a template <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
