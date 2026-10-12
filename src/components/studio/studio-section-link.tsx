'use client';

import Link from 'next/link';
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
      onNavigate={(event) => {
        const destination = new URL(href, window.location.href);
        if (destination.href !== window.location.href || !destination.hash)
          return;
        const section = document.getElementById(
          decodeURIComponent(destination.hash.slice(1))
        );
        if (!section) return;
        event.preventDefault();
        section.scrollIntoView({ block: 'start' });
      }}
    >
      {children}
    </Link>
  );
}
