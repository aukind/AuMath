-- 数据初始化：2 道高难度压轴题 + 知识点关联
-- 粘贴到 Supabase 控制台 → SQL Editor 直接运行

WITH inserted_questions AS (
  INSERT INTO questions (
    content, answer, solution,
    question_type, difficulty, year, source, status,
    variations, metadata
  ) VALUES
  -- 题目1：椭圆中点弦面积最值
  (
    '已知椭圆 $C:\dfrac{x^2}{4}+y^2=1$，$A$、$B$ 是椭圆上两点，线段 $AB$ 的中点为 $M$，且 $\overrightarrow{OM}\cdot\overrightarrow{AB}=0$（$O$ 为原点）。

**(1)** 求中点 $M$ 的坐标（用斜率 $k$ 表示）；

**(2)** 求 $\triangle OAB$ 面积的最大值。',
    '(1) $M\!\left(-\dfrac{4k}{4k^2+1},\,\dfrac{1}{4k^2+1}\right)$；

(2) $S_{\max}=\dfrac{\sqrt{2}}{2}$，当 $k=\pm\dfrac{1}{2}$ 时取得。',
    '**第(1)步：中点弦斜率关系**

设 $A(x_1,y_1)$，$B(x_2,y_2)$ 均在椭圆上，两式相减：
$$\frac{x_1^2-x_2^2}{4}+(y_1^2-y_2^2)=0 \Rightarrow \frac{x_1+x_2}{4}+(y_1+y_2)\cdot k=0$$

设中点 $M=(m,n)$，由上式得 $k=-\dfrac{m}{4n}$。

又 $\overrightarrow{OM}\perp\overrightarrow{AB}$ 给出 $\dfrac{n}{m}=-\dfrac{1}{k}$，联立解得：
$$m=-\frac{4k}{4k^2+1},\quad n=\frac{1}{4k^2+1}$$

**第(2)步：面积最大值**

$$|OM|^2=m^2+n^2=\frac{16k^2+1}{(4k^2+1)^2}$$

利用弦长公式，令 $t=k^2>0$，面积化为：
$$S^2=\frac{1}{2}\cdot\frac{1}{\frac{1}{4t}+4t+2}$$

由均值不等式 $\dfrac{1}{4t}+4t\geq 2$，等号在 $t=\dfrac{1}{4}$（$k=\pm\dfrac{1}{2}$）时成立，故 $S_{\max}=\dfrac{\sqrt{2}}{2}$。',
    'calculation', 4, 2024, '2024届全国高三压轴模拟', 'published',
    '[{"id":"v1","content":"将椭圆改为 $\\dfrac{x^2}{a^2}+y^2=1$（$a>1$），其余条件不变，用 $a$ 表示面积最大值。","answer":"$S_{\\max}=\\dfrac{a}{2}$","difficulty":5,"hint":"将系数4替换为 $a^2$，重新应用均值不等式。"}]',
    '{"exam_number":"第21题","score":12,"time_limit_minutes":20,"tags":["椭圆","中点弦","面积最值","OM⊥AB"],"related_theorems":["椭圆参数方程","均值不等式","弦长公式"],"common_mistakes":["消元时符号出错","漏讨论k不存在的情形"]}'
  ),
  -- 题目2：导数证明不等式
  (
    '设函数 $f(x)=e^x-ex$（$e$ 为自然对数的底数）。

**(1)** 证明：对一切实数 $x$，有 $e^x\geq ex$；

**(2)** 利用 (1) 的结论，证明：对任意正整数 $n$，有
$$\left(1+\frac{1}{n}\right)^n < e < \left(1+\frac{1}{n}\right)^{n+1}$$',
    '两个不等式均通过对 $f(x)=e^x-ex$ 的极值分析及代入特殊值严格证明，详见解析。',
    '**第(1)步：证明 $e^x\geq ex$**

$f(x)=e^x-ex$，$f''(x)=e^x-e=0$ 得唯一驻点 $x=1$。

- $x<1$：$f''<0$，$f$ 单调递减；$x>1$：$f''>0$，$f$ 单调递增。

故 $x=1$ 为全局最小值点，$f(1)=0$，因此 $e^x\geq ex$。$\blacksquare$

**第(2)步：左侧 $\left(1+\dfrac{1}{n}\right)^n<e$**

令 $x=\dfrac{n}{n+1}\neq 1$，由(1)严格不等式：
$$e^{\frac{n}{n+1}}>e\cdot\frac{n}{n+1}$$

两边取 $(n+1)$ 次方后整理得 $\left(1+\dfrac{1}{n}\right)^n<e$。$\checkmark$

**第(2)步：右侧 $e<\left(1+\dfrac{1}{n}\right)^{n+1}$**

令 $x=\dfrac{n+1}{n}>1$，由(1)严格不等式：
$$e^{\frac{n+1}{n}}>e\cdot\frac{n+1}{n}$$

两边取 $n$ 次方后整理得 $\left(1+\dfrac{1}{n}\right)^{n+1}>e$。$\blacksquare$',
    'proof', 5, 2023, '2023年全国乙卷压轴改编', 'published',
    '[]',
    '{"exam_number":"第22题","score":12,"time_limit_minutes":22,"tags":["导数","不等式证明","自然对数","压轴"],"related_theorems":["导数与极值","单调性定理","指数函数性质"],"common_mistakes":["不等号方向因x取值范围出错","取幂次时忘记验证底数为正"]}'
  )
  RETURNING id, LEFT(content, 30) AS preview
),
-- 给第1题（椭圆）打上知识点标签
q1 AS (
  SELECT id FROM inserted_questions LIMIT 1
),
q2 AS (
  SELECT id FROM inserted_questions OFFSET 1 LIMIT 1
),
rel1 AS (
  INSERT INTO question_topic_relations (question_id, topic_id, is_primary)
  SELECT q1.id, t.topic_id, t.is_primary
  FROM q1,
  (VALUES
    ('00000000-0000-0000-0000-000000000005'::uuid, true),   -- 圆锥曲线（主）
    ('00000000-0000-0000-0000-000000000007'::uuid, false)   -- 椭圆（副）
  ) AS t(topic_id, is_primary)
  RETURNING question_id
),
rel2 AS (
  INSERT INTO question_topic_relations (question_id, topic_id, is_primary)
  SELECT q2.id, '00000000-0000-0000-0000-000000000003'::uuid, true  -- 导数与微积分（主）
  FROM q2
  RETURNING question_id
)
-- 返回结果确认
SELECT
  iq.id,
  iq.preview,
  COUNT(qtr.topic_id) AS topic_count
FROM inserted_questions iq
LEFT JOIN question_topic_relations qtr ON qtr.question_id = iq.id
GROUP BY iq.id, iq.preview;
