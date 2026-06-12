// 知识星图宿主页：全屏力导向图「学习仪表盘」。
// Server Component 负责取个性化图数据（依赖 cookie/登录态），交给 client 编排层渲染。
import { getPersonalizedGraphData } from '@/app/actions/graph';
import GraphExplorer from '@/components/graph/GraphExplorer';

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
  return <GraphExplorer data={data} initialFocusName={focus || undefined} />;
}
