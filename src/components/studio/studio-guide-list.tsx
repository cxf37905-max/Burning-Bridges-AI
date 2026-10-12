import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { studioGuides } from '@/studio/guides';

export function StudioGuideList() {
  return (
    <section
      className="bb-guides-section bb-shell"
      aria-labelledby="guides-title"
    >
      <header className="bb-content-heading">
        <h2 id="guides-title">Burning Bridges AI guides</h2>
        <p>
          Understand the trend, prepare your photo, and make your first video.
        </p>
      </header>
      <div className="bb-guides-grid">
        {studioGuides.map((guide) => (
          <article key={guide.slug}>
            <h3>
              <Link href={`/guides/${guide.slug}`}>{guide.title}</Link>
            </h3>
            <p>{guide.description}</p>
            <Link className="bb-text-link" href={`/guides/${guide.slug}`}>
              Read the guide <ArrowUpRight size={16} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
