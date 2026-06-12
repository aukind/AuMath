// 高考数学知识点受控词表（章节 → 细分考点，两级）。
//
// 这是「自动知识点标注」的唯一词汇来源：Gemini 提取/分类时只允许从这里选名字，
// 自由发挥的名字一律丢弃 —— 否则同义词（"数列求和" vs "求和"）会把知识星图刷成垃圾场。
//
// 名字刻意与库里已有 topics 对齐（椭圆/双曲线/抛物线/直线与圆/圆锥曲线 来自 001 种子，
// 函数与导数/三角/立体几何/概率统计 来自 005 种子）：linker 按 name 复用已有节点，
// 只为缺失的考点建新行，绝不重建/改挂用户手搭的树。
// 新建节点的 slug 统一带 kp- 前缀，避免与历史 slug（ellipse 等）撞唯一约束。

export interface KnowledgePointDef {
  name: string;
  slug: string;
}

export interface KnowledgeChapterDef {
  name: string;
  slug: string;
  points: KnowledgePointDef[];
}

export const KP_TAXONOMY: KnowledgeChapterDef[] = [
  {
    name: '集合与逻辑', slug: 'kp-set-logic',
    points: [
      { name: '集合及其运算',       slug: 'kp-sets-operations' },
      { name: '充分条件与必要条件', slug: 'kp-sufficient-necessary' },
      { name: '全称量词与存在量词', slug: 'kp-quantifiers' },
    ],
  },
  {
    name: '不等式', slug: 'kp-inequalities',
    points: [
      { name: '基本不等式',     slug: 'kp-amgm-inequality' },
      { name: '一元二次不等式', slug: 'kp-quadratic-inequality' },
      { name: '绝对值不等式',   slug: 'kp-absolute-inequality' },
      { name: '不等式的证明',   slug: 'kp-inequality-proof' },
      { name: '线性规划',       slug: 'kp-linear-programming' },
    ],
  },
  {
    name: '函数与导数', slug: 'kp-functions-derivatives',
    points: [
      { name: '函数的概念与表示',     slug: 'kp-function-concept' },
      { name: '函数的单调性与奇偶性', slug: 'kp-function-monotonicity-parity' },
      { name: '指数函数与对数函数',   slug: 'kp-exp-log-functions' },
      { name: '二次函数与幂函数',     slug: 'kp-quadratic-power-functions' },
      { name: '抽象函数',             slug: 'kp-abstract-functions' },
      { name: '函数图象',             slug: 'kp-function-graphs' },
      { name: '函数零点',             slug: 'kp-function-zeros' },
      { name: '导数的几何意义与切线', slug: 'kp-derivative-tangent' },
      { name: '利用导数研究单调性',   slug: 'kp-derivative-monotonicity' },
      { name: '极值与最值',           slug: 'kp-extrema-max-min' },
      { name: '导数与不等式证明',     slug: 'kp-derivative-inequality' },
      { name: '恒成立与存在性问题',   slug: 'kp-holds-exists' },
      { name: '极值点偏移',           slug: 'kp-extreme-point-offset' },
      { name: '隐零点',               slug: 'kp-hidden-zeros' },
    ],
  },
  {
    name: '三角', slug: 'kp-trigonometry',
    points: [
      { name: '三角函数定义与诱导公式', slug: 'kp-trig-definition' },
      { name: '三角恒等变换',           slug: 'kp-trig-identities' },
      { name: '三角函数图象与性质',     slug: 'kp-trig-graphs' },
      { name: '正弦定理与余弦定理',     slug: 'kp-sine-cosine-rule' },
      { name: '解三角形综合',           slug: 'kp-triangle-solving' },
    ],
  },
  {
    name: '平面向量', slug: 'kp-plane-vectors',
    points: [
      { name: '向量的线性运算', slug: 'kp-vector-linear-ops' },
      { name: '向量的数量积',   slug: 'kp-vector-dot-product' },
      { name: '向量的坐标运算', slug: 'kp-vector-coordinates' },
    ],
  },
  {
    name: '复数', slug: 'kp-complex-numbers',
    points: [
      { name: '复数的运算',     slug: 'kp-complex-operations' },
      { name: '复数的几何意义', slug: 'kp-complex-geometry' },
    ],
  },
  {
    name: '数列', slug: 'kp-sequences',
    points: [
      { name: '等差数列',     slug: 'kp-arithmetic-sequence' },
      { name: '等比数列',     slug: 'kp-geometric-sequence' },
      { name: '数列通项公式', slug: 'kp-sequence-general-term' },
      { name: '数列求和',     slug: 'kp-sequence-summation' },
      { name: '数列递推',     slug: 'kp-sequence-recurrence' },
      { name: '数列与不等式', slug: 'kp-sequence-inequality' },
      { name: '数学归纳法',   slug: 'kp-mathematical-induction' },
    ],
  },
  {
    name: '立体几何', slug: 'kp-solid-geometry',
    points: [
      { name: '空间几何体与三视图', slug: 'kp-solids-three-views' },
      { name: '表面积与体积',       slug: 'kp-surface-volume' },
      { name: '线面平行与垂直',     slug: 'kp-line-plane-relations' },
      { name: '空间向量与空间角',   slug: 'kp-space-vector-angles' },
      { name: '空间距离',           slug: 'kp-space-distance' },
      { name: '外接球与内切球',     slug: 'kp-spheres' },
      { name: '截面与动态问题',     slug: 'kp-cross-sections' },
    ],
  },
  {
    name: '解析几何', slug: 'kp-analytic-geometry',
    points: [
      { name: '直线与圆',         slug: 'kp-line-and-circle' },
      { name: '椭圆',             slug: 'kp-ellipse' },
      { name: '双曲线',           slug: 'kp-hyperbola' },
      { name: '抛物线',           slug: 'kp-parabola' },
      { name: '离心率',           slug: 'kp-eccentricity' },
      { name: '直线与圆锥曲线',   slug: 'kp-line-conic' },
      { name: '弦长与面积',       slug: 'kp-chord-area' },
      { name: '定点与定值问题',   slug: 'kp-fixed-point-value' },
      { name: '轨迹方程',         slug: 'kp-locus-equations' },
    ],
  },
  {
    name: '概率统计', slug: 'kp-probability-statistics',
    points: [
      { name: '排列组合',               slug: 'kp-permutations-combinations' },
      { name: '二项式定理',             slug: 'kp-binomial-theorem' },
      { name: '古典概型与几何概型',     slug: 'kp-classical-probability' },
      { name: '条件概率与全概率公式',   slug: 'kp-conditional-probability' },
      { name: '离散型随机变量与分布列', slug: 'kp-discrete-random-variables' },
      { name: '二项分布与超几何分布',   slug: 'kp-binomial-distribution' },
      { name: '正态分布',               slug: 'kp-normal-distribution' },
      { name: '期望与方差',             slug: 'kp-expectation-variance' },
      { name: '统计与回归分析',         slug: 'kp-statistics-regression' },
      { name: '独立性检验',             slug: 'kp-independence-test' },
      { name: '概率与数列递推',         slug: 'kp-probability-recurrence' },
    ],
  },
  {
    name: '创新与综合', slug: 'kp-innovation',
    points: [
      { name: '新定义问题', slug: 'kp-new-definition' },
      { name: '数学文化',   slug: 'kp-math-culture' },
    ],
  },
];

/** 考点名 → 所属章节定义（含考点自身 slug），分类结果清洗与落库共用。 */
export const KP_INDEX: ReadonlyMap<string, { point: KnowledgePointDef; chapter: KnowledgeChapterDef }> =
  new Map(KP_TAXONOMY.flatMap(ch => ch.points.map(p => [p.name, { point: p, chapter: ch }])));

/** 提示词用的全量考点清单（按章节分组，一行一章）。 */
export const KP_PROMPT_LIST: string = KP_TAXONOMY
  .map(ch => `【${ch.name}】${ch.points.map(p => p.name).join('、')}`)
  .join('\n');

/** 清洗模型输出：去重、丢弃词表外名字、最多保留 4 个。 */
export function sanitizeKnowledgePoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const name = String(item ?? '').trim();
    if (name && KP_INDEX.has(name) && !out.includes(name)) out.push(name);
    if (out.length >= 4) break;
  }
  return out;
}
