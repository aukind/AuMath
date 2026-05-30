// 论坛首页已并入站点首页 `/`（社区论坛为默认主区）。此路由重定向过去，避免维护两个论坛主页。
import { redirect } from 'next/navigation';

export default function ForumIndexRedirect() {
  redirect('/');
}
