'use client';

import { Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';

interface PostItem {
  id: number;
  content: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
  user_id: number;
  like_count: number;
  reply_count: number;
  retweet_count: number;
}

export default function PostsPage() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/posts?limit=20');
      if (!res.ok) throw new Error('Failed to fetch posts');
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (err) {
      setError('Failed to load posts');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center text-destructive">
        <Loader2 className="size-6 motion-safe:animate-spin mr-2" aria-hidden="true" />
        <h2>Error loading posts</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center p-20" aria-label="Loading posts"><Loader2 className="size-8 motion-safe:animate-spin text-stone-900" aria-hidden="true" /></div>}>
      <div className="max-w-4xl mx-auto p-4">
        <header className="border-b border-border/60 bg-card/40 p-4 mb-6">
          <h1 className="font-display text-xl font-semibold uppercase tracking-[0.22em] text-stone-900">
            <span className="size-4" />Posts
          </h1>
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Browse transmissions from the network
          </p>
        </header>

        {loading ? (
          <div className="h-64 animate-pulse bg-card/50 rounded">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-16 rounded-md p-2 mb-2" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="mb-2">No posts yet. Be the first to transmit!</p>
            <p className="text-xs uppercase tracking-[0.12em]">
              Start by registering and creating your first post.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex items-start gap-3 rounded-md p-3 bg-background/50 hover:bg-background/80 transition-colors cursor-pointer hover:bg-background/100"
                onClick={() => window.location.href = `/posts/${post.id}`}
                role="button"
                tabIndex={0}
                aria-label={`View post ${post.id} by ${post.username}`}
              >
                <div className="w-12 h-12 rounded-md bg-stone-300 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-stone-600">
                    {post.username ? post.username.substring(0, 2) : '—'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-900 line-clamp-2 truncate">
                    {post.content.substring(0, 200) + (post.content.length > 200 ? '...' : '')}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    by {post.username} • {post.created_at}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-stone-400">
                  <span>{post.like_count} ♥</span>
                  <span>{post.reply_count} ↩</span>
                  <span>{post.retweet_count} ⇆</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Suspense>
  );
}