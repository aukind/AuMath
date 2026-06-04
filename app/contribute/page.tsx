import { getQuestionTopics } from '@/app/actions/questions';
import AddQuestionForm from '@/components/AddQuestionForm';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

/** 面向已登录普通用户的自助录题页：复用录题表单（含 TikZ 作图、截图转 LaTeX）。
 *  非管理员提交的题目由 createQuestion 自动落为私有（is_public:false），不污染公共题库。
 *  登录拦截在 middleware 完成。 */
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

export default async function ContributePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const topicTree = await getQuestionTopics();
  const topics = flattenTopics(topicTree);

  return <AddQuestionForm topics={topics} isAdmin={isAdminUser(user)} />;
}
