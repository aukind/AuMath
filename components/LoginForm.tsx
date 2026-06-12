'use client';

import { useFormStatus } from 'react-dom';
import { Loader2, LogIn } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium py-2.5 transition-colors shadow-sm"
    >
      {pending
        ? <><Loader2 size={15} className="animate-spin" /> 登录中…</>
        : <><LogIn size={15} /> 登录</>
      }
    </button>
  );
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (formData: FormData) => Promise<any>;
  redirectTo?: string;
}

export default function LoginForm({ action, redirectTo }: Props) {
  return (
    <form action={action} className="space-y-4">
      {/* middleware 弹来登录时带的回跳地址，随表单提交给 login action */}
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="admin@example.com"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
