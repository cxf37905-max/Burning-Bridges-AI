'use client';

import Container from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import BuiltWithButton from '@/components/shared/built-with-button';
import { useFooterLinks } from '@/config/footer-config';
import { useSocialLinks } from '@/config/social-config';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { useTranslations } from 'next-intl';
import type React from 'react';

export function Footer({ className }: React.HTMLAttributes<HTMLElement>) {
  const t = useTranslations();
  const footerLinks = useFooterLinks();
  const socialLinks = useSocialLinks();
  const localePathname = useLocalePathname();

  return (
    <footer className={cn('border-t', className)}>
      <Container className="px-4">
        <div className="grid grid-cols-2 gap-8 py-16 md:grid-cols-5">
          <div className="flex flex-col items-start col-span-full md:col-span-2">
            <div className="space-y-4">
              {/* logo and name */}
              <div className="items-center space-x-2 flex">
                <Logo />
                <span className="text-xl font-semibold">
                  {t('Metadata.name')}
                </span>
              </div>

              {/* tagline */}
              <p className="text-muted-foreground text-base py-2 md:pr-12">
                {t('Marketing.footer.tagline')}
              </p>

              {/* social links */}
              <nav
                aria-label="Social links"
                className="flex items-center gap-4 py-2"
              >
                <div className="flex items-center gap-2">
                  {socialLinks?.map((link) => (
                    <a
                      key={link.title}
                      href={link.href || '#'}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={link.title}
                      className="border border-border inline-flex size-8 items-center
                          justify-center rounded-full hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all duration-200"
                    >
                      {link.icon ? link.icon : null}
                    </a>
                  ))}
                </div>
              </nav>

              {/* built with button */}
              <BuiltWithButton />
            </div>
          </div>

          {/* footer links */}
          {footerLinks?.map((section) => (
            <div
              key={section.title}
              className="col-span-1 md:col-span-1 items-start"
            >
              <span className="text-sm font-semibold uppercase">
                {section.title}
              </span>
              <ul className="mt-4 list-inside space-y-3">
                {section.items?.map(
                  (item) =>
                    item.href && (
                      <li key={item.title}>
                        <LocaleLink
                          href={item.href || '#'}
                          target={item.external ? '_blank' : undefined}
                          className={cn(
                            'text-sm text-muted-foreground transition-colors duration-150 hover:text-primary',
                            !item.external &&
                              !item.href.includes('#') &&
                              (item.href === '/'
                                ? localePathname === '/'
                                : localePathname.startsWith(item.href)) &&
                              'font-semibold text-primary'
                          )}
                        >
                          {item.title}
                        </LocaleLink>
                      </li>
                    )
                )}
              </ul>
            </div>
          ))}
        </div>
      </Container>

      <div className="border-t py-8">
        <Container className="flex flex-col gap-5 px-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground text-sm">
            &copy; {new Date().getFullYear()} {t('Metadata.name')}. All Rights
            Reserved.
          </span>

          <nav
            aria-label={t('Marketing.footer.legal.title')}
            className="flex items-center gap-x-5"
          >
            <LocaleLink
              href={Routes.PrivacyPolicy}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('Marketing.footer.legal.items.privacyPolicy')}
            </LocaleLink>
            <LocaleLink
              href={Routes.TermsOfService}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('Marketing.footer.legal.items.termsOfService')}
            </LocaleLink>
          </nav>
        </Container>
      </div>
    </footer>
  );
}
