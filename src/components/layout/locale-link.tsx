'use client';

import { routing } from '@/i18n/routing';
import { createNavigation } from 'next-intl/navigation';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, useRef } from 'react';
import { isRouteTransitionUrl, transitionRoute } from './route-transitions';

// 沿用同一 next-intl 路由配置与链接实现，仅增强真实客户端导航事件。
const { Link } = createNavigation(routing);

function useLinkTransition({
  onClick,
  onNavigate,
  replace,
  scroll,
}: Pick<
  ComponentProps<typeof NextLink>,
  'onClick' | 'onNavigate' | 'replace' | 'scroll'
>) {
  const router = useRouter();
  const clickedHref = useRef<string | null>(null);

  return {
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      clickedHref.current = event.currentTarget.href;
      onClick?.(event);
    },
    onNavigate: (event: { preventDefault: () => void }) => {
      let prevented = false;
      onNavigate?.({
        preventDefault() {
          prevented = true;
          event.preventDefault();
        },
      });
      const href = clickedHref.current;
      if (!prevented && href && scroll !== false) {
        const destination = new URL(href, window.location.href);
        if (
          destination.origin === window.location.origin &&
          destination.pathname === window.location.pathname
        ) {
          const section = destination.hash
            ? document.getElementById(decodeURIComponent(destination.hash.slice(1)))
            : document.documentElement;
          if (section) {
            event.preventDefault();
            if (destination.href !== window.location.href)
              router[replace ? 'replace' : 'push'](href, { scroll: false });
            const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth';
            if (destination.hash) section.scrollIntoView({ behavior, block: 'start' });
            else window.scrollTo({ top: 0, behavior });
            return;
          }
        }
      }
      if (
        prevented ||
        !href ||
        !isRouteTransitionUrl(href, window.location.href)
      )
        return;
      // onNavigate 已由 Next.js 排除修饰键、新标签、下载和外链；预取仍由 Link 保留。
      if (
        transitionRoute(() =>
          router[replace ? 'replace' : 'push'](href, {
            scroll: scroll ?? true,
          })
        )
      ) {
        event.preventDefault();
      }
    },
  };
}

export function LocaleLink(props: ComponentProps<typeof Link>) {
  const events = useLinkTransition(props);
  return <Link {...props} {...events} />;
}

// Fumadocs 已构造完整的本地化 href，不再给它重复加语言前缀。
export function RouteLink(props: ComponentProps<typeof NextLink>) {
  const events = useLinkTransition(props);
  return <NextLink {...props} {...events} />;
}
