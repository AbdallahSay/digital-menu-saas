import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { ownerGuard, platformGuard } from './admin-auth.guard';
import { AdminAuthService, AdminSession } from './admin-auth.service';

function setup(session: AdminSession | null) {
  const authStub = { loadSession: async () => session };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AdminAuthService, useValue: authStub }],
  });
}

function run(guard: typeof ownerGuard): Promise<boolean | UrlTree> {
  return TestBed.runInInjectionContext(() => guard({} as never, [], {} as never)) as Promise<
    boolean | UrlTree
  >;
}

describe('ownerGuard', () => {
  it('allows owners', async () => {
    setup({ role: 'Owner', restaurants: [{ name: 'مطعم' }] });
    await expect(run(ownerGuard)).resolves.toBe(true);
  });

  it('sends platform admins to /platform', async () => {
    setup({ role: 'PlatformAdmin', restaurants: [] });
    const result = await run(ownerGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/platform');
  });

  it('sends guests to /login', async () => {
    setup(null);
    const result = await run(ownerGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});

describe('platformGuard', () => {
  it('allows platform admins', async () => {
    setup({ role: 'PlatformAdmin', restaurants: [] });
    await expect(run(platformGuard)).resolves.toBe(true);
  });

  it('sends owners to /admin', async () => {
    setup({ role: 'Owner', restaurants: [] });
    const result = await run(platformGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/admin');
  });
});
