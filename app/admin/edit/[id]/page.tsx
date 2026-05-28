import { notFound } from 'next/navigation';
import { getQuestionById, getQuestionTopics } from '@/app/actions/questions';
import AddQuestionForm from '@/components/AddQuestionForm';
import type { TopicWithChildren } from '@/types/database';

export const dynamic = 'force-dynamic';

function flattenTopics(
  nodes: TopicWithChildren[],
  result: { id: string; name: string; parent_id: string | null }[] = [],
) {
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, parent_id: node.parent_id });
    if (node.children.length > 0) flattenTopics(node.children, result);
  }
  return result;
}

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [question, topicTree] = await Promise.all([
    getQuestionById(id),
    getQuestionTopics(),
  ]);

  if (!question) notFound();

  const topics = flattenTopics(topicTree);

  return <AddQuestionForm topics={topics} initialData={question} />;
}
