import { Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./marketing').then((m) => m.Marketing) },
  { path: 'r/demo', loadComponent: () => import('./menu').then((m) => m.Menu) },
  { path: 'admin', loadComponent: () => import('./admin').then((m) => m.Admin) },
];
