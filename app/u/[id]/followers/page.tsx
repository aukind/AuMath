// 某用户的粉丝列表（RSC，公开可见）。
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import UserList from '@/components/profile/UserList';
import { getPublicProfile } from '@/app/actions/user-profile';
import { getFollowers, getMyFollowingIds } from '@/app/actions/follows';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return { title: profile ? `${profile.username} 的粉丝 · AuMath` : '粉丝 · AuMath' };
}

export default async function FollowersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  const supabase = await createClient();
  const [{ data: { user } }, followers, followingIds] = await Promise.all([
    supabase.auth.getUser(),
    getFollowers(id),
    getMyFollowingIds(),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href={`/u/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回主页
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-5 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          {profile.username} 的粉丝
          <span className="ml-2 text-sm font-medium text-zinc-400 tabular-nums">{followers.length}</span>
        </h1>
        <UserList
          users={followers}
          followingIds={followingIds}
          currentUserId={user?.id}
          isLoggedIn={!!user}
          emptyText="还没有粉丝。"
        />
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
