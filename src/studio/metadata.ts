import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { constructMetadata } from '@/lib/metadata';
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
  return {
    ...constructMetadata({
      title,
      description,
      locale: routing.defaultLocale,
      pathname: path,
      noIndex,
    }),
    robots: { index: !noIndex, follow: true },
    icons: { icon: '/studio/icon.svg', apple: '/studio/apple-touch-icon.png' },
  };
}
