// 知识星图宿主页：全屏力导向图「学习仪表盘」。
// Server Component 负责取个性化图数据（依赖 cookie/登录态），交给 client 编排层渲染。
import { getPersonalizedGraphData } from '@/app/actions/graph';
import GraphExplorer from '@/components/graph/GraphExplorer';
import FluidCursor from '@/components/background/FluidCursor';

// 个性化染色依赖当前用户的 cookie，故强制动态渲染。
export const dynamic = 'force-dynamic';
export const metadata = { title: '知识星图 · AuMath' };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  // ?focus=知识点名：来自正文 [[维基链接]] 的直达入口，进场即聚焦局部图谱。
  const { focus } = await searchParams;
  const data = await getPersonalizedGraphData();
  return (
    <>
      <GraphExplorer data={data} initialFocusName={focus || undefined} />
      {/* 指针流体拖尾（与首页同引擎）：拖节点/扫过星河即泼出霓虹涡旋，
          z-35 在顶栏(z-20)/Inspector(z-30)之上、题目抽屉(z-90+)之下，
          mix-blend 融合不遮内容；reduced-motion / 无 WebGL2 静默缺席 */}
      <FluidCursor />
    </>
  );
}
