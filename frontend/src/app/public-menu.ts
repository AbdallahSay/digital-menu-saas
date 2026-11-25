import { toSignal } from '@angular/core/rxjs-interop';
import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import type { DisplayMenu, PublicPage } from './public-menu-contract';

type DisplayItem = DisplayMenu['categories'][number]['items'][number];

// Light Arabic/Latin normalisation so search ignores case, diacritics and
// common letter variants. Matching only looks at fields the public DTO has.
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

@Component({
  selector: 'app-public-menu',
  imports: [NgTemplateOutlet],
  template: `
    <main class="public-menu">
      @if (page.menu; as menu) {
        <div class="frame" [style.--tp]="menu.restaurant.primaryColor">
          @if (menu.restaurant.theme === 'cafe') {
            <header class="hero hero-cafe">
              <div class="hero-lang">
                <nav class="language" aria-label="Language">
                  <a
                    [href]="'/r/' + menu.restaurant.slug + '?lang=ar'"
                    lang="ar"
                    [attr.aria-current]="english ? null : 'true'"
                    >عربي</a
                  >
                  <a
                    [href]="'/r/' + menu.restaurant.slug + '?lang=en'"
                    lang="en"
                    [attr.aria-current]="english ? 'true' : null"
                    >EN</a
                  >
                </nav>
              </div>
              @if (menu.restaurant.brandLabel) {
                <p class="hero-brand">{{ menu.restaurant.brandLabel }}</p>
              }
              @if (menu.restaurant.tagline) {
                <p class="hero-tagline">{{ menu.restaurant.tagline }}</p>
              }
              @if (menu.restaurant.logoUrl; as logoUrl) {
                <img
                  class="restaurant-logo"
                  [src]="logoUrl"
                  [alt]="menu.restaurant.name"
                  width="96"
                  height="96"
                />
              }
            </header>
            <div class="cafe-title">
              <h1>{{ menu.restaurant.name }}</h1>
              <p class="brand-sub">
                {{ english ? 'Enjoy the best dishes' : 'استمتع بأفضل الأطباق' }}
              </p>
            </div>
          } @else {
            <header class="hero">
              <div class="hero-inner">
                @if (menu.restaurant.brandLabel) {
                  <p class="hero-brand">{{ menu.restaurant.brandLabel }}</p>
                }
                <h1>{{ menu.restaurant.name }}</h1>
                @if (menu.restaurant.tagline) {
                  <p class="hero-tagline">{{ menu.restaurant.tagline }}</p>
                }
                <p class="hero-pill">{{ english ? 'Digital menu' : 'قائمة رقمية' }}</p>
                @if (menu.restaurant.logoUrl; as logoUrl) {
                  <img
                    class="restaurant-logo"
                    [src]="logoUrl"
                    [alt]="menu.restaurant.name"
                    width="96"
                    height="96"
                  />
                }
              </div>
            </header>
            <div class="brand-card">
              <nav class="language" aria-label="Language">
                <a
                  [href]="'/r/' + menu.restaurant.slug + '?lang=ar'"
                  lang="ar"
                  [attr.aria-current]="english ? null : 'true'"
                  >عربي</a
                >
                <a
                  [href]="'/r/' + menu.restaurant.slug + '?lang=en'"
                  lang="en"
                  [attr.aria-current]="english ? 'true' : null"
                  >EN</a
                >
              </nav>
              <div class="brand-text">
                <p class="brand-title">
                  {{ english ? 'Menu' : 'منيو' }} {{ menu.restaurant.name }}
                </p>
                <p class="brand-sub">
                  {{ english ? 'Enjoy the best dishes' : 'استمتع بأفضل الأطباق' }}
                </p>
              </div>
            </div>
          }
          @if (menu.categories.length > 0) {
            <div class="search">
              <label class="sr-only" for="menu-search">{{
                english ? 'Search the menu' : 'ابحث في المنيو'
              }}</label>
              <svg
                class="search-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path
                  d="M16 16l4 4"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <input
                id="menu-search"
                type="search"
                autocomplete="off"
                [placeholder]="english ? 'What are you craving today?' : 'بتدور على إيه النهارده؟'"
                [value]="query()"
                (input)="setQuery($any($event.target).value)"
              />
            </div>
            <h2
              class="section-title"
              id="categories-title"
              [class.sr-only]="menu.restaurant.theme === 'cafe'"
            >
              {{ english ? 'Categories' : 'الأقسام' }}
            </h2>
            <div class="chips" role="group" aria-labelledby="categories-title">
              <button
                type="button"
                class="chip"
                [attr.aria-pressed]="selected() === null"
                (click)="select(null)"
              >
                {{ english ? 'All' : 'الكل' }}
              </button>
              @for (category of menu.categories; track category.id) {
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="selected() === category.id"
                  (click)="select(category.id)"
                >
                  {{ category.name }}
                </button>
              }
            </div>
            <p class="status" role="status" aria-live="polite">{{ statusText }}</p>
          }
          @if (menu.categories.length === 0) {
            <p class="empty">
              {{ english ? 'The menu is currently empty.' : 'المنيو فاضي حاليًا.' }}
            </p>
          }
          @if (featuredItems().length > 0) {
            <section aria-labelledby="featured-title" class="featured">
              <div class="featured-head">
                <h2 class="section-title" id="featured-title">
                  {{ featuredTitle(menu.restaurant.theme) }}
                </h2>
                @if (menu.restaurant.theme !== 'cafe') {
                  <span class="featured-note">{{
                    english ? 'Worth a try' : 'طعم يستاهل التجربة'
                  }}</span>
                }
              </div>
              <div class="items">
                @for (item of featuredItems(); track item.id) {
                  <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
                }
              </div>
            </section>
          }
          @for (category of visibleCategories(); track category.id; let ci = $index) {
            <section [attr.aria-labelledby]="'category-' + ci">
              <h2 class="section-title" [id]="'category-' + ci">{{ category.name }}</h2>
              @if (category.items.length === 0) {
                <p>{{ english ? 'No available items.' : 'مفيش أصناف متاحة حاليًا.' }}</p>
              }
              <div class="items">
                @for (item of category.items; track item.id) {
                  <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
                }
              </div>
            </section>
          }
          <ng-template #card let-item>
            <article>
              @if (item.image; as image) {
                <img
                  class="item-thumbnail"
                  [src]="image.thumbnailUrl"
                  [alt]="image.alt"
                  [width]="image.width"
                  [height]="image.height"
                  loading="lazy"
                  decoding="async"
                />
              }
              <div class="item-body">
                <h3>
                  <button type="button" class="item-open" (click)="open(item, $event)">
                    {{ item.name }}
                  </button>
                </h3>
                @if (item.description) {
                  <p class="description">{{ item.description }}</p>
                }
                <p class="item-foot">
                  <span class="price">
                    <bdi>{{ item.priceText }}</bdi>
                    {{ english ? menu.restaurant.currency : currencyAr(menu.restaurant.currency) }}
                  </span>
                  <span class="pill">{{ english ? 'Available' : 'متوفر' }}</span>
                </p>
              </div>
            </article>
          </ng-template>
          <dialog
            #detail
            class="detail"
            [attr.aria-label]="english ? 'Dish details' : 'تفاصيل الطبق'"
            (close)="onDetailClosed()"
            (click)="onDetailBackdrop($event)"
          >
            @if (detailItem(); as item) {
              <div class="detail-card">
                @if (item.image; as image) {
                  <img
                    class="detail-image"
                    [src]="image.url"
                    [alt]="image.alt"
                    [width]="image.width"
                    [height]="image.height"
                  />
                }
                <h2>{{ item.name }}</h2>
                @if (item.description) {
                  <p class="description">{{ item.description }}</p>
                }
                <p class="item-foot">
                  <span class="pill">{{ english ? 'Available' : 'متوفر' }}</span>
                  <span class="price">
                    <bdi>{{ item.priceText }}</bdi>
                    {{ english ? menu.restaurant.currency : 'جنيه مصري' }}
                  </span>
                </p>
                <button type="button" class="btn btn-primary detail-close" (click)="closeDetail()">
                  {{ english ? 'Back to menu' : 'الرجوع للمنيو' }}
                </button>
              </div>
            }
          </dialog>
        </div>
        <p class="display-only">
          {{
            english
              ? 'Display only. Ordering is not available on this page.'
              : 'للعرض فقط. الطلب مش متاح من الصفحة دي.'
          }}
        </p>
      } @else {
        <h1>{{ errorTitle }}</h1>
        <p>
          {{
            english
              ? 'Please check the link or try again later.'
              : 'راجع الرابط أو جرّب تاني بعد شوية.'
          }}
        </p>
      }
      <a href="/" class="btn btn-secondary home">{{ english ? 'Home' : 'الصفحة الرئيسية' }}</a>
    </main>
  `,
  styles: [
    `
      .public-menu {
        margin: 0 auto;
        padding: 0 0 var(--space-8);
        overflow-wrap: anywhere;
        background: var(--color-bg-canvas);
        font-family: 'Cairo', var(--font-family-current);
      }
      .frame {
        --tp: #0f766e;
        --hero: color-mix(in srgb, var(--tp) 45%, #1a1512);
        max-width: 430px;
        margin: 0 auto;
        padding: 0 16px;
        min-height: 100vh;
        box-shadow: 0 0 0 1px var(--color-border-subtle);
        background: var(--color-bg-canvas);
      }
      .hero {
        background: var(--hero);
        color: #fff;
        margin: 0 -16px;
        padding: 20px 20px 52px;
        border-radius: 0 0 28px 28px;
      }
      .hero-inner {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        min-height: 150px;
        position: relative;
      }
      .hero-brand {
        margin: 0;
        color: #e0b04a;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .hero-tagline {
        margin: 0;
        font-size: 13px;
        color: rgb(255 255 255 / 0.85);
      }
      .hero-cafe {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        padding-bottom: 28px;
      }
      .hero-cafe .hero-lang {
        align-self: stretch;
        display: flex;
        justify-content: flex-start;
      }
      .hero-cafe .hero-lang .language {
        background: rgb(255 255 255 / 0.14);
      }
      .hero-cafe .hero-lang .language a {
        color: #fff;
      }
      .hero-cafe .restaurant-logo {
        position: static;
        width: 160px;
        height: 160px;
        margin-top: 12px;
      }
      .hero-cafe .hero-brand {
        color: #fff;
        font-size: 22px;
        letter-spacing: 0.04em;
      }
      .hero-cafe {
        min-height: 250px;
      }
      .cafe-title {
        padding: 20px 4px 0;
      }
      .cafe-title h1 {
        margin: 0;
        font-size: 24px;
      }
      .featured-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .featured-note {
        font-size: 11px;
        color: var(--color-text-secondary);
      }
      .hero-pill {
        margin: 0;
        padding: 6px 16px;
        border-radius: 999px;
        background: rgb(0 0 0 / 0.35);
        font-size: 12px;
        font-weight: 700;
      }
      .hero h1 {
        color: #fff;
        margin: 0;
        font-size: 28px;
        line-height: 1.3;
      }
      .restaurant-logo {
        position: absolute;
        inset-block-start: 0;
        inset-inline-end: 0;
        width: 140px;
        height: 84px;
        object-fit: cover;
        border-radius: 50%;
        background: #f4e9d6;
        inset-block-start: 36px;
      }
      h1,
      h2,
      h3 {
        font-family: 'Cairo', var(--font-family-display);
        color: var(--color-brand-forest);
      }
      h3 {
        margin: 0 0 4px;
        font-size: 19px;
      }
      .brand-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: -36px;
        position: relative;
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: 18px;
        padding: 14px 16px;
        box-shadow: var(--shadow-sm);
      }
      .brand-title {
        margin: 0;
        font-family: 'Cairo', var(--font-family-display);
        font-weight: 700;
        font-size: 22px;
        color: var(--color-brand-forest);
      }
      .brand-sub {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--color-text-secondary);
      }
      .language {
        display: flex;
        flex: none;
        background: var(--color-surface-muted);
        border-radius: 999px;
        padding: 2px;
        direction: ltr;
      }
      .language a {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        min-width: 44px;
        justify-content: center;
        padding: 0 10px;
        border-radius: 999px;
        color: var(--color-brand-forest);
        font-size: 12px;
        font-weight: 700;
        text-decoration: none;
      }
      .language a[aria-current='true'] {
        background: var(--tp);
        color: #fff;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .search {
        position: relative;
        margin-top: 16px;
      }
      .search input {
        box-sizing: border-box;
        width: 100%;
        min-height: 50px;
        padding-block: 0;
        padding-inline: 44px 16px;
        border: 1px solid var(--color-border-subtle);
        border-radius: 14px;
        background: #fff;
        font: inherit;
        font-size: 14px;
      }
      .search-icon {
        position: absolute;
        inset-inline-end: 16px;
        top: 15px;
        color: var(--tp);
        pointer-events: none;
      }
      .search input {
        padding-inline: 16px 44px;
      }
      .section-title {
        margin: 22px 0 12px;
        font-size: 22px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        min-height: 34px;
        padding: 0 16px;
        border: 0;
        position: relative;
        border-radius: 999px;
        background: var(--color-surface-muted);
        color: var(--color-brand-forest);
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .chip::after {
        content: '';
        position: absolute;
        inset-block: -5px;
        inset-inline: 0;
      }
      .chip[aria-pressed='true'] {
        background: var(--tp);
        color: #fff;
      }
      .status {
        margin: 8px 0 0;
        font-size: var(--font-size-sm);
      }
      section {
        margin-block: 0 8px;
      }
      .items {
        display: grid;
        gap: 12px;
      }
      article {
        position: relative;
        display: flex;
        gap: 12px;
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: 20px;
        padding: 10px;
        box-shadow: var(--shadow-sm);
      }
      .item-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        padding-block: 4px;
      }
      .item-open {
        all: unset;
        cursor: pointer;
        min-height: 24px;
      }
      .item-open::after {
        content: '';
        position: absolute;
        inset: 0;
      }
      :focus-visible {
        outline: 3px solid var(--tp, var(--color-brand-primary));
        outline-offset: 2px;
      }
      .item-thumbnail {
        flex: none;
        width: 132px;
        height: 132px;
        object-fit: cover;
        border-radius: 14px;
      }
      .description {
        margin: 0 0 8px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .item-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 8px;
        margin: auto 0 0;
      }
      .pill {
        white-space: nowrap;
        flex: none;
        padding: 6px 14px;
        border-radius: 999px;
        background: var(--color-brand-primary-container);
        color: var(--color-brand-on-primary-container);
        font-size: 12px;
        font-weight: 700;
      }
      .price {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        white-space: nowrap;
        font-weight: 700;
        font-size: 22px;
        color: var(--color-brand-primary);
      }
      .detail {
        width: min(92vw, 480px);
        max-height: 90vh;
        padding: 0;
        border: 0;
        border-radius: var(--radius-xl);
        background: var(--color-bg-canvas);
        color: var(--color-text-primary);
      }
      .detail::backdrop {
        background: rgb(25 54 48 / 0.55);
      }
      .detail-card {
        display: grid;
        gap: var(--space-3);
        padding: var(--space-4);
      }
      .detail-image {
        width: 100%;
        height: auto;
        max-height: 50vh;
        object-fit: cover;
      }
      .display-only {
        text-align: center;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
      }
      .display-only,
      .empty {
        margin-block: var(--space-6);
      }
      .home {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
      }
    `,
  ],
})
export class PublicMenuComponent {
  readonly query = signal('');
  readonly selected = signal<string | null>(null);
  readonly detailItem = signal<DisplayItem | null>(null);
  private readonly detail = viewChild<ElementRef<HTMLDialogElement>>('detail');
  private opener: HTMLElement | null = null;
  // Featured items only on the unfiltered view, so search and category filters stay predictable.
  readonly featuredItems = computed(() => {
    const menu = this.page.menu;
    if (!menu || this.query().trim() !== '' || this.selected() !== null) return [];
    return menu.categories.flatMap((c) => c.items.filter((i) => i.featured));
  });

  featuredTitle(theme: 'classic' | 'cafe'): string {
    if (theme === 'cafe') return this.english ? 'Favorite coffee' : 'القهوة المفضلة';
    return this.english ? 'Featured picks' : 'اختيارات مميزة';
  }

  readonly visibleCategories = computed(() => {
    const menu = this.page.menu;
    if (!menu) return [];
    const needle = normalizeSearch(this.query());
    const selected = this.selected();
    return menu.categories
      .filter((c) => selected === null || c.id === selected)
      .map((c) => ({
        ...c,
        items: needle
          ? c.items.filter((i) => normalizeSearch(i.name + ' ' + i.description).includes(needle))
          : c.items,
      }))
      .filter((c) => needle === '' || c.items.length > 0);
  });
  get statusText(): string {
    const count = this.visibleCategories().reduce((n, c) => n + c.items.length, 0);
    if (this.query().trim() === '' && this.selected() === null) return '';
    if (count === 0) return this.english ? 'No matching dishes.' : 'مفيش أصناف مطابقة.';
    return this.english ? count + ' dish(es) shown' : 'تم عرض ' + count + ' صنف';
  }
  setQuery(value: string) {
    this.query.set(value);
  }
  select(id: string | null) {
    this.selected.set(id);
  }
  open(item: DisplayItem, event: Event) {
    this.opener = event.currentTarget as HTMLElement;
    this.detailItem.set(item);
    const dialog = this.detail()?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }
  closeDetail() {
    this.detail()?.nativeElement.close();
  }
  onDetailClosed() {
    this.detailItem.set(null);
    this.opener?.focus();
    this.opener = null;
  }
  onDetailBackdrop(event: MouseEvent) {
    const dialog = this.detail()?.nativeElement;
    if (event.target !== dialog || !dialog) return;
    // Clicks on the dialog's own scrollbar or blank interior also target it,
    // so close only when the pointer is outside the dialog box (the backdrop).
    const r = dialog.getBoundingClientRect();
    const outside =
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom;
    if (outside) this.closeDetail();
  }
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  get page(): PublicPage {
    return this.data()['menu'] as PublicPage;
  }
  currencyAr(code: string): string {
    return code === 'EGP' ? 'ج.م' : code;
  }

  get english() {
    return this.page.language === 'en';
  }
  get errorTitle() {
    return this.page.status === 404
      ? this.english
        ? 'Menu not found'
        : 'المنيو مش موجود'
      : this.page.status === 400
        ? this.english
          ? 'Invalid menu link'
          : 'رابط المنيو غير صحيح'
        : this.english
          ? 'Menu temporarily unavailable'
          : 'المنيو غير متاح مؤقتًا';
  }
  constructor() {
    const document = inject(DOCUMENT);
    const meta = inject(Meta);
    const title = inject(Title);
    effect(() => {
      // A reused component must not carry search, category or an open dish
      // dialog over to a different menu or language.
      const page = this.page;
      void [page.menu?.restaurant.slug, page.language, page.status];
      untracked(() => {
        this.query.set('');
        this.selected.set(null);
        const dialog = this.detail()?.nativeElement;
        this.opener = null;
        if (dialog?.open) dialog.close();
        this.detailItem.set(null);
      });
    });
    effect(() => {
      document.documentElement.lang = this.page.language;
      document.documentElement.dir = this.english ? 'ltr' : 'rtl';
      const menu = this.page.menu;
      title.setTitle(
        menu ? menu.restaurant.name + (this.english ? ' | Menu' : ' | المنيو') : this.errorTitle,
      );
      meta.updateTag({
        name: 'description',
        content: menu
          ? (this.english ? 'Menu of ' : 'منيو ') + menu.restaurant.name
          : this.errorTitle,
      });
      meta.updateTag({ name: 'robots', content: menu ? 'index,follow' : 'noindex,nofollow' });
      // Reset the managed og:image on every page change so route reuse or an
      // error state cannot leave a previous menu's logo in document.head.
      meta.removeTag('property="og:image"');
      document
        .querySelectorAll('link[rel="canonical"], script[type="application/ld+json"]')
        .forEach((element) => element.remove());
      if (menu) {
        const canonical = document.createElement('link');
        canonical.rel = 'canonical';
        canonical.href = this.page.publicOrigin + '/r/' + menu.restaurant.slug;
        document.head.appendChild(canonical);
        if (menu.restaurant.logoUrl) {
          meta.updateTag({
            property: 'og:image',
            content: this.page.publicOrigin + menu.restaurant.logoUrl,
          });
        }
      }
    });
  }
}
