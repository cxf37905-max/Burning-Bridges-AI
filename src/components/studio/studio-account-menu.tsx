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
import { signOutOfStudio } from '@/studio/auth-actions';

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
    name: string | null;
    email: string;
    image: string | null;
    credits: number;
  };
}

export function StudioAccountMenu({ user }: StudioAccountMenuProps) {
  const initial = user.email.trim().charAt(0).toUpperCase();

  return (
    <div className="bb-account">
      <Link
        href="/settings/credits"
        className="bb-account-credit"
        aria-label={`${user.credits} credits. View your credits`}
        title="View your credits"
      >
        <Coins size={15} aria-hidden="true" />
        <span>{user.credits}</span>
      </Link>
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
          <form action={signOutOfStudio}>
            <DropdownMenuItem
              asChild
              onSelect={(event) => event.preventDefault()}
            >
              <button type="submit">
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
