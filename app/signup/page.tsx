import { BookOpen, CheckCircle2 } from 'lucide-react';
import { signup } from '@/app/actions/auth';
import SignupForm from '@/components/SignupForm';
import ThemeToggle from '@/components/ThemeToggle';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

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
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">创建账号</h1>
          <p className="text-sm text-zinc-400">注册后可建立属于自己的私人题库</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{decodeURIComponent(error)}</p>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">注册成功！</p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              我们已向你的邮箱发送了验证邮件，确认后即可登录。
            </p>
            <a
              href="/login"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              前往登录 →
            </a>
          </div>
        ) : (
          <SignupForm action={signup} />
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-400">
        已有账号？{' '}
        <a href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
          立即登录
        </a>
      </p>
    </div>
  );
}
