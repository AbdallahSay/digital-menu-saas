import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrandingStudioComponent } from './branding-studio.component';
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

function storeStub(overrides: Record<string, unknown> = {}) {
  return {
    settings: signal<OwnerSettings | null>(null),
    isLoading: signal(false),
    error: signal<string | null>(null),
    load: async () => undefined,
    saveColor: async (
      _color: string,
      _rowVersion: string,
    ): Promise<'ok' | 'invalid' | 'stale' | 'error'> => 'ok',
    ...overrides,
  };
}

async function create(stub: ReturnType<typeof storeStub>) {
  await TestBed.configureTestingModule({
    imports: [BrandingStudioComponent],
    providers: [provideRouter([]), { provide: SettingsStateService, useValue: stub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(BrandingStudioComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('BrandingStudioComponent', () => {
  it('loads settings and seeds the draft from the saved brand color', async () => {
    const stub = storeStub();
    stub.settings.set(settings({ primaryColor: '#d97706' }));
    stub.load = async () => undefined;
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    expect(component.draft()).toBe('#d97706');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('الهوية والألوان');
    expect(text).toContain('مطعم النور');
  });

  it('renders the design-contract preset swatches', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const swatches = fixture.nativeElement.querySelectorAll('button.swatch');
    expect(swatches.length).toBe(6);
  });

  it('marks a malformed custom color invalid and disables saving', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    component.draft.set('أحمر');
    fixture.detectChanges();
    expect(component.draftInvalid()).toBe(true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('صيغة اللون غير صحيحة');
    const saveButton = fixture.nativeElement.querySelector('button.save-btn') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('evaluates WCAG contrast for a valid draft and shows the ratio', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    component.draft.set('#000000');
    fixture.detectChanges();
    const report = component.report();
    expect(report).not.toBeNull();
    expect(report!.ratio).toBeCloseTo(21, 1);
    expect(report!.normalText).toBe('AAA');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('21.00:1');
  });

  it('falls back to the saved color for the preview while the draft is invalid', async () => {
    const stub = storeStub();
    stub.settings.set(settings({ primaryColor: '#334155' }));
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    component.draft.set('#xyz');
    fixture.detectChanges();
    expect(component.previewColor()).toBe('#334155');
    expect(component.report()).not.toBeNull();
  });

  it('saves the draft color with the current rowVersion and confirms success', async () => {
    const stub = storeStub();
    stub.settings.set(settings({ primaryColor: '#0f766e', rowVersion: 'AAAAAAAAAAA=' }));
    const saved: { color?: string; version?: string } = {};
    stub.saveColor = async (color: string, rowVersion: string) => {
      saved.color = color;
      saved.version = rowVersion;
      stub.settings.set(settings({ primaryColor: color, rowVersion: 'BBBBBBBBBBB=' }));
      return 'ok';
    };
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    component.pick('#059669');
    await component.save();
    fixture.detectChanges();
    expect(saved.color).toBe('#059669');
    expect(saved.version).toBe('AAAAAAAAAAA=');
    expect(component.feedback()?.kind).toBe('success');
  });

  it('reloads and reseeds the draft when the server reports a stale rowVersion', async () => {
    const stub = storeStub();
    stub.settings.set(settings({ primaryColor: '#0f766e' }));
    stub.saveColor = async () => 'stale';
    let loads = 0;
    stub.load = async () => {
      loads++;
      stub.settings.set(settings({ primaryColor: '#2563eb', rowVersion: 'CCCCCCCCCCC=' }));
    };
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    const loadsAtInit = loads; // ngOnInit loads once
    component.pick('#dc2626');
    await component.save();
    fixture.detectChanges();
    expect(loads).toBe(loadsAtInit + 1);
    expect(component.draft()).toBe('#2563eb');
    expect(component.feedback()?.kind).toBe('error');
  });

  it('treats an empty draft as invalid and keeps Save disabled', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    component.draft.set('');
    fixture.detectChanges();
    expect(component.draftInvalid()).toBe(true);
    const saveButton = fixture.nativeElement.querySelector('button.save-btn') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it.each([
    ['#000', '#000000'],
    ['#fff', '#ffffff'],
    ['#F00', '#ff0000'],
    ['#a5B', '#aa55bb'],
  ])(
    'normalizes the short HEX %s once and keeps preview, picker, contrast and save in sync',
    async (short, full) => {
      const stub = storeStub();
      stub.settings.set(settings({ primaryColor: '#0f766e' }));
      let sent: string | null = null;
      stub.saveColor = async (color: string) => {
        sent = color;
        stub.settings.set(settings({ primaryColor: color }));
        return 'ok' as const;
      };
      const fixture = await create(stub);
      const component = fixture.componentInstance;
      component.draft.set(short);
      fixture.detectChanges();
      expect(component.draftInvalid()).toBe(false);
      expect(component.normalizedDraft()).toBe(full);
      expect(component.previewColor()).toBe(full);
      expect(component.pickerColor()).toBe(full);
      expect(component.report()).not.toBeNull();
      await component.save();
      expect(sent).toBe(full);
    },
  );

  it('seeds the draft through the same load path on retry after a failed first load', async () => {
    const stub = storeStub();
    stub.error.set('فشل التحميل');
    stub.load = async () => undefined; // first load fails: settings stay null
    const fixture = await create(stub);
    const component = fixture.componentInstance;
    expect(component.draft()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('فشل التحميل');
    // Retry succeeds through the same component load path.
    stub.error.set(null);
    stub.load = async () => {
      stub.settings.set(settings({ primaryColor: '#d97706' }));
    };
    await component.load();
    fixture.detectChanges();
    expect(component.draft()).toBe('#d97706');
    const saveButton = fixture.nativeElement.querySelector('button.save-btn') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true); // same color as saved: nothing to save
  });

  it('keeps the preview strictly display-only (no ordering, cart or payment language)', async () => {
    const stub = storeStub();
    stub.settings.set(settings());
    const fixture = await create(stub);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('عرض فقط');
    expect(text).not.toMatch(/سلة|دفع|اطلب|أضف إلى/);
    const details = fixture.nativeElement.querySelector('.details-btn') as HTMLButtonElement;
    expect(details.disabled).toBe(true);
  });
});
