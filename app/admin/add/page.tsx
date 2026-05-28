import { getQuestionTopics } from '@/app/actions/questions';
import AddQuestionForm from '@/components/AddQuestionForm';

export const dynamic = 'force-dynamic';

/** 将 TopicWithChildren 树展平成有序列表（父→子），保留 parent_id */
function flattenTopics(
  nodes: Awaited<ReturnType<typeof getQuestionTopics>>,
  result: { id: string; name: string; parent_id: string | null }[] = [],
): { id: string; name: string; parent_id: string | null }[] {
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, parent_id: node.parent_id });
    if (node.children.length > 0) flattenTopics(node.children, result);
  }
  return result;
}

export default async function AddQuestionPage() {
  const topicTree = await getQuestionTopics();
  const topics    = flattenTopics(topicTree);

  return <AddQuestionForm topics={topics} />;
}
