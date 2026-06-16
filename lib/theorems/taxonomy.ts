// 定理受控词表：定理库的「字典」。镜像 lib/knowledge/taxonomy.ts 的角色——
// AI 只能从这张表里挑定理名（一字不差），保证 theorems.name 稳定、可被 [[维基链接]] 命中。
//
// 每条带一句 LaTeX 陈述：AI 回填首次遇到某定理时，linker 据此建 theorems 行（name+slug+statement）。
// 证明(proof)/图示(figure_url) 留空，管理员后续可补。所属知识点不在这里写死——
// 由「引用该定理的题目所挂知识点」反推（linker 内派生），比手填更准。

export interface TheoremDef {
  name: string;
  slug: string;
  statement: string;
  description?: string;
}

export const THEOREM_LIST: TheoremDef[] = [
  { name: '韦达定理', slug: 'vieta', description: '一元二次方程根与系数的关系',
    statement: '设 $ax^2+bx+c=0\\,(a\\neq0)$ 的两根为 $x_1,x_2$，则 $x_1+x_2=-\\dfrac{b}{a},\\ x_1x_2=\\dfrac{c}{a}$。' },
  { name: '基本不等式', slug: 'amgm', description: '均值不等式 AM–GM',
    statement: '当 $a,b>0$ 时 $\\dfrac{a+b}{2}\\ge\\sqrt{ab}$，当且仅当 $a=b$ 时取等。' },
  { name: '柯西不等式', slug: 'cauchy-schwarz', description: 'Cauchy–Schwarz 不等式',
    statement: '$\\left(\\sum a_ib_i\\right)^2\\le\\left(\\sum a_i^2\\right)\\left(\\sum b_i^2\\right)$，当 $\\dfrac{a_i}{b_i}$ 为常数时取等。' },
  { name: '余弦定理', slug: 'law-of-cosines',
    statement: '$c^2=a^2+b^2-2ab\\cos C$。' },
  { name: '正弦定理', slug: 'law-of-sines',
    statement: '$\\dfrac{a}{\\sin A}=\\dfrac{b}{\\sin B}=\\dfrac{c}{\\sin C}=2R$，$R$ 为外接圆半径。' },
  { name: '三角形面积公式', slug: 'triangle-area',
    statement: '$S=\\dfrac{1}{2}ab\\sin C=\\dfrac{1}{2}\\,|\\,\\overrightarrow{AB}\\,||\\,\\overrightarrow{AC}\\,|\\sin A$。' },
  { name: '点到直线距离公式', slug: 'point-line-distance',
    statement: '点 $(x_0,y_0)$ 到直线 $Ax+By+C=0$ 的距离 $d=\\dfrac{|Ax_0+By_0+C|}{\\sqrt{A^2+B^2}}$。' },
  { name: '两点间距离公式', slug: 'distance-formula',
    statement: '$|P_1P_2|=\\sqrt{(x_1-x_2)^2+(y_1-y_2)^2}$。' },
  { name: '等差数列求和公式', slug: 'arithmetic-sum',
    statement: '$S_n=\\dfrac{n(a_1+a_n)}{2}=na_1+\\dfrac{n(n-1)}{2}d$。' },
  { name: '等比数列求和公式', slug: 'geometric-sum',
    statement: '$q\\neq1$ 时 $S_n=\\dfrac{a_1(1-q^n)}{1-q}$。' },
  { name: '二项式定理', slug: 'binomial-theorem',
    statement: '$(a+b)^n=\\sum_{k=0}^{n}\\binom{n}{k}a^{\\,n-k}b^{\\,k}$，通项 $T_{k+1}=\\binom{n}{k}a^{\\,n-k}b^{\\,k}$。' },
  { name: '数学归纳法', slug: 'induction', description: '证明与正整数有关命题的方法',
    statement: '若 $P(1)$ 成立，且 $P(k)\\Rightarrow P(k+1)$，则 $P(n)$ 对一切 $n\\in\\mathbf{N}^*$ 成立。' },
  { name: '导数与单调性', slug: 'derivative-monotonicity',
    statement: '在区间 $I$ 上 $f\'(x)>0\\Rightarrow f$ 单调递增；$f\'(x)<0\\Rightarrow f$ 单调递减。' },
  { name: '零点存在定理', slug: 'ivt', description: '介值定理的特例',
    statement: '$f$ 在 $[a,b]$ 连续且 $f(a)f(b)<0$，则存在 $\\xi\\in(a,b)$ 使 $f(\\xi)=0$。' },
  { name: '洛必达法则', slug: 'lhopital',
    statement: '$\\dfrac{0}{0}$ 或 $\\dfrac{\\infty}{\\infty}$ 型时 $\\lim\\dfrac{f}{g}=\\lim\\dfrac{f\'}{g\'}$（在极限存在的前提下）。' },
  { name: '向量数量积', slug: 'dot-product',
    statement: '$\\overrightarrow{a}\\cdot\\overrightarrow{b}=|\\overrightarrow{a}||\\overrightarrow{b}|\\cos\\theta=x_1x_2+y_1y_2$。' },
  { name: '椭圆的定义', slug: 'ellipse-definition',
    statement: '平面内到两定点 $F_1,F_2$ 距离之和为常数 $2a\\,(2a>|F_1F_2|)$ 的点的轨迹。' },
  { name: '双曲线的定义', slug: 'hyperbola-definition',
    statement: '平面内到两定点距离之差的绝对值为常数 $2a\\,(0<2a<|F_1F_2|)$ 的点的轨迹。' },
  { name: '抛物线的定义', slug: 'parabola-definition',
    statement: '平面内到定点 $F$ 与到定直线 $l$（$F\\notin l$）距离相等的点的轨迹。' },
  { name: '两角和与差公式', slug: 'angle-sum',
    statement: '$\\sin(\\alpha\\pm\\beta)=\\sin\\alpha\\cos\\beta\\pm\\cos\\alpha\\sin\\beta$；$\\cos(\\alpha\\pm\\beta)=\\cos\\alpha\\cos\\beta\\mp\\sin\\alpha\\sin\\beta$。' },
  { name: '二倍角公式', slug: 'double-angle',
    statement: '$\\sin2\\alpha=2\\sin\\alpha\\cos\\alpha$；$\\cos2\\alpha=2\\cos^2\\alpha-1=1-2\\sin^2\\alpha$。' },
  { name: '分类加法与分步乘法计数原理', slug: 'counting-principle',
    statement: '分类用加法 $N=m_1+\\dots+m_k$；分步用乘法 $N=m_1\\times\\dots\\times m_k$。' },
  { name: '全概率公式', slug: 'total-probability',
    statement: '$P(B)=\\sum_i P(A_i)P(B\\mid A_i)$，其中 $\\{A_i\\}$ 为样本空间的一个划分。' },
  { name: '贝叶斯公式', slug: 'bayes',
    statement: '$P(A_i\\mid B)=\\dfrac{P(A_i)P(B\\mid A_i)}{\\sum_j P(A_j)P(B\\mid A_j)}$。' },
  { name: '绝对值三角不等式', slug: 'triangle-inequality-abs',
    statement: '$\\big||a|-|b|\\big|\\le|a\\pm b|\\le|a|+|b|$。' },
];

/** name → 定义，供 linker 建表与 classify 清洗。 */
export const THEOREM_INDEX: ReadonlyMap<string, TheoremDef> = new Map(
  THEOREM_LIST.map(t => [t.name, t]),
);

/** 喂给分类 prompt 的名称清单（一行一个，AI 只能从中挑）。 */
export const THEOREM_PROMPT_LIST: string = THEOREM_LIST.map(t => `- ${t.name}`).join('\n');

/** 清洗模型输出：只保留词表内的精确名称，去重。 */
export function sanitizeTheoremNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const name = String(v ?? '').trim();
    if (THEOREM_INDEX.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}
