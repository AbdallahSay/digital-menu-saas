import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OwnerSettings, SettingsStateService } from './settings-state.service';

function settings(partial: Partial<OwnerSettings> = {}): OwnerSettings {
  return {
    name: 'مطعم النور',
    slug: 'elnour',
    publicCode: '0123456789abcdef0123',
    primaryColor: '#0f766e',
    hasLogo: false,
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
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 400, statusText: '' });
    expect(await bad).toBe('invalid');
    const stale = store.saveColor('#334155', 'AAAAAAAAAAA=');
    http.expectOne('/api/v1/admin/settings').flush({}, { status: 412, statusText: '' });
    expect(await stale).toBe('stale');
    expect(store.settings()).toBeNull();
  });
});
