import type { QuestionWithTopics, TopicWithChildren } from '@/types/database';

// ── Mock 知识点树 ──────────────────────────────────────────────

export const MOCK_TOPICS: TopicWithChildren[] = [
  {
    id: 'topic-1',
    name: '圆锥曲线',
    slug: 'conic-sections',
    description: '椭圆、双曲线、抛物线的综合应用',
    parent_id: null,
    level: 1,
    order_index: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    children: [
      {
        id: 'topic-1-1',
        name: '椭圆',
        slug: 'ellipse',
        description: null,
        parent_id: 'topic-1',
        level: 2,
        order_index: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        children: [],
      },
      {
        id: 'topic-1-2',
        name: '抛物线',
        slug: 'parabola',
        description: null,
        parent_id: 'topic-1',
        level: 2,
        order_index: 2,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        children: [],
      },
    ],
  },
  {
    id: 'topic-2',
    name: '导数与微分',
    slug: 'derivatives',
    description: '导数的定义、运算、应用（极值、不等式证明）',
    parent_id: null,
    level: 1,
    order_index: 2,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    children: [
      {
        id: 'topic-2-1',
        name: '导数的应用',
        slug: 'derivative-applications',
        description: null,
        parent_id: 'topic-2',
        level: 2,
        order_index: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        children: [],
      },
    ],
  },
];

// ── Mock 题目 ─────────────────────────────────────────────────

export const MOCK_QUESTIONS: QuestionWithTopics[] = [
  {
    id: 'q-001',
    content: `已知椭圆 $C:\\dfrac{x^2}{a^2}+\\dfrac{y^2}{b^2}=1$（$a>b>0$）的离心率为 $\\dfrac{\\sqrt{3}}{2}$，且过点 $\\left(1,\\dfrac{\\sqrt{3}}{2}\\right)$。

直线 $l$ 过左焦点 $F_1$，与椭圆交于 $A$、$B$ 两点，点 $P$ 在椭圆上且满足 $\\overrightarrow{PA}+\\overrightarrow{PB}=\\vec{0}$（即 $P$ 为 $AB$ 中点关于原点的对称点）。

**(1)** 求椭圆方程；

**(2)** 求 $|PA|^2+|PB|^2$ 的最小值。`,
    answer: `(1) $\\dfrac{x^2}{4}+\\dfrac{y^2}{1}=1$；(2) 最小值为 $\\dfrac{49}{4}$。`,
    analysis: `**第(1)步：求椭圆方程**

由离心率 $e=\\dfrac{c}{a}=\\dfrac{\\sqrt{3}}{2}$，得 $c=\\dfrac{\\sqrt{3}}{2}a$。

又 $b^2=a^2-c^2=a^2-\\dfrac{3}{4}a^2=\\dfrac{1}{4}a^2$，即 $b=\\dfrac{a}{2}$。

将点 $\\left(1,\\dfrac{\\sqrt{3}}{2}\\right)$ 代入椭圆方程：
$$\\frac{1}{a^2}+\\frac{3/4}{a^2/4}=\\frac{1}{a^2}+\\frac{3}{a^2}=\\frac{4}{a^2}=1$$

故 $a^2=4$，$b^2=1$，椭圆方程为 $\\dfrac{x^2}{4}+y^2=1$。

**第(2)步：求 $|PA|^2+|PB|^2$ 的最小值**

左焦点 $F_1(-\\sqrt{3},0)$。设 $A(x_1,y_1)$，$B(x_2,y_2)$，AB 中点为 $M\\left(\\dfrac{x_1+x_2}{2},\\dfrac{y_1+y_2}{2}\\right)$。

由 $\\overrightarrow{PA}+\\overrightarrow{PB}=\\vec{0}$ 知 $P$ 为 $M$ 关于原点的对称点，即 $P\\left(-\\dfrac{x_1+x_2}{2},-\\dfrac{y_1+y_2}{2}\\right)$。

$$|PA|^2+|PB|^2 = 2|PM|^2+\\frac{|AB|^2}{2}$$

利用弦长公式及韦达定理化简，最终得最小值为 $\\dfrac{49}{4}$（当直线 $l$ 竖直时取到）。`,
    question_type: 'calculation',
    difficulty: 4,
    year: 2024,
    source: '2024届高三模拟联考',
    status: 'published',
    variations: [
      {
        id: 'v-001-1',
        content: `若将上题改为：直线 $l$ 过**右**焦点 $F_2$，其余条件不变，求 $|PA|^2+|PB|^2$ 的取值范围。`,
        answer: `$|PA|^2+|PB|^2 \\in \\left[\\dfrac{49}{4},+\\infty\\right)$`,
        difficulty: 5,
        hint: '注意右焦点到椭圆两端点的距离关系，以及斜率不存在的情形单独讨论。',
      },
    ],
    metadata: {
      exam_number: '第20题',
      score: 12,
      time_limit_minutes: 18,
      tags: ['椭圆', '向量条件', '弦长', '焦点弦'],
      related_theorems: ['椭圆标准方程', '韦达定理', '弦长公式'],
      common_mistakes: [
        '忽略直线斜率不存在的情形',
        '对"PA+PB=0 的几何意义"理解有误，误认为 P 是 AB 中点',
      ],
    },
    created_at: '2024-03-15T08:00:00Z',
    updated_at: '2024-03-15T08:00:00Z',
    is_public: true,
    created_by: null,
    question_topic_relations: [
      {
        question_id: 'q-001',
        topic_id: 'topic-1',
        is_primary: true,
        created_at: '2024-03-15T08:00:00Z',
        topics: {
          id: 'topic-1',
          name: '圆锥曲线',
          slug: 'conic-sections',
          description: '椭圆、双曲线、抛物线的综合应用',
          parent_id: null,
          level: 1,
          order_index: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
      {
        question_id: 'q-001',
        topic_id: 'topic-1-1',
        is_primary: false,
        created_at: '2024-03-15T08:00:00Z',
        topics: {
          id: 'topic-1-1',
          name: '椭圆',
          slug: 'ellipse',
          description: null,
          parent_id: 'topic-1',
          level: 2,
          order_index: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    ],
  },
  {
    id: 'q-002',
    content: `设函数 $f(x)=x\\ln x - ax^2 + (2a-1)x$（$a\\in\\mathbb{R}$，$x>0$）。

**(1)** 讨论 $f(x)$ 的单调性；

**(2)** 若 $f(x)\\leq 0$ 对所有 $x>0$ 恒成立，求实数 $a$ 的取值范围。`,
    answer: `(1) 当 $a\\leq\\dfrac{1}{2}$ 时，$f(x)$ 在 $(0,+\\infty)$ 单调递增；当 $a>\\dfrac{1}{2}$ 时，$f(x)$ 在 $\\left(0,\\dfrac{1}{2a-1}\\right)$ 单调递增，在 $\\left(\\dfrac{1}{2a-1},+\\infty\\right)$ 单调递减。

(2) $a\\geq\\dfrac{1}{2}$。`,
    analysis: `**第(1)步：求导分析单调性**

$$f'(x)=\\ln x+1-2ax+(2a-1)=\\ln x-2ax+2a=\\ln x-2a(x-1)$$

令 $f'(x)=0$，即 $\\ln x=2a(x-1)$。注意 $f'(1)=0-0=0$，故 $x=1$ 是 $f'$ 的零点。

对 $f'(x)$ 再求导：$f''(x)=\\dfrac{1}{x}-2a$。

- 当 $a\\leq 0$ 时，$f''(x)>0$，$f'$ 单调递增。又 $f'(1)=0$，故 $x<1$ 时 $f'<0$，$x>1$ 时 $f'>0$……（分情形详细讨论略）

最终结论见答案。

**第(2)步：恒成立条件**

$f(x)\\leq 0$ 对 $x>0$ 恒成立，即 $f$ 的最大值 $\\leq 0$。

当 $a\\geq\\dfrac{1}{2}$ 时，$x=1$ 为极大值点，$f(1)=1\\cdot 0-a+2a-1=a-1$。

要使 $f(1)\\leq 0$，需 $a\\leq 1$；结合 $a\\geq\\dfrac{1}{2}$，得 $\\dfrac{1}{2}\\leq a\\leq 1$。

当 $a<\\dfrac{1}{2}$ 时，$f$ 单调递增且 $\\lim_{x\\to+\\infty}f(x)=+\\infty$，不满足。

综合得 $a\\in\\left[\\dfrac{1}{2},1\\right]$。`,
    question_type: 'calculation',
    difficulty: 5,
    year: 2023,
    source: '2023年全国甲卷第21题',
    status: 'published',
    variations: [],
    metadata: {
      exam_number: '第21题',
      score: 12,
      time_limit_minutes: 20,
      tags: ['导数', '恒成立', '单调性讨论', '含参分类讨论'],
      related_theorems: ['导数与单调性', '极值定理', '均值不等式'],
      common_mistakes: [
        '分类讨论时遗漏 a=1/2 的临界情形',
        '恒成立转化为"最大值≤0"时未验证最大值的存在性',
      ],
    },
    created_at: '2024-02-20T10:00:00Z',
    updated_at: '2024-02-20T10:00:00Z',
    is_public: true,
    created_by: null,
    question_topic_relations: [
      {
        question_id: 'q-002',
        topic_id: 'topic-2',
        is_primary: true,
        created_at: '2024-02-20T10:00:00Z',
        topics: {
          id: 'topic-2',
          name: '导数与微分',
          slug: 'derivatives',
          description: '导数的定义、运算、应用（极值、不等式证明）',
          parent_id: null,
          level: 1,
          order_index: 2,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
      {
        question_id: 'q-002',
        topic_id: 'topic-2-1',
        is_primary: false,
        created_at: '2024-02-20T10:00:00Z',
        topics: {
          id: 'topic-2-1',
          name: '导数的应用',
          slug: 'derivative-applications',
          description: null,
          parent_id: 'topic-2',
          level: 2,
          order_index: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    ],
  },
];
