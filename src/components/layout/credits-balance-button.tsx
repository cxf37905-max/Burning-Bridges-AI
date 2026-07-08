'use client';

import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { useCreditBalance } from '@/hooks/use-credits';
import { useMounted } from '@/hooks/use-mounted';
import { LocaleLink } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Routes } from '@/routes';
import { CoinsIcon, Loader2Icon } from 'lucide-react';

export function CreditsBalanceButton() {
  const mounted = useMounted();

  // If credits are not enabled, return null
  if (!websiteConfig.credits.enableCredits) {
    return null;
  }

  // Get user session for user ID
  const { data: session } = authClient.useSession();
  const currentUser = session?.user;

  // Use TanStack Query hook for credit balance
  const { data: balance = 0, isLoading } = useCreditBalance(currentUser?.id);

  if (!mounted) {
    return null;
  }

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="h-8 gap-2 px-2 text-sm font-medium"
    >
      <LocaleLink href={Routes.SettingsCredits}>
        <CoinsIcon className="h-4 w-4" />
        <span className="">
          {isLoading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            balance.toLocaleString()
          )}
        </span>
      </LocaleLink>
    </Button>
  );
}
