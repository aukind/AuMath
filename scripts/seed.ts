// 在任何 import 之前解析 .env.local，不依赖 --env-file 标志
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
} catch {
  // .env.local 不存在时忽略，依赖系统环境变量
}

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('── 已加载的环境变量 ──');
console.log('NEXT_PUBLIC_SUPABASE_URL     :', url ? '✅ 已设置' : '❌ 缺失');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ 已设置' : '❌ 缺失');
console.log('SUPABASE_SERVICE_ROLE_KEY    :', key ? '✅ 已设置' : '❌ 缺失');
console.log('─────────────────────────────');

if (!url || !key) {
  console.error('\n❌ 缺少必要的环境变量，请在 .env.local 中补充：');
  if (!url)  console.error('   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co');
  if (!key)  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJ...（Supabase 控制台 → Project Settings → API → service_role → Reveal）');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const TOPIC: Record<string, string> = {};

const TOPICS_TO_SEED = [
  { name: '圆锥曲线', key: 'conic',      parent_key: null as string | null },
  { name: '导数与微分', key: 'derivative', parent_key: null },
  { name: '椭圆',     key: 'ellipse',    parent_key: 'conic' },
];

const Q1_ID = crypto.randomUUID();
const Q2_ID = crypto.randomUUID();

const q1 = {
  id: Q1_ID,
  content: `已知椭圆 $C:\\dfrac{x^2}{4}+y^2=1$，$A$、$B$ 是椭圆上两点，线段 $AB$ 的中点为 $M$，且 $\\overrightarrow{OM}\\cdot\\overrightarrow{AB}=0$（$O$ 为原点）。

**(1)** 求中点 $M$ 的坐标（用斜率 $k$ 表示）；

**(2)** 求 $\\triangle OAB$ 面积的最大值。`,
  answer: `(1) $M\\!\\left(-\\dfrac{4k}{4k^2+1},\\,\\dfrac{1}{4k^2+1}\\right)$；

(2) $S_{\\max}=\\dfrac{\\sqrt{2}}{2}$，当 $k=\\pm\\dfrac{1}{2}$ 时取得。`,
  analysis: `**第(1)步：中点弦斜率关系**

设 $A(x_1,y_1)$，$B(x_2,y_2)$ 均在椭圆上，两式相减：
$$\\frac{x_1^2-x_2^2}{4}+(y_1^2-y_2^2)=0 \\Rightarrow \\frac{x_1+x_2}{4}+(y_1+y_2)\\cdot k=0$$

设中点 $M=(m,n)$，由上式得 $k=-\\dfrac{m}{4n}$。

又 $\\overrightarrow{OM}\\perp\\overrightarrow{AB}$ 给出 $\\dfrac{n}{m}=-\\dfrac{1}{k}$，联立解得：
$$m=-\\frac{4k}{4k^2+1},\\quad n=\\frac{1}{4k^2+1}$$

**第(2)步：面积最大值**

$$|OM|^2=m^2+n^2=\\frac{16k^2+1}{(4k^2+1)^2}$$

利用弦长公式，令 $t=k^2>0$，面积化为：
$$S^2=\\frac{1}{2}\\cdot\\frac{1}{\\frac{1}{4t}+4t+2}$$

由均值不等式 $\\dfrac{1}{4t}+4t\\geq 2$，等号在 $t=\\dfrac{1}{4}$（$k=\\pm\\dfrac{1}{2}$）时成立，故 $S_{\\max}=\\dfrac{\\sqrt{2}}{2}$。`,
  question_type: 'calculation' as const,
  difficulty: 4 as const,
  year: 2024,
  source: '2024届全国高三压轴模拟',
  status: 'published' as const,
  variations: [
    {
      id: crypto.randomUUID(),
      content: `将椭圆改为 $\\dfrac{x^2}{a^2}+y^2=1$（$a>1$），其余条件不变，用 $a$ 表示 $\\triangle OAB$ 面积的最大值。`,
      answer: `$S_{\\max}=\\dfrac{a}{2}$，当 $k=\\pm\\dfrac{1}{a}$ 时取到。`,
      difficulty: 5 as const,
      hint: '将系数 4 替换为 $a^2$，重新对均值不等式取等条件。',
    },
  ],
  metadata: {
    exam_number: '第21题', score: 12, time_limit_minutes: 20,
    tags: ['椭圆', '中点弦', '面积最值', 'OM⊥AB'],
    related_theorems: ['椭圆参数方程', '均值不等式', '弦长公式'],
    common_mistakes: ['消元时符号出错', '漏讨论斜率不存在的情形'],
  },
};

const q2 = {
  id: Q2_ID,
  content: `设函数 $f(x)=e^x-ex$（$e$ 为自然对数的底数）。

**(1)** 证明：对一切实数 $x$，有 $e^x\\geq ex$；

**(2)** 利用 (1) 的结论，证明：对任意正整数 $n$，有
$$\\left(1+\\frac{1}{n}\\right)^n < e < \\left(1+\\frac{1}{n}\\right)^{n+1}$$`,
  answer: `两个不等式均通过对 $f(x)=e^x-ex$ 的极值分析及代入特殊值严格证明，详见解析。`,
  analysis: `**第(1)步：证明 $e^x\\geq ex$**

$f(x)=e^x-ex$，$f'(x)=e^x-e=0$ 得唯一驻点 $x=1$。

- $x<1$：$f'<0$，$f$ 单调递减；$x>1$：$f'>0$，$f$ 单调递增。

故 $x=1$ 为全局最小值点，$f(1)=0$，因此 $e^x\\geq ex$。$\\blacksquare$

**第(2)步：左侧不等式 $\\left(1+\\dfrac{1}{n}\\right)^n<e$**

令 $x=\\dfrac{n}{n+1}\\neq 1$，由(1)严格不等式 $e^x>ex$：
$$e^{\\frac{n}{n+1}}>e\\cdot\\frac{n}{n+1}$$

两边取 $(n+1)$ 次方后整理得 $\\left(1+\\dfrac{1}{n}\\right)^n<e$。$\\checkmark$

**第(2)步：右侧不等式 $e<\\left(1+\\dfrac{1}{n}\\right)^{n+1}$**

令 $x=\\dfrac{n+1}{n}>1$，由(1)严格不等式：
$$e^{\\frac{n+1}{n}}>e\\cdot\\frac{n+1}{n}$$

两边取 $n$ 次方后整理得 $\\left(1+\\dfrac{1}{n}\\right)^{n+1}>e$。$\\blacksquare$`,
  question_type: 'proof' as const,
  difficulty: 5 as const,
  year: 2023,
  source: '2023年全国乙卷压轴改编',
  status: 'published' as const,
  variations: [],
  metadata: {
    exam_number: '第22题', score: 12, time_limit_minutes: 22,
    tags: ['导数', '不等式证明', '自然对数', '压轴'],
    related_theorems: ['导数与极值', '单调性定理', '指数函数性质'],
    common_mistakes: ['不等号方向因 x 取值范围出错', '取幂次时忘记验证底数为正'],
  },
};

async function seed() {
  console.log('\n🌱 开始写入题目数据…');

  // ── 1. 清空旧数据，保持幂等 ──────────────────────────────────
  await supabase.from('question_topic_relations').delete().neq('question_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('🧹 已清空旧 questions / relations');

  // ── 2. 写入 topics（若表为空则插入，否则跳过）───────────────
  const { count: topicCount } = await supabase.from('topics').select('*', { count: 'exact', head: true });

  // 先把已有 topics 映射好
  const { data: existingTopics } = await supabase.from('topics').select('id, name, slug');
  for (const t of existingTopics ?? []) {
    const found = TOPICS_TO_SEED.find(ts => ts.key === t.slug || t.name === ts.name || (t.name as string).includes(ts.name));
    if (found) TOPIC[found.key] = t.id;
  }

  // 对缺失的 topic 补充插入（按父→子顺序）
  for (const t of TOPICS_TO_SEED) {
    if (TOPIC[t.key]) continue; // 已存在

    const parentId = t.parent_key ? TOPIC[t.parent_key] : undefined;
    const { data, error } = await supabase
      .from('topics')
      .insert({ name: t.name, slug: t.key, ...(parentId ? { parent_id: parentId } : {}) })
      .select('id')
      .single();
    if (error) {
      console.error(`❌ topic "${t.name}" 插入失败:`, error.message);
      process.exit(1);
    }
    TOPIC[t.key] = data.id;
    console.log(`✅ topic "${t.name}" 写入成功`);
  }
  console.log('topics:', JSON.stringify(TOPIC));

  // 题目1
  const { error: e1 } = await supabase.from('questions').insert(q1);
  if (e1) { console.error('❌ 题目1插入失败:', e1.message); process.exit(1); }
  console.log('✅ 题目1（椭圆面积最值）写入成功');

  if (TOPIC.conic) {
    const rel1 = [{ question_id: Q1_ID, topic_id: TOPIC.conic }];
    if (TOPIC.ellipse) rel1.push({ question_id: Q1_ID, topic_id: TOPIC.ellipse });
    const { error: e1r } = await supabase.from('question_topic_relations').insert(rel1);
    if (e1r) { console.error('❌ 题目1关联失败:', e1r.message); process.exit(1); }
    console.log('   └─ 关联知识点：圆锥曲线、椭圆');
  }

  // 题目2
  const { error: e2 } = await supabase.from('questions').insert(q2);
  if (e2) { console.error('❌ 题目2插入失败:', e2.message); process.exit(1); }
  console.log('✅ 题目2（导数证不等式）写入成功');

  if (TOPIC.derivative) {
    const { error: e2r } = await supabase.from('question_topic_relations').insert([
      { question_id: Q2_ID, topic_id: TOPIC.derivative },
    ]);
    if (e2r) { console.error('❌ 题目2关联失败:', e2r.message); process.exit(1); }
    console.log('   └─ 关联知识点：导数与微分');
  }

  console.log('\n🎉 Seed 完成！刷新页面即可看到数据。');
}

seed();
