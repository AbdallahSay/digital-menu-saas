import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PublicMenuComponent, normalizeSearch } from './public-menu';
import type { DisplayMenu, PublicPage } from './public-menu-contract';

const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function menu(language: 'ar' | 'en' = 'ar'): DisplayMenu {
  const item = (n: number, name: string, description: string, withImage = false) => ({
    id: id(n),
    name,
    description,
    price: 10 * n,
    priceText: String(10 * n),
    image: withImage
      ? {
          url: '/api/v1/public/media/items/' + id(n) + '/main',
          thumbnailUrl: '/api/v1/public/media/items/' + id(n) + '/thumbnail',
          alt: name,
          width: 400,
          height: 300,
        }
      : null,
    featured: false,
    available: true,
  });
  return {
    restaurant: {
      name: 'Al Saraya',
      slug: 'al-saraya',
      primaryColor: '#0f766e',
      currency: 'EGP',
      logoUrl: null,
      heroUrl: null,
      theme: 'classic',
      brandLabel: null,
      tagline: null,
    },
    language,
    publishedMenuVersion: 1,
    categories: [
      {
        id: id(101),
        name: 'المشويات',
        items: [item(1, 'كباب لحم', 'مشوي على الفحم', true), item(2, 'كفتة', '')],
      },
      { id: id(102), name: 'المقبلات', items: [item(3, 'حمص', 'طحينة وليمون')] },
      { id: id(103), name: 'حلويات', items: [] },
    ],
  };
}

async function create(
  m: DisplayMenu | null,
  language: 'ar' | 'en' = 'ar',
  status: PublicPage['status'] = 200,
) {
  const page: PublicPage = {
    slug: 'al-saraya',
    language,
    status,
    publicOrigin: 'https://menu.example',
    menu: m,
  };
  await TestBed.configureTestingModule({
    imports: [PublicMenuComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          data: { subscribe: () => ({ unsubscribe() {} }) },
          snapshot: { data: { menu: page } },
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PublicMenuComponent);
  fixture.detectChanges();
  return fixture;
}

const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;
const names = (f: { nativeElement: HTMLElement }) =>
  [...el(f).querySelectorAll('article h3')].map((h) => h.textContent?.trim());

// jsdom does not implement HTMLDialogElement.showModal/close, so the unit test
// stands in for them. Real <dialog> behaviour (modal, Escape, focus trap) is
// covered only by the real-browser walkthrough, not by this spec.
const dialogProto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
const originalDialog = { showModal: dialogProto['showModal'], close: dialogProto['close'] };
afterAll(() => {
  dialogProto['showModal'] = originalDialog.showModal;
  dialogProto['close'] = originalDialog.close;
});
beforeAll(() => {
  const proto = dialogProto;
  proto['showModal'] = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto['close'] = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

describe('Public menu design', () => {
  it('normalizes Arabic letter variants and diacritics for search', () => {
    expect(normalizeSearch(' أَحمد ')).toBe(normalizeSearch('احمد'));
    expect(normalizeSearch('مقهى')).toBe(normalizeSearch('مقهي'));
    expect(normalizeSearch('Kebab')).toBe('kebab');
  });

  it('renders hero, language links, search, chips and display-only note', async () => {
    const f = await create(menu());
    const root = el(f);
    expect(root.querySelector('header.hero h1')?.textContent).toContain('Al Saraya');
    expect(root.querySelectorAll('nav a').length).toBe(2);
    expect(root.querySelector('nav a[lang="ar"]')?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector('#menu-search')).not.toBeNull();
    expect(root.querySelector('label[for="menu-search"]')).not.toBeNull();
    expect([...root.querySelectorAll('.chip')].map((c) => c.textContent?.trim())).toEqual([
      'الكل',
      'المشويات',
      'المقبلات',
      'حلويات',
    ]);
    expect(root.querySelector('.display-only')?.textContent).toContain('للعرض فقط');
    expect(names(f)).toEqual(['كباب لحم', 'كفتة', 'حمص']);
    expect(root.querySelector('article .description')?.textContent).toContain('مشوي');
    expect(root.querySelectorAll('article .description').length).toBe(2); // empty description not rendered
  });

  it('filters by category chip and exposes pressed state', async () => {
    const f = await create(menu());
    const chips = [...el(f).querySelectorAll<HTMLButtonElement>('.chip')];
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    chips[2].click();
    f.detectChanges();
    expect(names(f)).toEqual(['حمص']);
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
    expect(el(f).querySelector('.status')?.textContent).toContain('1');
    chips[3].click(); // empty category keeps the existing empty notice
    f.detectChanges();
    expect(el(f).textContent).toContain('مفيش أصناف متاحة حاليًا.');
    chips[0].click();
    f.detectChanges();
    expect(names(f).length).toBe(3);
  });

  it('searches names and descriptions, hides empty categories, and shows a no-match state', async () => {
    const f = await create(menu());
    const input = el(f).querySelector<HTMLInputElement>('#menu-search')!;
    input.value = 'طحينه'; // matches description of حمص via ة/ه normalisation of طحينة
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(names(f)).toEqual(['حمص']);
    expect(el(f).querySelectorAll('section').length).toBe(1);
    input.value = 'لا يوجد';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(names(f)).toEqual([]);
    expect(el(f).querySelector('.status')?.textContent).toContain('مفيش أصناف مطابقة');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(names(f).length).toBe(3);
    expect(el(f).querySelector('.status')?.textContent?.trim()).toBe('');
  });

  it('search spans all categories and the live count matches the rendered results', async () => {
    const f = await create(menu());
    const chips = [...el(f).querySelectorAll<HTMLButtonElement>('.chip')];
    chips[2].click(); // a category that does not contain the dish searched next
    f.detectChanges();
    const input = el(f).querySelector<HTMLInputElement>('#menu-search')!;
    input.value = 'كباب';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(names(f)).toEqual(['كباب لحم']);
    const status = el(f).querySelector('.status')?.textContent ?? '';
    expect(status).not.toContain('مفيش أصناف مطابقة');
    expect(status).toContain('1');
  });

  it('opens a detail dialog with the main image and restores focus on close', async () => {
    const f = await create(menu());
    document.body.appendChild(el(f));
    try {
      const open = el(f).querySelector<HTMLButtonElement>('.item-open')!;
      open.focus();
      open.click();
      f.detectChanges();
      const dialog = el(f).querySelector<HTMLDialogElement>('dialog.detail')!;
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector('h2')?.textContent).toContain('كباب لحم');
      expect(dialog.querySelector('img')?.getAttribute('src')).toMatch(/\/main$/);
      expect(dialog.textContent).toContain('10');
      dialog.querySelector<HTMLButtonElement>('.detail-close')!.click();
      f.detectChanges();
      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(open);
      expect(dialog.querySelector('h2')).toBeNull();
    } finally {
      el(f).remove();
    }
  });

  it('English: LTR labels, currency code and aria-current on English link', async () => {
    const f = await create(menu('en'), 'en');
    const root = el(f);
    expect(root.querySelector('nav a[lang="en"]')?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector('.chip')?.textContent?.trim()).toBe('All');
    expect(root.querySelector('.price')?.textContent).toContain('EGP');
    expect(root.querySelector('.display-only')?.textContent).toContain('Display only');
    expect(root.querySelector('article .pill')?.textContent).toContain('Available');
  });

  it('keeps the empty menu notice and no controls for a menu without categories', async () => {
    const m = menu();
    m.categories = [];
    const f = await create(m);
    expect(el(f).textContent).toContain('المنيو فاضي حاليًا.');
    expect(el(f).querySelector('#menu-search')).toBeNull();
    expect(el(f).querySelector('.chip')).toBeNull();
  });

  it('renders the error state without menu controls', async () => {
    const f = await create(null, 'ar', 404);
    expect(el(f).querySelector('h1')?.textContent).toContain('المنيو مش موجود');
    expect(el(f).querySelector('#menu-search')).toBeNull();
    expect(el(f).querySelector('dialog')).toBeNull();
  });

  it('resets search, category and open dish when route data changes to another menu', async () => {
    const page = (m: DisplayMenu, slug: string): PublicPage => ({
      slug,
      language: 'ar',
      status: 200,
      publicOrigin: 'https://menu.example',
      menu: m,
    });
    const first = menu();
    const second = {
      ...menu(),
      restaurant: { ...menu().restaurant, slug: 'other', name: 'Other' },
    };
    const data$ = new BehaviorSubject<Record<string, unknown>>({ menu: page(first, 'al-saraya') });
    await TestBed.configureTestingModule({
      imports: [PublicMenuComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { data: data$, snapshot: { data: data$.value } } },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(PublicMenuComponent);
    f.detectChanges();
    const root = el(f);
    root.querySelectorAll<HTMLButtonElement>('.chip')[2].click();
    f.detectChanges();
    root.querySelector<HTMLButtonElement>('.item-open')?.click();
    f.detectChanges();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    data$.next({ menu: page(second, 'other') });
    f.detectChanges();
    f.detectChanges();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(f.componentInstance.detailItem()).toBeNull();
    expect(f.componentInstance.selected()).toBeNull();
    expect(f.componentInstance.query()).toBe('');
    expect(names(f)).toEqual(['كباب لحم', 'كفتة', 'حمص']);
  });

  it('closes on a click outside the dialog box but not inside it', async () => {
    const f = await create(menu());
    el(f).querySelector<HTMLButtonElement>('.item-open')?.click();
    f.detectChanges();
    const dialog = el(f).querySelector('dialog') as HTMLDialogElement;
    dialog.getBoundingClientRect = () =>
      ({ left: 10, right: 110, top: 10, bottom: 110 }) as DOMRect;
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 }));
    f.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(true);
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 500, clientY: 50 }));
    f.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
