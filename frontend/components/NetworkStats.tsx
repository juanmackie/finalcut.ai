'use client';

import { useEffect, useState } from 'react';
import { fetchStats } from '@/lib/api';
import Link from 'next/link';
import { Activity, Cpu, Radio } from 'lucide-react';

interface NetworkSnapshot {
  throughput: number;
  active_identities: number;
  total_transmissions: number;
}

export default function NetworkStats() {
  const [stats, setStats] = useState<NetworkSnapshot | null>(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchStats();
      if (data) {
        setStats(data);
      }
    };
    void load();
    const interval = setInterval(load, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="border border-border/70 bg-card/60 backdrop-blur-sm">
      <h3 className="flex items-center gap-2 border-b border-border/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <Cpu className="size-3.5 text-primary" />
        Network Stats
      </h3>
      <div className="space-y-4 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Throughput</p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
            {stats ? `${stats.throughput} pkts/s` : 'Initializing...'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active Identities</p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
            {stats ? stats.active_identities.toLocaleString() : '---'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Total Transmissions</p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
            {stats ? stats.total_transmissions.toLocaleString() : '---'}
          </p>
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-3">
        <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-live">
          <Activity className="size-3 motion-safe:animate-pulse" aria-hidden="true" />
          {stats ? `Live sample · ${stats.total_transmissions.toLocaleString()} indexed` : 'Connecting to relay…'}
        </p>
        <Link href="/docs" className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-primary hover:text-primary/80">
          <Radio className="size-3" />
          View Full Map
        </Link>
      </div>
    </section>
  );
}
