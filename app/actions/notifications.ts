'use server';

// 通知读取 / 已读标记。所有读路径 try/catch 降级（表未建返回空/0），不抛错。
// 统一用 supabase.from(...) 方法调用（this 已绑定），切勿解构 const from = supabase.from。

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { NotificationType } from '@/lib/notifications';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  postId?: string;
  /** 帖子标题（论坛类通知） */
  postTitle?: string;
  actor: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

const LIMIT = 40;

/** 当前用户未读通知数。表缺失 / 未登录 → 0。 */
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;
  try {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('read', false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** 当前用户的通知列表（倒序）。两步查询补全 actor 资料与帖子标题，规避双 FK 嵌入歧义。 */
export async function getNotifications(): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const { data: rows } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, post_id, actor_id')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LIMIT);

    const list = rows ?? [];
    if (!list.length) return [];

    const actorIds = [...new Set(list.map((r) => r.actor_id))];
    const postIds = [...new Set(list.map((r) => r.post_id).filter((v): v is string => !!v))];

    const [{ data: actors }, { data: posts }] = await Promise.all([
      supabase.from('profiles').select('id, username, avatar_url').in('id', actorIds),
      postIds.length
        ? supabase.from('forum_posts').select('id, title').in('id', postIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);

    const aMap = new Map((actors ?? []).map((a) => [a.id, a]));
    const pMap = new Map((posts ?? []).map((p) => [p.id, p.title]));

    return list.map((r): NotificationItem => {
      const a = aMap.get(r.actor_id);
      return {
        id: r.id,
        type: r.type as NotificationItem['type'],
        read: r.read,
        createdAt: r.created_at,
        postId: r.post_id ?? undefined,
        postTitle: r.post_id ? pMap.get(r.post_id) : undefined,
        actor: {
          id: r.actor_id,
          username: a?.username?.trim() || '某用户',
          avatarUrl: a?.avatar_url ?? undefined,
        },
      };
    });
  } catch {
    return [];
  }
}

/** 将当前用户的所有未读标记为已读。 */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', user.id).eq('read', false);
    revalidatePath('/notifications');
    revalidatePath('/');
  } catch {
    // 忽略
  }
}
