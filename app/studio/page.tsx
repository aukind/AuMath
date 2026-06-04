import LatexDocStudio from '@/components/latex/LatexDocStudio';
import { listLatexDocuments } from '@/app/actions/latex-documents';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** LaTeX 文档工作室（L2）：登录用户写整篇 LaTeX，服务端真实 TeX Live 编译出精美 PDF。
 *  云端多文档：进页面先取当前用户文档列表，交给客户端外壳做标签页/自动保存/目录大纲。
 *  登录拦截在 middleware 完成。 */
export default async function StudioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const docs = await listLatexDocuments();
  return <LatexDocStudio initialDocs={docs} userId={user?.id ?? null} />;
}
