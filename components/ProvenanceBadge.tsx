'use client';

// 题源溯源徽章：官方原题 / 社区搬运 / 改编变式 + 已核验。所有人可见的信任信号。
// 管理员额外可点笔形按钮，在内联弹层里覆盖 origin（自动/官方/社区/改编）与切换核验，
// 走 setQuestionProvenance 乐观更新。非管理员且无任何信号时渲染 null（不占位）。

import { useState, useTransition } from 'react';
import { ShieldCheck, Users, Wand2, BadgeCheck, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getProvenance, ORIGIN_META, type Origin } from '@/lib/questions/provenance';
import { setQuestionProvenance } from '@/app/actions/provenance';
import type { QuestionMetadata } from '@/types/database';

const ORIGIN_ICON: Record<Origin, typeof ShieldCheck> = {
  official: ShieldCheck, community: Users, derived: Wand2,
};

interface Props {
  question: { id: string; metadata?: QuestionMetadata | null; paper_id?: string | null };
  isAdmin?: boolean;
}

export default function ProvenanceBadge({ question, isAdmin = false }: Props) {
  const derived = getProvenance(question);
  // 乐观本地态：origin（null=自动推断）、explicitOrigin（是否手动覆盖）、verified。
  const [origin, setOrigin] = useState<Origin | null>(derived.origin);
  const [explicit, setExplicit] = useState(derived.explicit);
  const [verified, setVerified] = useState(derived.verified);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(patch: { origin?: Origin | null; verified?: boolean }) {
    // 乐观更新
    const prev = { origin, explicit, verified };
    if ('origin' in patch) {
      setExplicit(patch.origin != null);
      setOrigin(patch.origin ?? getProvenance(question).origin); // 清除→回退推断值
    }
    if (typeof patch.verified === 'boolean') setVerified(patch.verified);

    startTransition(async () => {
      const r = await setQuestionProvenance(question.id, patch);
      if (!r.ok) {
        setOrigin(prev.origin); setExplicit(prev.explicit); setVerified(prev.verified);
        toast.error(r.error);
      }
    });
  }

  const OriginIcon = origin ? ORIGIN_ICON[origin] : null;
  const nothingToShow = !origin && !verified && !isAdmin;
  if (nothingToShow) return null;

  return (
    <span className="relative inline-flex shrink-0 items-center gap-1">
      {origin && OriginIcon && (
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${ORIGIN_META[origin].cls}`}
          title={explicit ? '管理员已标注' : '按题源信号自动推断'}
        >
          <OriginIcon size={11} /> {ORIGIN_META[origin].label}
        </span>
      )}
      {verified && (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          title="已经人工核验"
        >
          <BadgeCheck size={11} /> 已核验
        </span>
      )}

      {isAdmin && (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            title="标注题源"
            className="rounded p-0.5 text-zinc-300 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Pencil size={11} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">题源</p>
                {([['auto', '自动推断'], ['official', '官方原题'], ['community', '社区搬运'], ['derived', '改编变式']] as const).map(([val, label]) => {
                  const isAuto = val === 'auto';
                  const active = isAuto ? !explicit : explicit && origin === val;
                  return (
                    <button
                      key={val}
                      disabled={pending}
                      onClick={() => apply({ origin: isAuto ? null : (val as Origin) })}
                      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${active ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'}`}
                    >
                      {active ? <Check size={12} /> : <span className="w-3" />} {label}
                    </button>
                  );
                })}
                <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                <button
                  disabled={pending}
                  onClick={() => apply({ verified: !verified })}
                  className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${verified ? 'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60'}`}
                >
                  <BadgeCheck size={12} /> {verified ? '取消核验' : '标为已核验'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </span>
  );
}
