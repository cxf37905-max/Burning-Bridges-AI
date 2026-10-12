import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { studioGuides } from '@/studio/guides';
import { studioBrand } from '@/studio/catalog';
import { studioMetadata } from '@/studio/metadata';

export function generateStaticParams() {
  return studioGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = studioGuides.find((item) => item.slug === slug);
  if (!guide) notFound();
  return studioMetadata({ title: guide.title, description: guide.description, path: `/guides/${slug}` });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = studioGuides.find((item) => item.slug === slug);
  if (!guide) notFound();
  const schema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: studioBrand.name, item: studioBrand.url }, { '@type': 'ListItem', position: 2, name: guide.title, item: `${studioBrand.url}/guides/${slug}` }] };
  return <article className="bb-article"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} /><Link href="/" className="bb-text-link"><ArrowLeft size={14} />Back to Burning Bridges AI</Link><h1>{guide.title}</h1><div className="bb-article-meta">Burning Bridges AI Studio · Updated October 11, 2026</div><p>{guide.intro}</p>{guide.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}<Link href="/#studio" className="bb-button">Choose your Burning Bridges AI photo <ArrowUpRight size={17} /></Link><h2>Keep exploring</h2><ul>{studioGuides.filter((item) => item.slug !== slug).map((item) => <li key={item.slug}><Link className="bb-inline-link" href={`/guides/${item.slug}`}>{item.title}</Link></li>)}<li><Link className="bb-inline-link" href="/pricing">Burning Bridges AI pricing</Link></li></ul></article>;
}
