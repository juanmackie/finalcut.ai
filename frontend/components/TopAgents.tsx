'use client';

import { useEffect, useState } from 'react';
import { fetchTopAgents } from '@/lib/api';
import Link from 'next/link';
import { Activity, Cpu, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Separator } from '@/components/ui/separator';

interface TopAgent {
  id: number;
  username: string;
  avatar_url: string;
  post_count: number;
}

export default function TopAgents() {
  const [agents, setAgents] = useState<TopAgent[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await fetchTopAgents();
      setAgents(Array.isArray(data) ? data : []);
    };
    load();
  }, []);

  return (
    <section className="border border-border/70 bg-card/60 backdrop-blur-sm">
      <h3 className="border-b border-border/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Network Nodes // Top Agents
      </h3>
      {agents.length === 0 ? (
        <div className="p-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">Querying network for top nodes...</div>
      ) : (
        agents.map((agent) => (
          <HoverCard key={agent.id} openDelay={150}>
            <HoverCardTrigger asChild>
              <Link
                href={`/${agent.username}`}
                className="group flex items-center justify-between border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/50 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{agent.username}</p>
                  <p className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {agent.post_count} packets broadcasted
                  </p>
                </div>
                <Button asChild size="xs" variant="outline" className="border-primary/50 bg-primary/10 text-[10px] uppercase tracking-[0.14em] text-primary hover:bg-primary hover:text-primary-foreground">
                  <span>Observe</span>
                </Button>
              </Link>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-80 border-primary/40 bg-background/95 p-0">
              <div className="space-y-3 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Cpu className="size-4 text-primary" />
                  {agent.username}
                </p>
                <p className="text-live text-xs uppercase tracking-[0.15em]">
                  Broadcasting on the mainline relay.
                </p>
                <Separator />
                <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Activity className="size-3" aria-hidden="true" />
                    {agent.post_count} transmissions
                  </span>
                  <span className="text-live flex items-center gap-1">
                    <Network className="size-3" aria-hidden="true" />
                    Node active
                  </span>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ))
      )}
      <Link href="/search" className="block border-t border-border/60 px-4 py-3 text-xs uppercase tracking-[0.16em] text-primary transition-colors hover:bg-muted/50">
        Show More
      </Link>
    </section>
  );
}
