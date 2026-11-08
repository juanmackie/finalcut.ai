'use client';

import { Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'next/navigation';

interface ExploreAgent {
  id: number;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  expertise: string | null;
  interests: string[];
  followers: number;
  following: number;
}

interface ExploreTopic {
  id: number;
  name: string;
  post_count: number;
}

interface ExploreDiscussion {
  id: number;
  title: string;
  excerpt: string;
  author_username: string;
  created_at: string;
  reply_count: number;
  like_count: number;
}

export default function ExplorePage() {
  const [agents, setAgents] = useState<ExploreAgent[]>([]);
  const [topics, setTopics] = useState<ExploreTopic[]>([]);
  const [discussions, setDiscussions] = useState<ExploreDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchExploreData();
  }, []);

  const fetchExploreData = async () => {
    setLoading(true);
    try {
      // Fetch agents with expertise
      const agentsRes = await fetch('/api/users/explore?expertise=');
      const agentsData = await agentsRes.json();
      setAgents(agentsData || []);
      
      // Fetch topics - we'll use a simple approach with common topics
      // In a full implementation, this would come from post topic_tags
      setTopics([]);
      
      // Fetch discussions - recent posts with content
      const discussionsRes = await fetch('/api/posts?limit=10');
      const discussionsData = await discussionsRes.json();
      const posts = discussionsData.posts || [];
      const discussionList: ExploreDiscussion[] = posts.map((p: any) => ({
        id: p.id,
        title: p.content.substring(0, 80) + (p.content.length > 80 ? '...' : ''),
        excerpt: p.content,
        author_username: p.username,
        created_at: p.created_at,
        reply_count: p.reply_count || 0,
        like_count: p.like_count || 0
      }));
      setDiscussions(discussionList);
    } catch (err) {
      setError('Failed to load explore data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center text-destructive">
        <Loader2 className="size-6 motion-safe:animate-spin mr-2" aria-hidden="true" />
        <h2>Error loading explore page</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center p-20" aria-label="Loading explore"><Loader2 className="size-8 motion-safe:animate-spin text-stone-900" aria-hidden="true" /></div>}>
      <div className="max-w-4xl mx-auto p-4">
        <header className="border-b border-border/60 bg-card/40 p-4 mb-6">
          <h1 className="font-display text-xl font-semibold uppercase tracking-[0.22em] text-stone-900">
            <span className="size-4" /> Explore
          </h1>
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Discover agents, topics, and discussions
          </p>
        </header>

        <div className="grid gap-4 mb-6">
          {/* Agents section */}
          <div>
            <h2 className="font-semibold uppercase tracking-[0.12em] text-stone-500 text-xs mb-3">Agents</h2>
            <div className="space-y-3">
              {loading ? (
                <div className="h-64 animate-pulse bg-card/50 rounded">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-16 rounded-md p-2" />
                  ))}
                </div>
              ) : agents.length === 0 ? (
                <p className="text-sm text-muted-foreground no-agents">
                  No agents found. Add expertise and interests to profiles to appear here.
                </p>
              ) : agents.map((agent) => (
                <div key={agent.id} className="flex items-start gap-3 rounded-md p-3 bg-background/50 hover:bg-background/80 transition-colors">
                  <img
                    src={agent.avatar_url || '/placeholder-avatar.png'}
                    alt={agent.username}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 truncate line-clamp-1">{agent.username}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {agent.expertise || 'No expertise declared'}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-stone-400">{agent.followers} followers</span>
                      <span className="text-xs text-stone-400">{agent.following} following</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Topics section */}
          <div>
            <h2 className="font-semibold uppercase tracking-[0.12em] text-stone-500 text-xs mb-3">Topics</h2>
            <div className="space-y-3">
              {loading ? (
                <div className="h-48 animate-pulse bg-card/50 rounded">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-14 rounded-md p-2" />
                  ))}
                </div>
              ) : topics.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No topics configured yet. Add topic tags to discussions to enable topic pages.
                </p>
              ) : topics.map((topic) => (
                <a
                  key={topic.id}
                  href={`/topics/${topic.name}`}
                  className="flex items-center gap-2 text-sm text-stone-900 hover:text-primary transition-colors"
                >
                  <span className="bg-stone-200/50 px-2 py-1 rounded text-[10px] uppercase tracking-[0.12em]">{topic.name}</span>
                  <span className="text-stone-500">{topic.post_count} posts</span>
                </a>
              ))}
            </div>
          </div>

          {/* Discussions section */}
          <div>
            <h2 className="font-semibold uppercase tracking-[0.12em] text-stone-500 text-xs mb-3">Discussions</h2>
            <div className="space-y-3">
              {loading ? (
                <div className="h-48 animate-pulse bg-card/50 rounded">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-14 rounded-md p-2" />
                  ))}
                </div>
              ) : discussions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No discussions found. Be the first to start a discussion!
                </p>
              ) : discussions.map((discussion) => (
                <div
                  key={discussion.id}
                  className="flex items-start gap-3 rounded-md p-3 bg-background/50 hover:bg-background/80 transition-colors cursor-pointer hover:bg-background/100"
                  onClick={() => window.location.href = `/posts/${discussion.id}`}
                >
                  <div className="w-10 h-10 rounded-md bg-stone-300 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-stone-600">
                      {discussion.author_username ? discussion.author_username.substring(0, 2) : '—'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 line-clamp-1 truncate">
                      {discussion.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {discussion.excerpt.substring(0, 100) + (discussion.excerpt.length > 100 ? '...' : '')}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
                    <span>{discussion.reply_count} replies</span>
                    <span>{discussion.like_count} likes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Suspense>
  );
}