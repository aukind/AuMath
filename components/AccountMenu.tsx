'use client';

// 顶栏「账号」下拉菜单。把原先散落的「账号」「退出」（以及管理员的「控制台」）
// 收拢进一个菜单：点击账号即可查看个人中心，退出也归入此处。
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UserSquare, Settings, LayoutDashboard, LogOut, ChevronDown } from 'lucide-react';
import { logout } from '@/app/actions/auth';

interface AccountMenuProps {
  username: string;
  userId: string;
  isAdmin?: boolean;
  avatarUrl?: string;
}

/** 头像：有图显示图，否则用户名首字母的渐变圆。 */
function Avatar({ name, url, size = 24 }: { name: string; url?: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AccountMenu({ username, userId, isAdmin = false, avatarUrl }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部 / 按 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemCls =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="账号菜单"
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-0.5 pl-0.5 pr-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Avatar name={username} url={avatarUrl} size={24} />
        <span className="hidden max-w-[7rem] truncate sm:inline">{username}</span>
        <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {/* 头部：头像 + 用户名 */}
          <div className="flex items-center gap-2.5 border-b border-zinc-100 px-2.5 pb-2 pt-1.5 dark:border-zinc-800">
            <Avatar name={username} url={avatarUrl} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{username}</p>
              <p className="text-[11px] text-zinc-400">{isAdmin ? '管理员' : '社区成员'}</p>
            </div>
          </div>

          <div className="mt-1 space-y-0.5">
            <Link href={`/u/${userId}`} role="menuitem" onClick={() => setOpen(false)} className={itemCls}>
              <UserSquare size={15} className="text-zinc-400" /> 我的主页
            </Link>
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className={itemCls}>
              <Settings size={15} className="text-zinc-400" /> 账号中心
            </Link>
            {isAdmin && (
              <Link href="/dashboard" role="menuitem" onClick={() => setOpen(false)} className={itemCls}>
                <LayoutDashboard size={15} className="text-zinc-400" /> 控制台
              </Link>
            )}
          </div>

          {/* 退出 */}
          <div className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <form action={logout}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <LogOut size={15} /> 退出登录
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
