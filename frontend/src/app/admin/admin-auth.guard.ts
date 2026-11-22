import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AdminAuthService, AdminRole } from './admin-auth.service';

function roleGuard(role: AdminRole, home: string): CanMatchFn {
  return async () => {
    const auth = inject(AdminAuthService);
    const router = inject(Router);
    const session = await auth.loadSession();
    if (!session) return router.createUrlTree(['/login']);
    // Each area belongs to one role; the other role lands on its own home.
    return session.role === role ? true : router.createUrlTree([home]);
  };
}

/** Restaurant owners only; platform admins are sent to /platform, guests to /login. */
export const ownerGuard: CanMatchFn = roleGuard('Owner', '/platform');

/** Platform admins only; owners are sent to /admin, guests to /login. */
export const platformGuard: CanMatchFn = roleGuard('PlatformAdmin', '/admin');
