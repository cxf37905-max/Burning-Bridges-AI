import type { MetadataRoute } from 'next';
import { studioBrand } from '@/studio/catalog';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', '/pricing'];
  return paths.map((path) => ({
    url: `${studioBrand.url}${path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
