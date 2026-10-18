import { Routes } from '@angular/router';
import { resolvePublicMenu } from './public-menu-resolver';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./marketing').then((m) => m.Marketing) },
  { path: 'r/demo', loadComponent: () => import('./menu').then((m) => m.Menu) },
  {
    path: 'r/:slug',
    resolve: { menu: resolvePublicMenu },
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    loadComponent: () => import('./public-menu').then((m) => m.PublicMenuComponent),
  },
  { path: 'admin', loadComponent: () => import('./admin').then((m) => m.Admin) },
  {
    path: 'r/:slug/unavailable',
    loadComponent: () => import('./not-found').then((m) => m.NotFound),
  },
  { path: '**', loadComponent: () => import('./not-found').then((m) => m.NotFound) },
];
