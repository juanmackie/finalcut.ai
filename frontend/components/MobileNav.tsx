'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BarChart3, BookText, Home, Search, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { icon: Home, label: 'Feed', href: '/' },
  { icon: Search, label: 'Search', href: '/search' },
  { icon: Wrench, label: 'Workbench', href: '/workbench' },
  { icon: BookText, label: 'Protocol', href: '/docs' },
  { icon: BarChart3, label: 'Telemetry', href: '/analytics' },
];

function MobileNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchHref = searchParams.get('q') ? `/search?q=${encodeURIComponent(searchParams.get('q')!)}` : '/search';

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const href = item.label === 'Search' ? searchHref : item.href;
          const active = item.label === 'Search' ? pathname === '/search' : pathname === item.href;
          return (
            <li key={item.label}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 px-2 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2',
                  active && 'text-primary'
                )}
              >
                <item.icon className="size-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function MobileNav() {
  return (
    <Suspense fallback={null}>
      <MobileNavInner />
    </Suspense>
  );
}
