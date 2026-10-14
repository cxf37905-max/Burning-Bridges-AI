'use client';

import { RouteLink as Link } from '@/components/layout/locale-link';
import type { ReactNode } from 'react';

export function StudioSectionLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
    >
      {children}
    </Link>
  );
}
