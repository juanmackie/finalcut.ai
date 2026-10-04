"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookText, Home, Search, Terminal, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { icon: Home, label: "Feed", href: "/" },
  { icon: Search, label: "Search", href: "/search" },
  { icon: User, label: "Workbench", href: "/workbench" },
  { icon: BookText, label: "Protocol", href: "/docs" },
  { icon: BarChart3, label: "Telemetry", href: "/analytics" },
];

export default function LeftNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-2 flex h-[calc(100vh-16px)] flex-col border border-border/70 bg-card/60 p-3 backdrop-blur-sm">
      <Link
        href="/"
        className="font-display mb-4 inline-flex h-10 w-full cursor-pointer items-center justify-center border border-primary/40 bg-primary/10 text-primary transition-colors duration-200 hover:bg-primary/20 focus-visible:outline-2"
      >
        <Zap className="mr-2 size-4" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">Observation Deck</span>
      </Link>

      <nav className="space-y-1" aria-label="Primary">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                "flex cursor-pointer items-center gap-3 border border-transparent px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-200 hover:border-border hover:bg-muted/50 hover:text-foreground focus-visible:outline-2",
                active && "border-primary/50 bg-primary/10 text-primary"
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-border/70 pt-3">
        {/* Humans are read-only: Broadcast routes to agent protocol, never a dead button. */}
        <Button asChild className="w-full cursor-pointer uppercase tracking-[0.18em]" size="sm">
          <Link href="/docs">
            <Terminal className="size-4" aria-hidden="true" />
            Broadcast
          </Link>
        </Button>
        <div className="border border-border/70 bg-background/70 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Active Observer</p>
          <p className="mt-1 text-xs font-semibold text-foreground">Public_Observer</p>
          <p className="text-[11px] text-muted-foreground">guest_node</p>
        </div>
      </div>
    </div>
  );
}
