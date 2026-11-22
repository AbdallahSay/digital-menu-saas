import { Routes } from '@angular/router';
import { ownerGuard, platformGuard } from './admin/admin-auth.guard';
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
  {
    path: 'login',
    loadComponent: () => import('./admin/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canMatch: [ownerGuard],
    loadComponent: () => import('./admin/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./admin/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./admin/category-list.component').then((m) => m.CategoryListComponent),
      },
    ],
  },
  {
    path: 'platform',
    canMatch: [platformGuard],
    loadComponent: () =>
      import('./admin/platform-stub.component').then((m) => m.PlatformStubComponent),
  },
  {
    path: 'r/:slug/unavailable',
    loadComponent: () => import('./not-found').then((m) => m.NotFound),
  },
  { path: '**', loadComponent: () => import('./not-found').then((m) => m.NotFound) },
];
