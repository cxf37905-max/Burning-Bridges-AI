import { websiteConfig } from '@/config/website';
import { getMessagesForLocale } from '@/i18n/messages';
import { routing } from '@/i18n/routing';
import type { Locale, Messages } from 'next-intl';
import type { ReactElement } from 'react';
import { ResendProvider } from './provider/resend';
import {
  type EmailTemplate,
  EmailTemplates,
  type MailProvider,
  type MailProviderName,
  type SendEmailResult,
  type SendRawEmailParams,
  type SendTemplateParams,
} from './types';

type MailProviderFactory = () => MailProvider;

const providerRegistry: Partial<Record<MailProviderName, MailProviderFactory>> =
  {
    resend: () => new ResendProvider(),
  };

const renderEmailHtml = async (email: ReactElement): Promise<string> => {
  // Avoid @react-email/render to prevent prettier imports in workerd.
  const reactDomServer = (await import('react-dom/server')) as {
    renderToReadableStream?: (element: ReactElement) => Promise<ReadableStream>;
    renderToStaticMarkup?: (element: ReactElement) => string;
    renderToString?: (element: ReactElement) => string;
  };

  if (reactDomServer.renderToReadableStream) {
    const stream = await reactDomServer.renderToReadableStream(email);
    return await new Response(stream).text();
  }

  if (reactDomServer.renderToStaticMarkup) {
    return reactDomServer.renderToStaticMarkup(email);
  }

  if (reactDomServer.renderToString) {
    return reactDomServer.renderToString(email);
  }

  return '';
};

/** Common named HTML entities → their decoded characters */
const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&copy;': '\u00A9',
  '&reg;': '\u00AE',
  '&trade;': '\u2122',
  '&ndash;': '\u2013',
  '&mdash;': '\u2014',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
  '&bull;': '\u2022',
  '&hellip;': '\u2026',
};

const decodeHtmlEntities = (text: string): string =>
  text
    // Hex numeric entities: &#xHHHH;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    // Decimal numeric entities: &#DDDD;
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    // Named entities: &name;
    .replace(/&[a-zA-Z]+;/g, (entity) => NAMED_ENTITIES[entity] ?? entity);

const toPlainText = (html: string): string => {
  // Simple HTML-to-text fallback for email providers.
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return decodeHtmlEntities(stripped);
};

/**
 * Global mail provider instance
 */
let mailProvider: MailProvider | null = null;

/**
 * Get the mail provider
 * @returns current mail provider instance
 * @throws Error if provider is not initialized
 */
export const getMailProvider = (): MailProvider => {
  if (!mailProvider) mailProvider = createMailProvider();
  return mailProvider;
};

function createMailProvider(): MailProvider {
  const name = websiteConfig.mail.provider;
  if (!name) throw new Error('mail.provider is required in websiteConfig.');
  const factory = providerRegistry[name];
  if (!factory) throw new Error(`Unsupported mail provider: ${name}.`);
  return factory();
}

/**
 * Send email using the configured mail provider.
 *
 * Returns a `SendEmailResult` so callers can distinguish "feature disabled"
 * from "send failed" and access error details when needed.
 *
 * @param params Email parameters
 * @returns Send result with success status, optional messageId, and error
 */
export async function sendEmail(
  params: SendTemplateParams | SendRawEmailParams
): Promise<SendEmailResult> {
  if (!websiteConfig.mail?.enable) {
    return { success: false, error: 'Mail feature is disabled' };
  }

  try {
    const provider = getMailProvider();

    const result =
      'template' in params
        ? await provider.sendTemplate(params)
        : await provider.sendRawEmail(params);

    if (!result.success) {
      console.error('[mail] Send failed:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[mail] Unexpected error:', error);
    return { success: false, error };
  }
}

/**
 * Get rendered email for given template, context, and locale
 */
export async function getTemplate<T extends EmailTemplate>({
  template,
  context,
  locale = routing.defaultLocale,
}: {
  template: T;
  context: Record<string, any>;
  locale?: Locale;
}) {
  const mainTemplate = EmailTemplates[template];
  const messages = await getMessagesForLocale(locale);

  const email = mainTemplate({
    ...(context as any),
    locale,
    messages,
  });

  // Get the subject from the messages
  const subject =
    'subject' in messages.Mail[template as keyof Messages['Mail']]
      ? messages.Mail[template].subject
      : '';

  const html = await renderEmailHtml(email);
  const text = toPlainText(html);

  return { html, text, subject };
}
