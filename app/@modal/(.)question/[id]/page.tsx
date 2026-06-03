// 拦截路由：从根级页面（/search、/daily 等）软导航至 /question/[id] 时挂载此弹窗，
// 服务端按 id 取题目 + 当前用户收藏/错题/评分态后交给 QuestionDetailView 做共享元素 morph。
// 硬刷新 / 新标签直开该 URL 时不走拦截，由 app/question/[id]/page.tsx 渲染全页。
import { notFound } from 'next/navigation';
import { getQuestionForGraph } from '@/app/actions/graph';
import QuestionDetailView from '@/components/question/QuestionDetailView';

export default async function InterceptedQuestionModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getQuestionForGraph(id);
  if (!detail) notFound();

  return (
    <QuestionDetailView
      question={detail.question}
      isLoggedIn={detail.isLoggedIn}
      favorited={detail.favorited}
      errored={detail.errored}
      myRating={detail.myRating}
    />
  );
}
