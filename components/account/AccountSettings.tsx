'use client';

// 账号设置：头像 / 用户名 / 密码。三块独立保存，各自乐观反馈。
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { changePassword, updateUsername, uploadAvatar, type MyAccount } from '@/app/actions/account';
import AvatarCropper from './AvatarCropper';

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export default function AccountSettings({ account }: { account: MyAccount }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [avatarUrl, setAvatarUrl] = useState(account.avatarUrl);
  const [avatarPending, startAvatar] = useTransition();
  const [cropFile, setCropFile] = useState<File | null>(null); // 待裁剪的原图，非空即弹裁剪框

  const [username, setUsername] = useState(account.username);
  const [namePending, startName] = useTransition();

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwPending, startPw] = useTransition();

  // 选图后不直接上传，先弹裁剪框让用户框定方形区域。
  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  // 裁剪确定：上传裁好的方形 JPEG。
  function onCropped(blob: Blob) {
    const fd = new FormData();
    fd.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    startAvatar(async () => {
      try {
        const { url } = await uploadAvatar(fd);
        setAvatarUrl(url);
        setCropFile(null);
        toast.success('头像已更新');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '上传失败');
      }
    });
  }

  function saveName() {
    if (username.trim() === account.username) return;
    startName(async () => {
      try {
        await updateUsername(username);
        toast.success('用户名已更新');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '更新失败');
      }
    });
  }

  function savePassword() {
    if (pw1.length < 6) return toast.error('密码至少 6 位');
    if (pw1 !== pw2) return toast.error('两次输入的密码不一致');
    startPw(async () => {
      try {
        await changePassword(pw1);
        setPw1('');
        setPw2('');
        toast.success('密码已修改');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '修改失败');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 头像 */}
      <Section title="头像">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarPending}
            className="relative h-20 w-20 overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700"
            aria-label="更换头像"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-indigo-100 text-2xl font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                {initials(username)}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 py-0.5 text-[10px] text-white">
              {avatarPending ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
            </span>
          </button>
          <div className="text-xs text-zinc-500">
            点击头像上传新图片（≤ 4MB）。<br />新头像会同步显示在论坛发言里。
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
        </div>
      </Section>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          busy={avatarPending}
          onCancel={() => setCropFile(null)}
          onConfirm={onCropped}
        />
      )}

      {/* 用户名 */}
      <Section title="用户名">
        <div className="flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={namePending || username.trim() === account.username || !username.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </Section>

      {/* 密码 */}
      <Section title="修改密码">
        <div className="space-y-2">
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="新密码（至少 6 位）"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="再次输入新密码"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={savePassword}
            disabled={pwPending || !pw1 || !pw2}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pwPending ? '提交中…' : '修改密码'}
          </button>
        </div>
      </Section>

      {/* 账号信息 */}
      <Section title="账号信息">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-400">邮箱</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{account.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-400">角色</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{account.role === 'admin' ? '管理员' : '普通用户'}</dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
      {children}
    </section>
  );
}
