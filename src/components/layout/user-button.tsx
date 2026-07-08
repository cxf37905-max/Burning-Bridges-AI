'use client';

import { UserAvatar } from '@/components/layout/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAvatarLinks } from '@/config/avatar-config';
import { websiteConfig } from '@/config/website';
import {
  LocaleLink,
  useLocalePathname,
  useLocaleRouter,
} from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import type { User } from 'better-auth';
import { Loader2Icon, LogOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditsBalanceMenu } from './credits-balance-menu';

interface UserButtonProps {
  user: User;
}

export function UserButton({ user }: UserButtonProps) {
  const t = useTranslations();
  const avatarLinks = useAvatarLinks();
  const localeRouter = useLocaleRouter();
  const localePathname = useLocalePathname();
  const [open, setOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isNavigating = pendingHref !== null;

  useEffect(() => {
    setPendingHref(null);
    setOpen(false);
  }, [localePathname]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isNavigating && nextOpen) {
      return;
    }

    setOpen(nextOpen);
  };

  const startNavigation = (
    href: string | undefined,
    event?: MouseEvent<HTMLAnchorElement>
  ) => {
    if (
      event?.defaultPrevented ||
      event?.button !== 0 ||
      event?.metaKey ||
      event?.ctrlKey ||
      event?.shiftKey ||
      event?.altKey
    ) {
      return;
    }

    if (!href || href === localePathname) {
      setOpen(false);
      return;
    }

    setPendingHref(href);
  };

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // TanStack Query automatically handles cache invalidation on sign out
          localeRouter.replace('/');
        },
        onError: (error) => {
          console.error('sign out error:', error);
          toast.error(t('Common.logoutFailed'));
        },
      },
    });
  };

  // Desktop View, use DropdownMenu
  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        className="relative rounded-full outline-none disabled:cursor-wait"
        disabled={isNavigating}
      >
        <UserAvatar
          name={user.name}
          image={user.image}
          className={`size-8 border transition-opacity ${
            isNavigating ? 'opacity-60' : ''
          }`}
        />
        {isNavigating && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* show user name and email */}
        <div className="flex items-center gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            <p className="font-medium">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />

        {/* show credits balance button if credits are enabled */}
        {websiteConfig.credits.enableCredits && (
          <>
            <CreditsBalanceMenu onNavigateStart={startNavigation} />
            <DropdownMenuSeparator />
          </>
        )}

        {avatarLinks.map((item) => (
          <DropdownMenuItem
            key={item.title}
            asChild
            onSelect={(event) => event.preventDefault()}
          >
            <LocaleLink
              href={item.href || '#'}
              onClick={(event) => startNavigation(item.href, event)}
            >
              {item.icon ? item.icon : null}
              {item.title}
              {pendingHref === item.href && (
                <Loader2Icon className="ml-auto size-3.5 animate-spin text-muted-foreground" />
              )}
            </LocaleLink>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async (event) => {
            event.preventDefault();
            setOpen(false);
            handleSignOut();
          }}
        >
          <LogOutIcon className="size-4" />
          {t('Common.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
