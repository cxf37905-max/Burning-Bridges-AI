'use client';

import {
  Coins,
  CreditCard,
  Film,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { creditsKeys } from '@/hooks/use-credits';
import { StudioCreditBalance } from './studio-credit-balance';

const destinations = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/library', label: 'My videos', icon: Film },
  { href: '/settings/credits', label: 'Credits', icon: Coins },
  { href: '/settings/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings/profile', label: 'Profile', icon: UserRound },
  { href: '/settings/security', label: 'Security', icon: ShieldCheck },
];

interface StudioAccountMenuProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
  };
}

export function StudioAccountMenu({ user }: StudioAccountMenuProps) {
  const initial = user.email.trim().charAt(0).toUpperCase();
  const [signingOut, setSigningOut] = useState(false);
  const queryClient = useQueryClient();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        toast.error('Could not sign out. Please try again.');
        return;
      }
      queryClient.removeQueries({ queryKey: creditsKeys.all });
      window.location.assign('/');
    } catch {
      toast.error('Could not connect. Please try signing out again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="bb-account">
      <StudioCreditBalance userId={user.id} />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="bb-account-trigger"
            aria-label="Account menu"
          >
            <Avatar className="bb-account-avatar">
              <AvatarImage src={user.image ?? undefined} alt="" />
              <AvatarFallback className="bb-account-initial">
                {initial}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="bb-account-menu"
          align="end"
          sideOffset={10}
        >
          <DropdownMenuLabel className="bb-account-menu-label">
            <span>{user.name || user.email}</span>
            {user.name && (
              <span className="bb-account-menu-email">{user.email}</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {destinations.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            asChild
            disabled={signingOut}
            onSelect={(event) => event.preventDefault()}
          >
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
            >
              <LogOut size={16} aria-hidden="true" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
