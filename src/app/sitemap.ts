import type { MetadataRoute } from 'next';
import { studioBrand } from '@/studio/catalog';
import { studioGuides } from '@/studio/guides';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/pricing', '/privacy', '/terms', ...studioGuides.map((guide) => `/guides/${guide.slug}`)].map((path) => ({ url: `${studioBrand.url}${path}`, changeFrequency: path.includes('guides') ? 'monthly' : 'weekly', priority: path === '/' ? 1 : .7 }));
}
