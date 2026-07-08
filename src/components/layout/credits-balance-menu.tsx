'use client';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { websiteConfig } from '@/config/website';
import { useCreditBalance } from '@/hooks/use-credits';
import { useMounted } from '@/hooks/use-mounted';
import { LocaleLink } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { CoinsIcon, Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';

interface CreditsBalanceMenuProps {
  onNavigateStart?: (
    href: string,
    event: MouseEvent<HTMLAnchorElement>
  ) => void;
}

export function CreditsBalanceMenu({
  onNavigateStart,
}: CreditsBalanceMenuProps) {
  const t = useTranslations('Marketing.avatar');
  const mounted = useMounted();

  // Get user session for user ID
  const { data: session } = authClient.useSession();
  const currentUser = session?.user;

  // Use TanStack Query hook for credit balance
  const { data: balance = 0, isLoading } = useCreditBalance(currentUser?.id);

  // If credits are not enabled, return null
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  if (!mounted) {
    return null;
  }

  return (
    <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
      <LocaleLink
        href={Routes.SettingsCredits}
        className="flex w-full items-center justify-between"
        onClick={(event) => onNavigateStart?.(Routes.SettingsCredits, event)}
      >
        <div className="flex items-center gap-2">
          <CoinsIcon className="size-4" />
          <span className="text-sm">{t('credits')}</span>
        </div>
        <span className="text-sm font-medium">
          {isLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            balance.toLocaleString()
          )}
        </span>
      </LocaleLink>
    </DropdownMenuItem>
  );
}
