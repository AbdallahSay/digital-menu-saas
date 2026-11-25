import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'r/demo', renderMode: RenderMode.Server },
  { path: 'r/:slug', renderMode: RenderMode.Server },
  {
    path: 'privacy',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'login',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'owner-setup',
    renderMode: RenderMode.Client,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  },
  {
    path: 'admin',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'admin/categories',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'admin/items',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'admin/branding',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'admin/qr',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'platform',
    renderMode: RenderMode.Client,
    headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
  },
  {
    path: 'r/:slug/unavailable',
    renderMode: RenderMode.Server,
    status: 404,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
    status: 404,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  },
];
