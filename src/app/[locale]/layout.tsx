import { Analytics } from '@/analytics/analytics';
import {
  fontBricolageGrotesque,
  fontNotoSans,
  fontNotoSansMono,
  fontNotoSerif,
  fontSpaceGrotesk,
} from '@/assets/fonts';
import AffonsoScript from '@/components/affiliate/affonso';
import PromotekitScript from '@/components/affiliate/promotekit';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { RouteTransitions } from '@/components/layout/route-transitions';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { type Locale, NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Providers } from './providers';

import '@/styles/globals.css';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

/**
 * 1. Locale Layout
 * https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#layout
 *
 * 2. NextIntlClientProvider
 * https://next-intl.dev/docs/usage/configuration#nextintlclientprovider
 */
export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering for this layout
  // https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#static-rendering
  setRequestLocale(locale);

  return (
    <html suppressHydrationWarning lang={locale}>
      <head>
        <AffonsoScript />
        <PromotekitScript />
        <noscript>
          <style>{`
            #hero [style*="opacity:0;"], #hero [style*="opacity: 0;"],
            #hero [style$="opacity:0"], #hero [style$="opacity: 0"],
            .reveal-hidden {
              opacity: 1 !important;
              transform: none !important;
              filter: none !important;
            }
          `}</style>
        </noscript>
      </head>
      <body
        className={cn(
          'size-full antialiased',
          fontNotoSans.className,
          fontNotoSerif.variable,
          fontNotoSansMono.variable,
          fontBricolageGrotesque.variable,
          fontSpaceGrotesk.variable
        )}
      >
        <NuqsAdapter>
          <NextIntlClientProvider>
            <Providers>
              <NavigationProgress />
              <Suspense fallback={null}>
                <RouteTransitions />
              </Suspense>
              {children}

              <Toaster richColors position="top-right" offset={64} />
              <Analytics />
            </Providers>
          </NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
