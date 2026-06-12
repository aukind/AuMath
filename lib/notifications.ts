// 通知埋点工具（服务端普通模块，非 Server Action —— 避免被当作可被客户端直接调用的 RPC）。
// 由各写操作（回复/点赞/关注）调用，best-effort：失败绝不影响主操作。
//
// RLS 要求 actor_id = auth.uid()，因此必须用「当前用户的 supabase 客户端」插入；
// 调用方把自己已有的 sb（来自 createClient + session）传进来即可。

import type { SupabaseServerClient } from '@/lib/supabase/server';

export type NotificationType = 'reply_post' | 'reply_comment' | 'like' | 'follow';

export async function notify(
  sb: SupabaseServerClient,
  params: { recipientId?: string | null; actorId: string; type: NotificationType; postId?: string | null },
): Promise<void> {
  const { recipientId, actorId, type, postId } = params;
  // 不给自己发通知；收件人缺失则跳过
  if (!recipientId || recipientId === actorId) return;
  try {
    await sb.from('notifications').insert({
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      post_id: postId ?? null,
    });
  } catch {
    // 通知表未建 / 异常 → 静默忽略，主操作照常成功
  }
}
