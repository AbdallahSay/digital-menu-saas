import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'r/demo', renderMode: RenderMode.Server },
  {
    path: 'admin',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
