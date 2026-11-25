import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OwnerSettings, SettingsStateService } from './settings-state.service';

/** Mutations enter the serialization queue on a microtask; flush before matching requests. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function settings(partial: Partial<OwnerSettings> = {}): OwnerSettings {
  return {
    name: 'مطعم النور',
    slug: 'elnour',
    publicCode: '0123456789abcdef0123',
    primaryColor: '#0f766e',
    hasLogo: false,
    logoUrl: null,
    rowVersion: 'AAAAAAAAAAA=',
    ...partial,
  };
}

describe('SettingsStateService', () => {
  let store: SettingsStateService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SettingsStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the owner settings', async () => {
    const load = store.load();
    http.expectOne('/api/v1/admin/settings').flush(settings());
    await load;
    expect(store.settings()?.slug).toBe('elnour');
    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('sets an Arabic error message when loading fails', async () => {
    const load = store.load();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 500, statusText: '' });
    await load;
    expect(store.settings()).toBeNull();
    expect(store.error()).not.toBeNull();
  });

  it('saves the color with the rowVersion and installs the server response', async () => {
    const promise = store.saveColor('#D97706', 'AAAAAAAAAAA=');
    await tick();
    const request = http.expectOne('/api/v1/admin/settings');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ primaryColor: '#D97706', rowVersion: 'AAAAAAAAAAA=' });
    request.flush(settings({ primaryColor: '#d97706', rowVersion: 'BBBBBBBBBBB=' }));
    expect(await promise).toBe('ok');
    expect(store.settings()?.primaryColor).toBe('#d97706');
    expect(store.settings()?.rowVersion).toBe('BBBBBBBBBBB=');
  });

  it('maps 400 to invalid and 412 to stale on save', async () => {
    const bad = store.saveColor('red', 'AAAAAAAAAAA=');
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 400, statusText: '' });
    expect(await bad).toBe('invalid');
    const stale = store.saveColor('#334155', 'AAAAAAAAAAA=');
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 412, statusText: '' });
    expect(await stale).toBe('stale');
    expect(store.settings()).toBeNull();
  });

  it('uploads the logo as a single multipart file field and installs the response', async () => {
    const promise = store.uploadLogo(new File(['x'], 'logo.png', { type: 'image/png' }));
    await tick();
    const request = http.expectOne('/api/v1/admin/settings/logo');
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    expect((request.request.body as FormData).getAll('file').length).toBe(1);
    request.flush(settings({ hasLogo: true, logoUrl: '/api/v1/admin/settings/logo' }), {
      status: 200,
      statusText: 'OK',
    });
    expect(await promise).toBe('ok');
    expect(store.settings()?.hasLogo).toBe(true);
    expect(store.settings()?.logoUrl).toBe('/api/v1/admin/settings/logo');
  });

  it('maps logo upload errors: 413 too large, 415/400 unsupported, 503 generic', async () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const tooLarge = store.uploadLogo(file);
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush({}, { status: 413, statusText: '' });
    expect(await tooLarge).toBe('too-large');
    const unsupported = store.uploadLogo(file);
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush({}, { status: 415, statusText: '' });
    expect(await unsupported).toBe('unsupported');
    const down = store.uploadLogo(file);
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush({}, { status: 503, statusText: '' });
    expect(await down).toBe('error');
  });

  it('refreshes authoritative settings after deletion (fresh rowVersion, cleared logo)', async () => {
    store.settings.set(
      settings({
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'AAAAAAAAAAA=',
      }),
    );
    const promise = store.deleteLogo();
    await tick();
    const request = http.expectOne('/api/v1/admin/settings/logo');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    const refresh = http.expectOne('/api/v1/admin/settings');
    expect(refresh.request.method).toBe('GET');
    refresh.flush(settings({ hasLogo: false, rowVersion: 'BBBBBBBBBBB=' }));
    expect(await promise).toBe('ok');
    expect(store.settings()?.hasLogo).toBe(false);
    expect(store.settings()?.logoUrl).toBeNull();
    expect(store.settings()?.rowVersion).toBe('BBBBBBBBBBB=');
  });

  it('sends the refreshed rowVersion on a save after deletion, not the pre-delete one', async () => {
    store.settings.set(
      settings({
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'AAAAAAAAAAA=',
      }),
    );
    const del = store.deleteLogo();
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush(null, { status: 204, statusText: '' });
    await tick();
    http
      .expectOne('/api/v1/admin/settings')
      .flush(settings({ hasLogo: false, rowVersion: 'BBBBBBBBBBB=' }));
    expect(await del).toBe('ok');
    const save = store.saveColor('#d97706', store.settings()!.rowVersion);
    await tick();
    const request = http.expectOne('/api/v1/admin/settings');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ primaryColor: '#d97706', rowVersion: 'BBBBBBBBBBB=' });
    request.flush(settings({ primaryColor: '#d97706', rowVersion: 'CCCCCCCCCCC=' }));
    expect(await save).toBe('ok');
  });

  it('clears the logo in place when the post-delete refresh fails', async () => {
    store.settings.set(settings({ hasLogo: true, logoUrl: '/api/v1/admin/settings/logo' }));
    const promise = store.deleteLogo();
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush(null, { status: 204, statusText: '' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 500, statusText: '' });
    expect(await promise).toBe('ok');
    expect(store.settings()?.hasLogo).toBe(false);
    expect(store.settings()?.logoUrl).toBeNull();
  });

  it('keeps the stored logo when deletion fails', async () => {
    store.settings.set(settings({ hasLogo: true, logoUrl: '/api/v1/admin/settings/logo' }));
    const promise = store.deleteLogo();
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush({}, { status: 500, statusText: '' });
    expect(await promise).toBe('error');
    expect(store.settings()?.hasLogo).toBe(true);
  });

  it('serializes mutations: a queued upload starts only after the color save completes', async () => {
    store.settings.set(settings());
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const save = store.saveColor('#d97706', 'AAAAAAAAAAA=');
    const upload = store.uploadLogo(file);
    expect(store.mutationBusy()).toBe(true);
    await tick();
    const put = http.expectOne('/api/v1/admin/settings');
    expect(put.request.method).toBe('PUT');
    http.expectNone('/api/v1/admin/settings/logo');
    put.flush(settings({ primaryColor: '#d97706', rowVersion: 'BBBBBBBBBBB=' }));
    expect(await save).toBe('ok');
    await tick();
    const post = http.expectOne('/api/v1/admin/settings/logo');
    expect(post.request.method).toBe('POST');
    post.flush(
      settings({
        primaryColor: '#d97706',
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'CCCCCCCCCCC=',
      }),
      { status: 200, statusText: 'OK' },
    );
    expect(await upload).toBe('ok');
    expect(store.mutationBusy()).toBe(false);
    expect(store.settings()?.rowVersion).toBe('CCCCCCCCCCC=');
    expect(store.settings()?.hasLogo).toBe(true);
    expect(store.settings()?.primaryColor).toBe('#d97706');
  });

  it('serializes in request order: a color save queued during an upload applies after it', async () => {
    store.settings.set(settings());
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const upload = store.uploadLogo(file);
    const save = store.saveColor('#334155', 'AAAAAAAAAAA=');
    await tick();
    const post = http.expectOne('/api/v1/admin/settings/logo');
    expect(post.request.method).toBe('POST');
    http.expectNone('/api/v1/admin/settings');
    post.flush(
      settings({
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'BBBBBBBBBBB=',
      }),
      { status: 200, statusText: 'OK' },
    );
    expect(await upload).toBe('ok');
    await tick();
    const put = http.expectOne('/api/v1/admin/settings');
    expect(put.request.method).toBe('PUT');
    // Reconciled at dispatch: the PUT carries the upload's fresh rowVersion,
    // not the pre-upload one the caller captured.
    expect(put.request.body).toEqual({ primaryColor: '#334155', rowVersion: 'BBBBBBBBBBB=' });
    put.flush(
      settings({
        primaryColor: '#334155',
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'CCCCCCCCCCC=',
      }),
    );
    expect(await save).toBe('ok');
    expect(store.settings()?.primaryColor).toBe('#334155');
    expect(store.settings()?.hasLogo).toBe(true);
    expect(store.settings()?.rowVersion).toBe('CCCCCCCCCCC=');
  });

  it('reconciles a knowingly stale rowVersion before the next save after a failed post-delete refresh', async () => {
    store.settings.set(
      settings({
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'AAAAAAAAAAA=',
      }),
    );
    const del = store.deleteLogo();
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush(null, { status: 204, statusText: '' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 500, statusText: '' });
    expect(await del).toBe('ok');
    // The next save refreshes first, then sends the reconciled token.
    const save = store.saveColor('#d97706', 'AAAAAAAAAAA=');
    await tick();
    const refresh = http.expectOne('/api/v1/admin/settings');
    expect(refresh.request.method).toBe('GET');
    refresh.flush(settings({ hasLogo: false, rowVersion: 'DDDDDDDDDDD=' }));
    await tick();
    const put = http.expectOne('/api/v1/admin/settings');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ primaryColor: '#d97706', rowVersion: 'DDDDDDDDDDD=' });
    put.flush(settings({ primaryColor: '#d97706', rowVersion: 'EEEEEEEEEEE=' }));
    expect(await save).toBe('ok');
  });

  it('clears the reconciliation marker after a later successful authoritative load', async () => {
    store.settings.set(
      settings({
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'AAAAAAAAAAA=',
      }),
    );
    const del = store.deleteLogo();
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush(null, { status: 204, statusText: '' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 500, statusText: '' });
    expect(await del).toBe('ok');
    // A later successful load is authoritative: the next save needs no extra GET.
    const load = store.load();
    await tick();
    http.expectOne('/api/v1/admin/settings').flush(settings({ rowVersion: 'FFFFFFFFFFF=' }));
    await load;
    const save = store.saveColor('#d97706', 'FFFFFFFFFFF=');
    await tick();
    const put = http.expectOne('/api/v1/admin/settings');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ primaryColor: '#d97706', rowVersion: 'FFFFFFFFFFF=' });
    put.flush(settings({ primaryColor: '#d97706', rowVersion: 'FFFFFFFFFFF0' }));
    expect(await save).toBe('ok');
  });

  it('blocks the save without issuing a stale PUT when reconciliation fails', async () => {
    store.settings.set(
      settings({
        hasLogo: true,
        logoUrl: '/api/v1/admin/settings/logo',
        rowVersion: 'AAAAAAAAAAA=',
      }),
    );
    const del = store.deleteLogo();
    await tick();
    http.expectOne('/api/v1/admin/settings/logo').flush(null, { status: 204, statusText: '' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 500, statusText: '' });
    expect(await del).toBe('ok');
    const save = store.saveColor('#d97706', 'AAAAAAAAAAA=');
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 503, statusText: '' });
    await tick();
    expect(await save).toBe('error');
    // No PUT with the knowingly stale token was issued; local state is untouched.
    expect(store.settings()?.rowVersion).toBe('AAAAAAAAAAA=');
    expect(store.settings()?.hasLogo).toBe(false);
  });

  it('saves presentation fields with the current rowVersion and maps 400/412', async () => {
    store.settings.set(settings());
    const save = store.savePresentation({
      theme: 'cafe',
      brandLabel: 'THE ROOM',
      taglineAr: '',
      taglineEn: 'en',
    });
    await tick();
    const req = http.expectOne('/api/v1/admin/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      primaryColor: '#0f766e',
      theme: 'cafe',
      brandLabel: 'THE ROOM',
      taglineAr: '',
      taglineEn: 'en',
      rowVersion: 'AAAAAAAAAAA=',
    });
    req.flush(settings({ theme: 'cafe', brandLabel: 'THE ROOM' }));
    expect(await save).toBe('ok');
    expect(store.settings()?.theme).toBe('cafe');
    const bad = store.savePresentation({ theme: 'cafe' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 412, statusText: '' });
    expect(await bad).toBe('stale');
  });

  it('uploads and deletes the hero image through the hero routes', async () => {
    store.settings.set(settings());
    const up = store.uploadHero(new File(['x'], 'h.png', { type: 'image/png' }));
    await tick();
    const post = http.expectOne('/api/v1/admin/settings/hero');
    expect(post.request.method).toBe('POST');
    post.flush(settings({ hasHero: true, heroUrl: '/api/v1/admin/settings/hero' }));
    expect(await up).toBe('ok');
    expect(store.settings()?.hasHero).toBe(true);
    const del = store.deleteHero();
    await tick();
    http.expectOne('/api/v1/admin/settings/hero').flush(null, { status: 204, statusText: '' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush(settings());
    expect(await del).toBe('ok');
    expect(store.settings()?.hasHero).toBeFalsy();
  });

  it('sends only the changed presentation fields', async () => {
    store.settings.set(settings());
    const save = store.savePresentation({ brandLabel: 'X' });
    await tick();
    const req = http.expectOne('/api/v1/admin/settings');
    expect(req.request.body).toEqual({
      primaryColor: '#0f766e',
      brandLabel: 'X',
      rowVersion: 'AAAAAAAAAAA=',
    });
    req.flush(settings({ brandLabel: 'X' }));
    expect(await save).toBe('ok');
  });

  it('treats a committed hero DELETE with a failed refresh as success and reconciles next', async () => {
    store.settings.set(settings({ hasHero: true, heroUrl: '/api/v1/admin/settings/hero' }));
    const del = store.deleteHero();
    await tick();
    http.expectOne('/api/v1/admin/settings/hero').flush(null, { status: 204, statusText: '' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 500, statusText: '' });
    expect(await del).toBe('ok');
    expect(store.settings()?.hasHero).toBe(false);
    expect(store.settings()?.heroUrl).toBeNull();
    const save = store.savePresentation({ theme: 'cafe' });
    await tick();
    http.expectOne('/api/v1/admin/settings').flush(settings({ rowVersion: 'BBBBBBBBBBB=' }));
    await tick();
    const put = http.expectOne('/api/v1/admin/settings');
    expect(put.request.body.rowVersion).toBe('BBBBBBBBBBB=');
    put.flush(settings({ theme: 'cafe' }));
    expect(await save).toBe('ok');
  });
});
