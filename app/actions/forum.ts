'use server';

// 论坛模块 Server Actions —— 替换原 lib/forum/mockApi.ts。
// 写操作的作者一律取自服务端 session（绝不信任客户端传入的 author），
// 权限由数据库 RLS 兜底（见 supabase/migrations/010_forum.sql）。
//
// 注：forum_* / profiles 表未纳入 types/database.ts 的 Database 泛型，
// 沿用本仓约定 `const sb = supabase as any` 做表查询（见 user-workspace.ts）。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications';
import type {
  ForumComment,
  ForumPost,
  ForumUser,
  ReplyTarget,
  SessionUser,
  SubComment,
} from '@/types/forum';

// ── 行 → 契约类型 的映射 ────────────────────────────────────
interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  role: string;
}

function toUser(p: ProfileRow | null): ForumUser {
  if (!p) return { id: 'unknown', username: '已注销用户', role: 'user' };
  return {
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url ?? undefined,
    role: p.role === 'admin' ? 'admin' : 'user',
  };
}

// PostgREST 关系嵌套命中 FK 时是对象，但类型上可能被推断为数组，统一收敛。
function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function mapPost(
  d: any,
  commentCount: number,
  upvotes = 0,
  upvotedByMe = false,
  favoritedByMe = false,
): ForumPost {
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    author: toUser(first(d.author) as ProfileRow | null),
    createdAt: d.created_at,
    viewCount: d.view_count,
    commentCount,
    upvotes,
    upvotedByMe,
    favoritedByMe,
    tags: d.tags ?? [],
  };
}

// 帖子点赞/收藏聚合（分离查询，表未建/出错时降级为 0/false，绝不炸论坛页）。
async function getPostInteractions(
  sb: any,
  postId: string,
  uid: string | null,
): Promise<{ upvotes: number; upvotedByMe: boolean; favoritedByMe: boolean }> {
  let upvotes = 0;
  let upvotedByMe = false;
  let favoritedByMe = false;
  try {
    const { count } = await sb
      .from('forum_post_votes')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', postId);
    upvotes = count ?? 0;
    if (uid) {
      const [voteRes, favRes] = await Promise.all([
        sb.from('forum_post_votes').select('post_id').eq('post_id', postId).eq('user_id', uid).maybeSingle(),
        sb.from('forum_post_favorites').select('post_id').eq('post_id', postId).eq('user_id', uid).maybeSingle(),
      ]);
      upvotedByMe = !!voteRes.data;
      favoritedByMe = !!favRes.data;
    }
  } catch {
    // 迁移 022 未运行 → 默认 0/false
  }
  return { upvotes, upvotedByMe, favoritedByMe };
}

// 列表批量点赞计数：一把查所有帖的点赞行后按 post_id 计数（表未建 → 空 Map）。
async function getPostVoteCounts(sb: any, postIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (postIds.length === 0) return m;
  try {
    const { data } = await sb.from('forum_post_votes').select('post_id').in('post_id', postIds);
    for (const row of (data ?? []) as { post_id: string }[]) {
      m.set(row.post_id, (m.get(row.post_id) ?? 0) + 1);
    }
  } catch {
    // 迁移 022 未运行 → 空
  }
  return m;
}

// ── 当前登录用户（供页面决定按钮可见性 / 作者归属）──────────
export async function getSessionForumUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const sb = supabase as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await sb
    .from('profiles')
    .select('id, username, avatar_url, role')
    .eq('id', user.id)
    .single();

  return data
    ? toUser(data as ProfileRow)
    : { id: user.id, username: user.email?.split('@')[0] ?? '我', role: 'user' };
}

// ── 帖子列表（论坛首页）置顶优先，再按时间倒序 ───────────────
// ── 帖子列表（论坛首页）置顶优先，再按时间倒序 ───────────────
export async function getForumPosts(): Promise<ForumPost[]> {
  const supabase = await createClient();
  const sb = supabase as any;
  const { data, error } = await sb
    .from('forum_posts')
    .select(
      `id, title, content, view_count, tags, created_at, is_pinned,
       author:profiles!forum_posts_author_id_fkey(id, username, avatar_url, role),
       comments:forum_comments(count)` // <--- 新增这行：同时去评论表查数量
    )
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error('帖子列表加载失败');

  // 批量点赞计数（单独一把查，表未建时降级为 0，不影响列表）
  const voteCountByPost = await getPostVoteCounts(sb, (data ?? []).map((d: any) => d.id));

  // d.comments 返回的是类似 [{ count: 2 }] 的数组，提取并传给 mapPost
  return (data ?? []).map((d: any) =>
    mapPost(d, d.comments?.[0]?.count ?? 0, voteCountByPost.get(d.id) ?? 0),
  );
}

// ── 发布新主贴，返回新帖 id（供客户端跳转）──────────────────
export async function createForumPost(input: {
  title: string;
  content: string; // 序列化的 Lexical JSON
  tags: string[];
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const sb = supabase as any;
  const uid = await requireUserId();

  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) {
    throw new Error('标题需在 1–200 字之间');
  }

  const tags = input.tags
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8); // 防滥用：最多 8 个标签

  const { data, error } = await sb
    .from('forum_posts')
    .insert({ title, content: input.content, author_id: uid, tags })
    .select('id')
    .single();

  if (error || !data) throw new Error('发帖失败：' + (error?.message ?? '未知错误'));
  revalidatePath('/forum');
  return { id: data.id };
}

// ── 读取主贴 ────────────────────────────────────────────────
export async function getForumPost(postId: string): Promise<ForumPost> {
  const supabase = await createClient();
  const sb = supabase as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await sb
    .from('forum_posts')
    .select(
      `id, title, content, view_count, tags, created_at,
       author:profiles!forum_posts_author_id_fkey(id, username, avatar_url, role)`,
    )
    .eq('id', postId)
    .single();

  if (error || !data) throw new Error('帖子不存在或加载失败');

  const { count } = await sb
    .from('forum_comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  const { upvotes, upvotedByMe, favoritedByMe } = await getPostInteractions(sb, postId, user?.id ?? null);

  return mapPost(data, count ?? 0, upvotes, upvotedByMe, favoritedByMe);
}

// ── 读取评论树（一级 + 楼中楼 + 点赞数）────────────────────
export async function getForumComments(postId: string): Promise<ForumComment[]> {
  const supabase = await createClient();
  const sb = supabase as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await sb
    .from('forum_comments')
    .select(
      `id, post_id, content, created_at,
       author:profiles!forum_comments_author_id_fkey(id, username, avatar_url, role),
       votes:forum_comment_votes(count),
       sub_comments:forum_sub_comments(
         id, parent_id, reply_to_user_id, content, created_at,
         author:profiles!forum_sub_comments_author_id_fkey(id, username, avatar_url, role)
       )`,
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .order('created_at', { referencedTable: 'forum_sub_comments', ascending: true });

  if (error) throw new Error('评论加载失败');

  const comments: ForumComment[] = (data ?? []).map(
    (c: any): ForumComment => ({
      id: c.id,
      postId: c.post_id,
      content: c.content,
      author: toUser(first(c.author) as ProfileRow | null),
      createdAt: c.created_at,
      upvotes: c.votes?.[0]?.count ?? 0,
      upvotedByMe: false,
      subComments: (c.sub_comments ?? []).map(
        (s: any): SubComment => ({
          id: s.id,
          parentId: s.parent_id,
          replyToUserId: s.reply_to_user_id ?? undefined,
          content: s.content,
          author: toUser(first(s.author) as ProfileRow | null),
          createdAt: s.created_at,
        }),
      ),
    }),
  );

  // 登录态：一把查出当前用户在这些评论里赞过哪些，置 upvotedByMe 供高亮 + 正确切换
  if (user && comments.length > 0) {
    const { data: votes } = await sb
      .from('forum_comment_votes')
      .select('comment_id')
      .eq('user_id', user.id)
      .in('comment_id', comments.map((c) => c.id));
    const voted = new Set((votes ?? []).map((v: { comment_id: string }) => v.comment_id));
    for (const c of comments) c.upvotedByMe = voted.has(c.id);
  }

  return comments;
}

// ── 浏览数自增（每次进入详情页调用一次）────────────────────
export async function incrementForumView(postId: string): Promise<void> {
  const supabase = await createClient();
  await (supabase as any).rpc('increment_post_view', { p_post_id: postId });
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录后再发表');
  return user.id;
}

// ── 发表回复（一级 / 楼中楼）统一入口 ───────────────────────
export async function submitForumReply(
  target: ReplyTarget,
  content: string,
): Promise<{ kind: 'comment'; data: ForumComment } | { kind: 'sub'; data: SubComment }> {
  const supabase = await createClient();
  const sb = supabase as any;
  const uid = await requireUserId();

  if (target.kind === 'post') {
    const { data, error } = await sb
      .from('forum_comments')
      .insert({ post_id: target.postId, content, author_id: uid })
      .select(
        `id, post_id, content, created_at,
         author:profiles!forum_comments_author_id_fkey(id, username, avatar_url, role)`,
      )
      .single();
    if (error || !data) throw new Error('发布失败：' + (error?.message ?? '未知错误'));
    revalidatePath(`/forum/${target.postId}`);
    // 通知楼主：有人回复了你的帖子
    const { data: post } = await sb.from('forum_posts').select('author_id').eq('id', target.postId).maybeSingle();
    await notify(sb, { recipientId: post?.author_id, actorId: uid, type: 'reply_post', postId: target.postId });
    return {
      kind: 'comment',
      data: {
        id: data.id,
        postId: data.post_id,
        content: data.content,
        author: toUser(first(data.author) as ProfileRow | null),
        createdAt: data.created_at,
        upvotes: 0,
        subComments: [],
      },
    };
  }

  const replyToUserId = target.kind === 'sub' ? target.replyToUserId : null;
  const { data, error } = await sb
    .from('forum_sub_comments')
    .insert({
      parent_id: target.parentId,
      reply_to_user_id: replyToUserId,
      content,
      author_id: uid,
    })
    .select(
      `id, parent_id, reply_to_user_id, content, created_at,
       author:profiles!forum_sub_comments_author_id_fkey(id, username, avatar_url, role)`,
    )
    .single();
  if (error || !data) throw new Error('发布失败：' + (error?.message ?? '未知错误'));
  revalidatePath(`/forum/${target.postId}`);
  // 通知被回复的楼主（一级回复作者），以及被 @ 的子评论作者
  const { data: parent } = await sb
    .from('forum_comments')
    .select('author_id, post_id')
    .eq('id', target.parentId)
    .maybeSingle();
  if (parent) {
    await notify(sb, { recipientId: parent.author_id, actorId: uid, type: 'reply_comment', postId: parent.post_id });
    if (replyToUserId && replyToUserId !== parent.author_id) {
      await notify(sb, { recipientId: replyToUserId, actorId: uid, type: 'reply_comment', postId: parent.post_id });
    }
  }
  return {
    kind: 'sub',
    data: {
      id: data.id,
      parentId: data.parent_id,
      replyToUserId: data.reply_to_user_id ?? undefined,
      content: data.content,
      author: toUser(first(data.author) as ProfileRow | null),
      createdAt: data.created_at,
    },
  };
}

// ── 评论点赞 / 取消点赞，返回最新计数 + 切换后状态 ───────────
export async function toggleForumUpvote(commentId: string): Promise<{ upvotes: number; upvoted: boolean }> {
  const supabase = await createClient();
  const sb = supabase as any;
  const uid = await requireUserId();

  const { data: existing } = await sb
    .from('forum_comment_votes')
    .select('comment_id')
    .eq('comment_id', commentId)
    .eq('user_id', uid)
    .maybeSingle();

  let upvoted: boolean;
  if (existing) {
    const { error: delErr } = await sb
      .from('forum_comment_votes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', uid);
    if (delErr) throw new Error('取消点赞失败：' + delErr.message);
    upvoted = false;
  } else {
    // 检查 insert 错误：若线上表约束异常（如旧版 user_id 单列唯一键）会在此抛出，
    // 触发客户端回滚 + toast，而非静默挤掉用户在其它评论上的赞。
    const { error: insErr } = await sb.from('forum_comment_votes').insert({ comment_id: commentId, user_id: uid });
    if (insErr) throw new Error('点赞失败：' + insErr.message);
    // 新点赞 → 通知被赞回复的作者
    const { data: comment } = await sb
      .from('forum_comments')
      .select('author_id, post_id')
      .eq('id', commentId)
      .maybeSingle();
    await notify(sb, { recipientId: comment?.author_id, actorId: uid, type: 'like', postId: comment?.post_id });
    upvoted = true;
  }

  const { count } = await sb
    .from('forum_comment_votes')
    .select('comment_id', { count: 'exact', head: true })
    .eq('comment_id', commentId);
  return { upvotes: count ?? 0, upvoted };
}

// ── 帖子点赞 / 取消点赞（公开计数，仿评论点赞）──────────────
export async function toggleForumPostUpvote(postId: string): Promise<{ upvotes: number; upvoted: boolean }> {
  const supabase = await createClient();
  const sb = supabase as any;
  const uid = await requireUserId();

  const { data: existing } = await sb
    .from('forum_post_votes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', uid)
    .maybeSingle();

  let upvoted: boolean;
  if (existing) {
    const { error: delErr } = await sb.from('forum_post_votes').delete().eq('post_id', postId).eq('user_id', uid);
    if (delErr) throw new Error('取消点赞失败：' + delErr.message);
    upvoted = false;
  } else {
    const { error: insErr } = await sb.from('forum_post_votes').insert({ post_id: postId, user_id: uid });
    if (insErr) throw new Error('点赞失败：' + insErr.message);
    // 新点赞 → 通知帖主
    const { data: post } = await sb.from('forum_posts').select('author_id').eq('id', postId).maybeSingle();
    await notify(sb, { recipientId: post?.author_id, actorId: uid, type: 'like', postId });
    upvoted = true;
  }

  const { count } = await sb
    .from('forum_post_votes')
    .select('post_id', { count: 'exact', head: true })
    .eq('post_id', postId);
  revalidatePath(`/forum/${postId}`);
  return { upvotes: count ?? 0, upvoted };
}

// ── 帖子收藏 / 取消收藏（私有书签，仿题目收藏）──────────────
export async function toggleForumPostFavorite(postId: string): Promise<{ favorited: boolean }> {
  const supabase = await createClient();
  const sb = supabase as any;
  const uid = await requireUserId();

  const { data: existing } = await sb
    .from('forum_post_favorites')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', uid)
    .maybeSingle();

  if (existing) {
    const { error: delErr } = await sb.from('forum_post_favorites').delete().eq('post_id', postId).eq('user_id', uid);
    if (delErr) throw new Error('取消收藏失败：' + delErr.message);
    return { favorited: false };
  }
  const { error: insErr } = await sb.from('forum_post_favorites').insert({ post_id: postId, user_id: uid });
  if (insErr) throw new Error('收藏失败：' + insErr.message);
  return { favorited: true };
}

// ── 删除评论（作者或管理员；RLS 最终把关）──────────────────
export async function deleteForumComment(commentId: string): Promise<void> {
  const supabase = await createClient();
  const sb = supabase as any;
  await requireUserId();
  const { error } = await sb.from('forum_comments').delete().eq('id', commentId);
  if (error) throw new Error('删除失败，可能无权限');
}

// ── 管理员：置顶 / 加精 ─────────────────────────────────────
export async function setForumPostFlags(
  postId: string,
  flags: { isPinned?: boolean; isFeatured?: boolean },
): Promise<void> {
  const supabase = await createClient();
  const sb = supabase as any;
  await requireUserId();
  const patch: Record<string, boolean> = {};
  if (flags.isPinned !== undefined) patch.is_pinned = flags.isPinned;
  if (flags.isFeatured !== undefined) patch.is_featured = flags.isFeatured;
  const { error } = await sb.from('forum_posts').update(patch).eq('id', postId);
  if (error) throw new Error('操作失败，需要管理员权限');
  revalidatePath(`/forum/${postId}`);
}

// ── 删帖（作者或管理员）─────────────────────────────────────
export async function deleteForumPost(postId: string): Promise<void> {
  const supabase = await createClient();
  const sb = supabase as any;
  await requireUserId();
  const { error } = await sb.from('forum_posts').delete().eq('id', postId);
  if (error) throw new Error('删除失败，需要作者或管理员权限');
}
