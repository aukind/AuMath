'use server';

// 竞赛日历 Server Actions。读公开（RLS public read）；写仅管理员（service-role + isAdminUser 双保险）。
// 写操作返回判别联合，绝不 throw（生产脱敏约定）。迁移 033 未跑时读返回空、写报错但不崩。

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';

export type CompetitionLevel = 'gaokao' | 'province' | 'national' | 'international' | 'mock' | 'other';

export interface Competition {
  id: string;
  name: string;
  short_name: string | null;
  level: CompetitionLevel;
  exam_date: string;                 // YYYY-MM-DD
  registration_deadline: string | null;
  location: string | null;
  url: string | null;
  description: string | null;
  is_featured: boolean;
}

const LEVELS: CompetitionLevel[] = ['gaokao', 'province', 'national', 'international', 'mock', 'other'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 即将到来的竞赛（考试日 ≥ 今天），按考试日升序。迁移未跑 / 出错时返回空数组。 */
export async function getUpcomingCompetitions(limit = 12): Promise<Competition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .gte('exam_date', todayISO())
    .order('exam_date', { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as Competition[];
}

/** 全部竞赛，按考试日升序（管理页 / 完整日历用）。 */
export async function getAllCompetitions(): Promise<Competition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .order('exam_date', { ascending: true });
  if (error) return [];
  return (data ?? []) as Competition[];
}

export interface CompetitionInput {
  id?: string;
  name: string;
  short_name?: string | null;
  level: CompetitionLevel;
  exam_date: string;
  registration_deadline?: string | null;
  location?: string | null;
  url?: string | null;
  description?: string | null;
  is_featured?: boolean;
}

export type MutationResult = { ok: true; id: string } | { ok: false; error: string };

const nullify = (v?: string | null) => { const s = (v ?? '').trim(); return s ? s : null; };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** 新建 / 编辑竞赛（管理员）。带 id 即更新，否则插入。 */
export async function upsertCompetition(input: CompetitionInput): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return { ok: false, error: '需要管理员权限' };

  const name = input.name.trim();
  if (!name) return { ok: false, error: '请填写竞赛名称' };
  if (!isDate(input.exam_date)) return { ok: false, error: '考试日期格式应为 YYYY-MM-DD' };
  if (input.registration_deadline && !isDate(input.registration_deadline)) {
    return { ok: false, error: '报名截止日期格式应为 YYYY-MM-DD' };
  }
  const level: CompetitionLevel = LEVELS.includes(input.level) ? input.level : 'other';

  let admin;
  try { admin = createAdminClient(); } catch {
    return { ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const row = {
    name,
    short_name: nullify(input.short_name),
    level,
    exam_date: input.exam_date,
    registration_deadline: nullify(input.registration_deadline),
    location: nullify(input.location),
    url: nullify(input.url),
    description: nullify(input.description),
    is_featured: !!input.is_featured,
    updated_at: new Date().toISOString(),
  };

  const q = input.id
    ? admin.from('competitions').update(row).eq('id', input.id).select('id').maybeSingle()
    : admin.from('competitions').insert(row).select('id').maybeSingle();
  const { data, error } = await q;
  if (error || !data) {
    return { ok: false, error: '保存失败（可能迁移 033 未执行）：' + (error?.message ?? '未知错误') };
  }
  return { ok: true, id: data.id };
}

export async function deleteCompetition(id: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return { ok: false, error: '需要管理员权限' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }
  const { error } = await admin.from('competitions').delete().eq('id', id);
  if (error) return { ok: false, error: '删除失败：' + error.message };
  return { ok: true, id };
}

// 种子：常见竞赛（2026 大致日期，管理员可改）。按名去重，重复执行只补缺。
const SEED: Omit<CompetitionInput, 'id'>[] = [
  { name: '2026 年普通高等学校招生全国统一考试', short_name: '高考', level: 'gaokao', exam_date: '2026-06-07', is_featured: true, description: '全国统一高考数学。' },
  { name: '全国高中数学联合竞赛', short_name: '高联', level: 'province', exam_date: '2026-09-13', registration_deadline: '2026-08-31', is_featured: true, description: '中国数学会主办，省级赛区，一试 + 二试（加试）。' },
  { name: '中国数学奥林匹克', short_name: 'CMO', level: 'national', exam_date: '2026-11-21', is_featured: true, description: '全国中学生数学冬令营，国家集训队选拔。' },
  { name: '国际数学奥林匹克', short_name: 'IMO', level: 'international', exam_date: '2026-07-10', is_featured: true, description: '中学生数学的世界最高级别赛事。' },
  { name: '中国女子数学奥林匹克', short_name: 'CGMO', level: 'national', exam_date: '2026-08-10', description: '面向女生的全国性数学竞赛。' },
  { name: '美国数学竞赛 AMC 12', short_name: 'AMC 12', level: 'international', exam_date: '2026-11-10', description: '通往 AIME / USAMO 的入门竞赛。' },
];

export async function seedCompetitions(): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return { ok: false, inserted: 0, error: '需要管理员权限' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { ok: false, inserted: 0, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const { data: existing, error: selErr } = await admin.from('competitions').select('name');
  if (selErr) return { ok: false, inserted: 0, error: '查询失败（可能迁移 033 未执行）：' + selErr.message };

  const have = new Set((existing ?? []).map(r => r.name));
  const toInsert = SEED.filter(s => !have.has(s.name)).map(s => ({
    name: s.name,
    short_name: s.short_name ?? null,
    level: s.level,
    exam_date: s.exam_date,
    registration_deadline: s.registration_deadline ?? null,
    location: s.location ?? null,
    url: s.url ?? null,
    description: s.description ?? null,
    is_featured: !!s.is_featured,
  }));
  if (!toInsert.length) return { ok: true, inserted: 0 };

  const { error } = await admin.from('competitions').insert(toInsert);
  if (error) return { ok: false, inserted: 0, error: '写入失败：' + error.message };
  return { ok: true, inserted: toInsert.length };
}
