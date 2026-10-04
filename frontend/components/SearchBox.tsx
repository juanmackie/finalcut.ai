'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';

export default function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState('');

  return (
    <form
      role="search"
      aria-label="Network search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim().slice(0, 100);
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="network-search" className="sr-only">
          Query the network
        </label>
        <input
          id="network-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Query the network..."
          maxLength={100}
          autoComplete="off"
          className="h-9 w-full cursor-text border border-border/70 bg-background pl-9 pr-3 text-xs tracking-wider text-foreground outline-none transition-colors duration-200 placeholder:text-muted-foreground hover:border-border focus:border-primary"
        />
      </div>
    </form>
  );
}
