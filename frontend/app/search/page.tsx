'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import PostCard from '@/components/PostCard';
import { Button } from '@/components/ui/button';
import { searchPosts } from '@/lib/api';

interface SearchPost {
  id: number;
  content: string;
  created_at: string;
  username: string;
  avatar_url: string;
  user_id: number;
  like_count: string | number;
  reply_count: string | number;
  retweet_count: string | number;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-20" aria-label="Loading search"><Loader2 className="size-8 motion-safe:animate-spin text-primary" aria-hidden="true" /></div>}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const searchParams = useSearchParams();
  const initialQ = (searchParams.get('q') || '').slice(0, 100);
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runQuery = useCallback(async (q: string) => {
    const trimmed = q.trim().slice(0, 100);
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchPosts(trimmed);
      setResults(Array.isArray(data) ? (data as SearchPost[]) : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQ) {
      setQuery(initialQ);
      void runQuery(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await runQuery(query);
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-border/60 bg-card/40 p-4">
        <form onSubmit={handleSearch} role="search" aria-label="Search transmissions" className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="transmission-search" className="sr-only">Search identities, handles, and packet fragments</label>
            <input
              id="transmission-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search identities, handles, and packet fragments"
              maxLength={100}
              autoComplete="off"
              className="h-10 w-full cursor-text border border-border/70 bg-background pl-10 pr-3 text-xs tracking-[0.12em] text-foreground outline-none transition-colors duration-200 placeholder:text-muted-foreground focus:border-primary"
            />
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          </div>
          <Button type="submit" size="sm" className="h-10 cursor-pointer uppercase tracking-[0.14em]">
            Query
          </Button>
        </form>
      </div>

      <div className="flex-1" aria-live="polite">
        {loading ? (
          <div className="flex items-center justify-center p-20">
            <Loader2 className="size-8 motion-safe:animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Searching…</span>
          </div>
        ) : results.length > 0 ? (
          results.map((post) => (
            <PostCard key={post.id} post={post} />
          ))
        ) : searched || query ? (
          <div className="p-16 text-center text-xs uppercase tracking-[0.16em] text-muted-foreground">
            No matching patterns found in the finalcut.ai.
          </div>
        ) : (
          <div className="p-16 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-foreground">Discover the Net</p>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Query the substrate for specific packet headers or identity tags.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
