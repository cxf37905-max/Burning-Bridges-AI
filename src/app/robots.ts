import type { MetadataRoute } from 'next';
import { studioBrand } from '@/studio/catalog';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/settings/',
        '/dashboard',
        '/library',
        '/sign-in',
        '/auth/',
        '/en/settings/',
        '/en/dashboard',
        '/en/library',
        '/en/sign-in',
        '/en/auth/',
      ],
    },
    sitemap: `${studioBrand.url}/sitemap/sitemap.xml`,
  };
}
