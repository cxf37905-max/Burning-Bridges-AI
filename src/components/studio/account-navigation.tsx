'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Film,
  CreditCard,
  Coins,
  UserRound,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react';
const destinations = [
  { href: '/dashboard', name: 'Overview', icon: LayoutDashboard },
  { href: '/library', name: 'My videos', icon: Film },
  { href: '/settings/credits', name: 'Credits', icon: Coins },
  { href: '/settings/billing', name: 'Billing', icon: CreditCard },
  { href: '/settings/profile', name: 'Profile', icon: UserRound },
  { href: '/settings/security', name: 'Security', icon: ShieldCheck },
];
export function AccountNavigation() {
  const pathname = usePathname().replace(/^\/en(?=\/|$)/, '');
  return (
    <nav className="bb-account-nav" aria-label="Your account">
      {destinations.map(({ href, name, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
        >
          <Icon size={17} />
          {name}
        </Link>
      ))}
    </nav>
  );
}
