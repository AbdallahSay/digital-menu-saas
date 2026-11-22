import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { QrStudioComponent } from './qr-studio.component';
import { OwnerSettings, SettingsStateService } from './settings-state.service';

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

function storeStub(overrides: Record<string, unknown> = {}) {
  return {
    settings: signal<OwnerSettings | null>(null),
    isLoading: signal(false),
    error: signal<string | null>(null),
    load: async () => undefined,
    ...overrides,
  };
}

async function create(stub: ReturnType<typeof storeStub>) {
  await TestBed.configureTestingModule({
    imports: [QrStudioComponent],
    providers: [provideRouter([]), { provide: SettingsStateService, useValue: stub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(QrStudioComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('QrStudioComponent', () => {
  it('builds the permanent URL from the immutable public code, never the slug', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const url = fixture.componentInstance.permanentUrl();
    expect(url).toMatch(/\/m\/0123456789abcdef0123$/);
    expect(url).not.toContain('elnour');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(url!);
  });

  it('renders a scannable SVG preview for the permanent URL', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const svg = fixture.nativeElement.querySelector('.qr-frame svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('path')?.getAttribute('d')?.length ?? 0).toBeGreaterThan(0);
  });

  it('copies the permanent link with the async clipboard', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    let copied: string | null = null;
    Object.assign(navigator, {
      clipboard: { writeText: async (text: string) => (copied = text) },
    });
    await fixture.componentInstance.copyLink();
    expect(copied).toBe(fixture.componentInstance.permanentUrl());
    expect(fixture.componentInstance.feedback()?.kind).toBe('success');
  });

  it('falls back to the hidden textarea when the async clipboard is denied', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    Object.assign(navigator, {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    let executed = '';
    document.execCommand = (command: string) => {
      executed = command;
      return true;
    };
    await fixture.componentInstance.copyLink();
    expect(executed).toBe('copy');
    expect(fixture.componentInstance.feedback()?.kind).toBe('success');
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.classList.contains('visually-hidden')).toBe(true);
  });

  it('reports a soft failure for PNG download when canvas is unavailable (jsdom)', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    await fixture.componentInstance.downloadPng();
    const feedback = fixture.componentInstance.feedback();
    expect(feedback?.kind).toBe('error');
    expect(feedback?.text).toContain('SVG');
  });

  it('downloads the SVG export through an object URL', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const created: string[] = [];
    const revoked: string[] = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      created.push(blob.type);
      return 'blob:qr';
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    let clicked = 0;
    const realAnchor = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicked++;
    };
    try {
      fixture.componentInstance.downloadSvg();
      expect(created).toEqual(['image/svg+xml']);
      expect(revoked).toEqual(['blob:qr']);
      expect(clicked).toBe(1);
      expect(fixture.componentInstance.feedback()?.kind).toBe('success');
    } finally {
      URL.createObjectURL = realCreate;
      HTMLAnchorElement.prototype.click = realAnchor;
    }
  });

  it('shows the loading error state with a retry path', async () => {
    const stub = storeStub({ error: signal('فشل التحميل') });
    const fixture = await create(stub);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('فشل التحميل');
  });
});
