import { docsI18nConfig } from '@/lib/docs/i18n';
import { source } from '@/lib/source';
import { createI18nSearchAPI } from 'fumadocs-core/search/server';

/**
 * Fumadocs i18n search configuration
 *
 * 1. For internationalization, use createI18nSearchAPI:
 * https://fumadocs.dev/docs/headless/search/orama#internationalization
 *
 * 2. The site is configured as English-only, so the default English tokenizer is enough.
 */
const searchAPI = createI18nSearchAPI('advanced', {
  // Pass the i18n config for proper language detection
  i18n: docsI18nConfig,

  // Get all pages from all languages and map them to search indexes
  indexes: source.getLanguages().flatMap(({ language, pages }) =>
    pages.map((page) => ({
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
      id: page.url,
      url: page.url,
      locale: language,
    }))
  ),

  // Configure search tokenizers
  localeMap: {
    en: 'english',
  },

  // Global search configuration
  search: {
    limit: 20,
  },
});

/**
 * Fumadocs 15.2.8 fixed the bug that the `locale` is not passed to the search API
 *
 * ref:
 * https://x.com/indie_maker_fox/status/1913457083997192589
 *
 * NOTICE:
 * Fumadocs 15.1.2 has a bug that the `locale` is not passed to the search API
 * 1. Wrap the GET handler for debugging docs search
 * 2. Detect locale from referer header, and add the locale parameter to the search API
 * 3. Fumadocs core searchAPI get `locale` from searchParams, and pass it to the search API
 * https://github.com/fuma-nama/fumadocs/blob/dev/packages/core/src/search/orama/create-endpoint.ts#L19
 */
export const GET = async (request: Request) => {
  const response = await searchAPI.GET(request);
  return response;
};
