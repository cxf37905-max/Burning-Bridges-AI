import { StudioLanding } from '@/components/studio/studio-landing';
import { getStudioAvailability } from '@/studio/availability';
import { studioBrand, studioFaqs } from '@/studio/catalog';
import { studioMetadata } from '@/studio/metadata';

export function generateMetadata() {
  return studioMetadata();
}

export default function HomePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${studioBrand.url}/#website`,
        url: studioBrand.url,
        name: studioBrand.name,
        inLanguage: 'en',
      },
      {
        '@type': 'WebApplication',
        '@id': `${studioBrand.url}/#app`,
        name: studioBrand.name,
        url: `${studioBrand.url}/`,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        description:
          'A photo-to-video generator for creating personalized AI versions of the Burning Bridges video trend.',
      },
      {
        '@type': 'FAQPage',
        mainEntity: studioFaqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 结构化数据来自静态配置，并转义小于号，防止关闭 script 标签。
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\u003c'),
        }}
      />
      <StudioLanding availability={getStudioAvailability()} />
    </>
  );
}
