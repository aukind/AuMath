import { BookOpen } from 'lucide-react';
import { login } from '@/app/actions/auth';
import LoginForm from '@/components/LoginForm';
import ThemeToggle from '@/components/ThemeToggle';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const { error, redirectTo } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-2.5 mb-8">
        <BookOpen size={22} className="text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-base tracking-tight">
          高阶数学题库
        </span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-8 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">登录</h1>
          <p className="text-sm text-zinc-400">使用你的账号继续</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{decodeURIComponent(error)}</p>
          </div>
        )}

        <LoginForm action={login} redirectTo={redirectTo} />
      </div>

      <p className="mt-6 text-xs text-zinc-400">
        还没有账号？{' '}
        <a href="/signup" className="text-blue-600 dark:text-blue-400 hover:underline">
          免费注册
        </a>
      </p>
    </div>
  );
}
