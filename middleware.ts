import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // 按照 Supabase 官方模式：必须在每次请求中刷新 session
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() 每次都向 Supabase Auth 服务器验证，比 getSession() 更安全
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 保护需登录的路由：/admin/*（管理台）、/contribute（自助录题）、/studio（LaTeX 文档工作室）。
  const path = request.nextUrl.pathname;
  if (
    !user &&
    (path.startsWith('/admin') || path.startsWith('/contribute') || path.startsWith('/studio'))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', path);
    return NextResponse.redirect(loginUrl);
  }

  // 已登录用户访问 /login，重定向回首页。
  // 仅对 GET 导航生效：登录表单的 Server Action 也 POST 到 /login，若把这个 POST 也重定向，
  // 客户端会收到无法解析为 action 结果的响应 → "An unexpected response was received from the server."
  if (user && request.nextUrl.pathname === '/login' && request.method === 'GET') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // 跳过静态资源和内部路由，其余全部过 middleware
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
