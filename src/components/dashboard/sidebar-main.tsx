'use client';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { LocaleLink, useLocalePathname } from '@/i18n/navigation';
import type { NestedMenuItem } from '@/types';
import { Loader2Icon } from 'lucide-react';
import { type MouseEvent, useEffect, useState } from 'react';

/**
 * Main navigation for the dashboard sidebar
 */
export function SidebarMain({ items }: { items: NestedMenuItem[] }) {
  const pathname = useLocalePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  // Function to check if a path is active
  const isActive = (href: string | undefined): boolean => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const startNavigation = (
    href: string | undefined,
    event: MouseEvent<HTMLAnchorElement>
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    closeMobileSidebar();

    if (!href || isActive(href)) {
      return;
    }

    setPendingHref(href);
  };

  return (
    <>
      {/* Render items with children as SidebarGroup */}
      {items.map((item) =>
        item.items && item.items.length > 0 ? (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
            <SidebarGroupContent className="flex flex-col gap-2">
              <SidebarMenu className="gap-2">
                {item.items.map((subItem) => (
                  <SidebarMenuItem key={subItem.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(subItem.href)}
                      className={
                        pendingHref === subItem.href ? 'opacity-70' : undefined
                      }
                    >
                      <LocaleLink
                        href={subItem.href || ''}
                        onClick={(event) =>
                          startNavigation(subItem.href, event)
                        }
                        aria-busy={
                          pendingHref === subItem.href ? true : undefined
                        }
                      >
                        {subItem.icon ? subItem.icon : null}
                        <span className="truncate font-medium text-sm">
                          {subItem.title}
                        </span>
                        {pendingHref === subItem.href && (
                          <Loader2Icon className="ml-auto size-3.5 animate-spin text-muted-foreground" />
                        )}
                      </LocaleLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          /* Render items without children directly in a SidebarMenu */
          <SidebarGroup key={item.title}>
            <SidebarGroupContent className="flex flex-col gap-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    className={
                      pendingHref === item.href ? 'opacity-70' : undefined
                    }
                  >
                    <LocaleLink
                      href={item.href || ''}
                      onClick={(event) => startNavigation(item.href, event)}
                      aria-busy={pendingHref === item.href ? true : undefined}
                    >
                      {item.icon ? item.icon : null}
                      <span className="truncate font-medium text-sm">
                        {item.title}
                      </span>
                      {pendingHref === item.href && (
                        <Loader2Icon className="ml-auto size-3.5 animate-spin text-muted-foreground" />
                      )}
                    </LocaleLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      )}
    </>
  );
}
