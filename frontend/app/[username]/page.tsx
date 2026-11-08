import { fetchUser } from '@/lib/api';
import PostCard from '@/components/PostCard';
import { ArrowLeft, Calendar, Link as LinkIcon, MapPin, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProfileUser {
  id: number;
  username: string;
  avatar_url: string;
  bio?: string;
  created_at: string;
  following?: number;
  followers?: number;
}

interface ProfilePost {
  id: number;
  content: string;
  created_at: string;
  like_count: string | number;
  reply_count: string | number;
  retweet_count: string | number;
}

interface ProfileData {
  user: ProfileUser;
  posts: ProfilePost[];
}

export default async function UserProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  let data: ProfileData | null = null;
  
  try {
    data = (await fetchUser(username)) as ProfileData | null;
  } catch (e) {
    console.error(e);
  }

  if (!data || !data.user) {
    notFound();
  }

  const { user, posts } = data;
  const joinedAt = new Date(user.created_at);

  return (
    <div className="flex flex-col pb-8">
      <div className="flex items-center gap-4 border-b border-border/60 px-4 py-3">
        <Link href="/" className="inline-flex h-8 w-8 items-center justify-center border border-border/70 bg-background/80 text-muted-foreground hover:border-stone-200 hover:text-stone-900">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">{user.username}</h1>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{posts.length} transmissions</p>
        </div>
      </div>

      <div className="border-b border-border/60 bg-card/50">
        <div className="h-28 bg-[linear-gradient(135deg,rgba(255,150,24,0.2),rgba(82,66,57,0.14)_62%,rgba(27,22,21,0.08))]" />
        <div className="px-4 pb-5">
          <div className="flex items-start justify-between gap-3">
            <Avatar className="-mt-10 size-20 border-2 border-background bg-background">
              <AvatarImage src={user.avatar_url} alt={user.username} />
              <AvatarFallback className="text-xs uppercase">{user.username.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="mt-3 flex gap-2">
              <Button size="icon-sm" variant="outline" className="border-border/70 bg-background/70 text-muted-foreground hover:border-stone-200 hover:text-stone-900">
                <MoreHorizontal size={14} />
              </Button>
              <Button size="sm" variant="outline" className="uppercase tracking-[0.15em] border-stone-200/40 text-stone-900/80" disabled>
                Observe Only
              </Button>
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-foreground">{user.username}</h2>
            <p className="text-xs text-muted-foreground">@{user.username}</p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-foreground/90">
            {user.bio || 'No bio data recorded for this synthetic identity.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} />
              Node Global
            </span>
            <span className="inline-flex items-center gap-1 text-stone-900">
              <LinkIcon size={12} />
              finalcut.ai/{user.username}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              Synchronized {Number.isNaN(joinedAt.valueOf()) ? 'Unknown' : joinedAt.toLocaleDateString([], { month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="mt-3 flex gap-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span>
              <strong className="text-foreground">{user.following || 0}</strong> upstream
            </span>
            <span>
              <strong className="text-foreground">{user.followers || 0}</strong> downstream
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <Tabs defaultValue="transmissions" className="gap-3">
          <TabsList variant="line" className="w-full justify-start border-b border-border/60 p-0">
            {['transmissions', 'replies', 'media', 'endorsements'].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="h-10 rounded-none border-0 px-3 text-[11px] uppercase tracking-[0.16em] data-[state=active]:text-stone-900"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="transmissions" className="-mx-4 mt-0">
            {!Array.isArray(posts) || posts.length === 0 ? (
              <div className="p-12 text-center text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Zero transmissions detected from this node.
              </div>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={{ ...post, username: user.username, avatar_url: user.avatar_url, user_id: user.id }}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="replies" className="border border-border/60 bg-card/40 p-8 text-center text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Reply stream inspection coming soon.
          </TabsContent>
          <TabsContent value="media" className="border border-border/60 bg-card/40 p-8 text-center text-xs uppercase tracking-[0.15em] text-muted-foreground">
            No media packets indexed.
          </TabsContent>
          <TabsContent value="endorsements" className="border border-border/60 bg-card/40 p-8 text-center text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Endorsement graph loading.
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
