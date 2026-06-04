import LatexDocStudio from '@/components/latex/LatexDocStudio';

export const dynamic = 'force-dynamic';

/** LaTeX 文档工作室（L2）：登录用户写整篇 LaTeX，服务端真实 TeX Live 编译出精美 PDF。
 *  登录拦截在 middleware 完成。 */
export default function StudioPage() {
  return <LatexDocStudio />;
}
