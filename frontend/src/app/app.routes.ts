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
  { path: 'privacy', loadComponent: () => import('./privacy').then((m) => m.PrivacyComponent) },
  {
    path: 'login',
    loadComponent: () => import('./admin/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'owner-setup',
    loadComponent: () => import('./admin/owner-setup.component').then((m) => m.OwnerSetupComponent),
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
      {
        path: 'items',
        loadComponent: () => import('./admin/item-list.component').then((m) => m.ItemListComponent),
      },
      {
        path: 'branding',
        loadComponent: () =>
          import('./admin/branding-studio.component').then((m) => m.BrandingStudioComponent),
      },
      {
        path: 'qr',
        loadComponent: () => import('./admin/qr-studio.component').then((m) => m.QrStudioComponent),
      },
    ],
  },
  {
    path: 'platform',
    canMatch: [platformGuard],
    loadComponent: () =>
      import('./admin/platform-console.component').then((m) => m.PlatformConsoleComponent),
  },
  {
    path: 'r/:slug/unavailable',
    loadComponent: () => import('./not-found').then((m) => m.NotFound),
  },
  { path: '**', loadComponent: () => import('./not-found').then((m) => m.NotFound) },
];
