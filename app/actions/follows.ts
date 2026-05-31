'use server';

// 用户关注关系 Server Actions。
// user_follows 表见 supabase/migrations/011_follows.sql（需手动 Run）。表未建/异常时读路径降级，
// 写路径(toggleFollow)抛错由调用方 toast 提示并回滚乐观态。
//
// 注意：一律用 `supabase.from(...)` 方法调用（this 已绑定）。切勿 `const from = supabase.from`
// 再调用——会丢失 this 抛 "reading 'rest'"。详见 user-profile.ts 的教训。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications';

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface FollowedUser {
  id: string;
  username: string;
  avatarUrl?: string;
  role: 'admin' | 'user';
  followedAt: string;
}

export interface ToggleFollowResult {
  ok: boolean;
  /** 切换后的关注态（ok 时有效） */
  following?: boolean;
  /** 失败时的可读原因 */
  error?: string;
}

/**
 * 关注 / 取消关注（按当前状态切换）。
 *
 * 关键：**不抛错，改为返回结果对象**。Next 在生产会把 Server Action 抛出的错误脱敏成
 * 「An error occurred in the Server Components render…」的通用文案，UI 拿不到真实原因；
 * 而返回值不会被脱敏，因此把失败原因放进 result.error 才能给出可读提示。
 */
export async function toggleFollow(targetId: string): Promise<ToggleFollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };
  if (user.id === targetId) return { ok: false, error: '不能关注自己' };

  try {
    const sb = supabase as any;
    const { data: existing } = await sb
      .from('user_follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .maybeSingle();

    if (existing) {
      const { error } = await sb
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetId);
      if (error) throw error;
    } else {
      const { error } = await sb
        .from('user_follows')
        .insert({ follower_id: user.id, following_id: targetId });
      if (error) throw error;
      // 新关注 → 通知被关注者
      await notify(sb, { recipientId: targetId, actorId: user.id, type: 'follow' });
    }

    revalidatePath(`/u/${targetId}`);
    revalidatePath('/following');
    return { ok: true, following: !existing };
  } catch (e: any) {
    // 表未建（迁移 011 未应用）会得到 PGRST205；给出明确可读提示而非通用报错。
    const missingTable =
      e?.code === 'PGRST205' || (typeof e?.message === 'string' && e.message.includes('user_follows'));
    return {
      ok: false,
      error: missingTable ? '关注功能尚未启用，请稍后再试' : '操作失败，请稍后再试',
    };
  }
}

/** 当前登录用户是否已关注 targetId。未登录 / 自己 / 表缺失 → false。 */
export async function isFollowing(targetId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === targetId) return false;
  try {
    const sb = supabase as any;
    const { data } = await sb
      .from('user_follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** 某用户的关注数（following）与粉丝数（followers）。表缺失 → 0。 */
export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const supabase = await createClient();
  const sb = supabase as any;

  const countBy = async (column: 'follower_id' | 'following_id'): Promise<number> => {
    try {
      const { count } = await sb
        .from('user_follows')
        .select(column, { count: 'exact', head: true })
        .eq(column, userId);
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [following, followers] = await Promise.all([
    countBy('follower_id'), // 我作为 follower 的边数 = 我关注了多少人
    countBy('following_id'), // 我作为 following 的边数 = 多少人关注我
  ]);
  return { followers, following };
}

/** 当前登录用户「我的关注」列表（按关注时间倒序）。两步查询规避双 FK 嵌入歧义。 */
export async function getMyFollowing(): Promise<FollowedUser[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const sb = supabase as any;
    const { data: edges } = await sb
      .from('user_follows')
      .select('following_id, created_at')
      .eq('follower_id', user.id)
      .order('created_at', { ascending: false });

    const rows: { following_id: string; created_at: string }[] = edges ?? [];
    if (!rows.length) return [];

    const ids = rows.map((r) => r.following_id);
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, username, avatar_url, role')
      .in('id', ids);

    const pMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

    return rows
      .map((r): FollowedUser | null => {
        const p = pMap.get(r.following_id);
        if (!p) return null;
        return {
          id: p.id,
          username: p.username?.trim() || '用户',
          avatarUrl: p.avatar_url ?? undefined,
          role: p.role === 'admin' ? 'admin' : 'user',
          followedAt: r.created_at,
        };
      })
      .filter((x): x is FollowedUser => x !== null);
  } catch {
    return [];
  }
}
