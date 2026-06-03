'use client';

// 论坛帖子「详情态」—— 拦截路由 @modal 内挂载的共享元素弹窗。
// 与列表卡片 MotionPostCard 共用同一组 layoutId：卡片整体放大 morph 成居中模态，
// 头像/标题/作者日期元素级位移。支持 iOS 式下拉阻尼退场（drag handle 触发，正文独立滚动）。
//
// 退场机制：本地 open（初值 true）→ dismiss 置 false → AnimatePresence 播完退场/回 morph
// 后 onExitComplete 才 router.back()，避免 slot 立即卸载导致硬 pop。
//
// KaTeX 防御：morph 期间只渲染轻量头部；morph 稳定（onLayoutAnimationComplete）后再
// 挂载 MathContent 正文与评论，且正文容器用 layout="position" 不缩放 SVG。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion';
import { useLenis } from 'lenis/react';
import { Eye, MessageSquare, Pin, X } from 'lucide-react';
import type { ForumComment, ForumPost, SessionUser } from '@/types/forum';
import { incrementForumView } from '@/app/actions/forum';
import MathContent from './MathContent';
import CommentSection from './CommentSection';
import PostActions from './PostActions';
import { ReplyProvider } from './ReplyContext';
import { PostAvatar } from './MotionPostCard';
import {
  cardLayoutId,
  avatarLayoutId,
  titleLayoutId,
  metaLayoutId,
  SHARED_SPRING,
} from '@/components/motion/SharedCardProps';

const DISMISS_OFFSET = 120; // px 下拉位移阈值
const DISMISS_VELOCITY = 800; // px/s 快速甩动阈值

interface PostDetailViewProps {
  postId: string;
  currentUser: SessionUser;
  initialPost: ForumPost;
  initialComments: ForumComment[];
}

export default function PostDetailView({
  postId,
  currentUser,
  initialPost,
  initialComments,
}: PostDetailViewProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const lenis = useLenis();
  const post = initialPost;

  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState<boolean>(!!reduce); // 减弱动效：正文即时显示
  const dismiss = useCallback(() => setOpen(false), []);

  // 下拉手势：y 位移（drag 经 header handle 触发；正文区独立滚动，互不打架）
  const y = useMotionValue(0);
  const dragControls = useDragControls();
  const startDrag = (e: React.PointerEvent) => dragControls.start(e);
  const onDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) dismiss();
    // 未达阈值由 dragSnapToOrigin 弹回原位
  };

  // 浏览量 +1（与全页 ForumThread 行为一致）
  useEffect(() => {
    incrementForumView(postId).catch(() => {});
  }, [postId]);

  // 锁背景滚动 + 停 Lenis + Esc 退场
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      lenis?.start();
      window.removeEventListener('keydown', onKey);
    };
  }, [lenis, dismiss]);

  // 兜底：onLayoutAnimationComplete 万一被跳过，~420ms 后强制显示正文
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (reduce) return;
    readyTimer.current = setTimeout(() => setReady(true), 420);
    return () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
    };
  }, [reduce]);

  const dateText = new Date(post.createdAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return (
    <AnimatePresence onExitComplete={() => router.back()}>
      {open && (
        <motion.div key="forum-modal" data-app-modal className="fixed inset-0 z-[100]">
          {/* 遮罩：blur 背景 + 渐隐渐显（仅此层做 opacity 退场，面板保持不透明以免回 morph 出残影） */}
          <motion.div
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={dismiss}
          />

          {/* 居中容器 */}
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden p-3 sm:p-6 sm:pt-[6vh]">
            <motion.div
              layoutId={cardLayoutId('forum', postId)}
              transition={reduce ? { duration: 0.2 } : SHARED_SPRING}
              onLayoutAnimationComplete={() => setReady(true)}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              dragSnapToOrigin
              style={{ y }}
              onDragEnd={onDragEnd}
              className="pointer-events-auto relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* 头部 = 下拉抓取区（非滚动）。pill + 头像/作者日期/标题（带子 layoutId） */}
              <div
                onPointerDown={startDrag}
                className="shrink-0 cursor-grab touch-none select-none border-b border-zinc-100 px-5 pb-3 pt-3 active:cursor-grabbing dark:border-zinc-800"
              >
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="flex items-start gap-3">
                  <motion.div layoutId={avatarLayoutId('forum', postId)}>
                    <PostAvatar name={post.author.username} url={post.author.avatarUrl} role={post.author.role} />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <motion.div
                      layoutId={metaLayoutId('forum', postId)}
                      className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500"
                    >
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">{post.author.username}</span>
                      {post.author.role === 'admin' && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                          管理员
                        </span>
                      )}
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <span className="tabular-nums">{dateText}</span>
                    </motion.div>
                    <motion.h1
                      layoutId={titleLayoutId('forum', postId)}
                      className="mt-1 text-lg font-bold leading-snug text-zinc-900 dark:text-zinc-50"
                    >
                      {post.tags.includes('公告') && <Pin size={15} className="mr-1.5 inline-block shrink-0 text-amber-500" />}
                      {post.title}
                    </motion.h1>
                    {post.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {post.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={dismiss}
                    aria-label="关闭"
                    className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* 正文 + 评论（独立滚动；data-lenis-prevent 让内滚不被 Lenis 抢） */}
              <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                {ready ? (
                  <ReplyProvider>
                    {/* layout="position"：morph 后若有重排只移动不缩放，护住 KaTeX SVG */}
                    <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                      <div className="text-[15px]">
                        <MathContent content={post.content} />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
                        <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" />{post.viewCount}</span>
                        <span className="inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />{post.commentCount}</span>
                        <PostActions
                          postId={postId}
                          initialUpvotes={post.upvotes}
                          initialUpvotedByMe={!!post.upvotedByMe}
                          initialFavoritedByMe={!!post.favoritedByMe}
                          canInteract={!!currentUser}
                        />
                        {/* 弹窗 URL 已是 /forum/[id]（被 @modal 拦截）；用原生 <a> 强制硬导航，
                            整页加载绕过拦截器 → 渲染全页详情（<Link> 软导航到同 URL 是 no-op）。 */}
                        <a href={`/forum/${postId}`} className="ml-auto text-indigo-600 hover:underline dark:text-indigo-400">
                          独立页面打开 →
                        </a>
                      </div>

                      <div className="mt-2">
                        <CommentSection postId={postId} currentUser={currentUser} initialComments={initialComments} />
                      </div>
                    </motion.div>
                  </ReplyProvider>
                ) : (
                  <div className="space-y-3 py-8">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
