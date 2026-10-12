import type { Metadata } from 'next';
import { studioBrand } from './catalog';

export function studioMetadata({
  title = studioBrand.title,
  description = studioBrand.description,
  path = '/',
  noIndex = false,
}: {
  title?: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
} = {}): Metadata {
  const url = `${studioBrand.url}${path}`;
  return {
    title,
    description,
    metadataBase: new URL(studioBrand.url),
    alternates: { canonical: url },
    robots: { index: !noIndex, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: studioBrand.name,
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: '/studio/og.jpg',
          width: 1200,
          height: 630,
          alt: 'Burning Bridges AI — your photo, your party',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/studio/og.jpg'],
    },
    icons: { icon: '/studio/icon.svg', apple: '/studio/apple-touch-icon.png' },
  };
}
