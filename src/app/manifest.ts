import type { MetadataRoute } from 'next';
import { studioBrand } from '@/studio/catalog';
export default function manifest(): MetadataRoute.Manifest {
  return { name: studioBrand.name, short_name: studioBrand.name, description: studioBrand.description, start_url: '/', display: 'standalone', background_color: '#161b16', theme_color: '#161b16', icons: [{ src: '/studio/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
