import { toSignal } from '@angular/core/rxjs-interop';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
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
  imports: [],
  template: `
    <main class="public-menu">
      @if (page.menu; as menu) {
        <header class="hero" [style.border-bottom-color]="menu.restaurant.primaryColor">
          <div class="hero-inner">
            @if (menu.restaurant.logoUrl; as logoUrl) {
              <img
                class="restaurant-logo"
                [src]="logoUrl"
                [alt]="menu.restaurant.name"
                width="96"
                height="96"
              />
            }
            <div>
              <p class="hero-kicker">{{ english ? 'Digital menu' : 'قائمة رقمية' }}</p>
              <h1>{{ menu.restaurant.name }}</h1>
            </div>
          </div>
        </header>
        <div class="toolbar">
          <nav class="language" aria-label="Language">
            <a
              [href]="'/r/' + menu.restaurant.slug + '?lang=ar'"
              lang="ar"
              [attr.aria-current]="english ? null : 'true'"
              >العربية</a
            >
            <a
              [href]="'/r/' + menu.restaurant.slug + '?lang=en'"
              lang="en"
              [attr.aria-current]="english ? 'true' : null"
              >English</a
            >
          </nav>
          @if (menu.categories.length > 0) {
            <div class="search">
              <label for="menu-search">{{ english ? 'Search the menu' : 'ابحث في المنيو' }}</label>
              <input
                id="menu-search"
                type="search"
                autocomplete="off"
                [placeholder]="english ? 'Search dishes' : 'ابحث عن صنف'"
                [value]="query()"
                (input)="setQuery($any($event.target).value)"
              />
            </div>
            <div class="chips" role="group" [attr.aria-label]="english ? 'Categories' : 'الأقسام'">
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
        </div>
        @if (menu.categories.length === 0) {
          <p class="empty">
            {{ english ? 'The menu is currently empty.' : 'المنيو فاضي حاليًا.' }}
          </p>
        }
        @for (category of visibleCategories(); track category.id; let ci = $index) {
          <section
            [attr.aria-labelledby]="'category-' + ci"
            [style.border-color]="menu.restaurant.primaryColor"
          >
            <h2 [id]="'category-' + ci">{{ category.name }}</h2>
            @if (category.items.length === 0) {
              <p>{{ english ? 'No available items.' : 'مفيش أصناف متاحة حاليًا.' }}</p>
            }
            <div class="items">
              @for (item of category.items; track item.id) {
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
                      <span class="pill">{{ english ? 'Available' : 'متوفر' }}</span>
                      <span class="price">
                        <bdi>{{ item.priceText }}</bdi>
                        {{ english ? menu.restaurant.currency : 'جنيه مصري' }}
                      </span>
                    </p>
                  </div>
                </article>
              }
            </div>
          </section>
        }
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
        max-width: 1040px;
        margin: auto;
        padding: 0 var(--space-4) var(--space-8);
        min-height: 100vh;
        overflow-wrap: anywhere;
      }
      .hero {
        background: var(--color-brand-forest);
        color: var(--color-text-inverse);
        border-bottom: 4px solid var(--color-brand-primary);
        border-radius: 0 0 var(--radius-xl) var(--radius-xl);
        margin: 0 calc(var(--space-4) * -1) var(--space-5);
        padding: var(--space-6) var(--space-5);
      }
      .hero-inner {
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }
      .hero-kicker {
        margin: 0 0 var(--space-1);
        font-size: var(--font-size-sm);
        color: var(--color-brand-primary-container);
      }
      .hero h1 {
        color: var(--color-text-inverse);
        margin: 0;
      }
      h1,
      h2,
      h3 {
        font-family: var(--font-family-display);
        color: var(--color-brand-forest);
      }
      h1 {
        font-size: var(--font-size-3xl);
      }
      h2 {
        font-size: var(--font-size-xl);
      }
      h3 {
        font-size: var(--font-size-lg);
        margin: 0 0 var(--space-2);
      }
      .toolbar {
        display: grid;
        gap: var(--space-3);
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-4);
        box-shadow: var(--shadow-sm);
      }
      .language {
        display: flex;
        gap: var(--space-2);
      }
      .language a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 var(--space-4);
        border-radius: 999px;
        background: var(--color-surface-muted);
        color: var(--color-brand-forest);
        font-weight: 600;
        text-decoration: none;
      }
      .language a[aria-current='true'] {
        background: var(--color-brand-primary);
        color: var(--color-brand-on-primary);
      }
      .language a:focus-visible,
      .chip:focus-visible,
      .item-open:focus-visible,
      .search input:focus-visible,
      .detail-close:focus-visible {
        outline: 3px solid var(--color-brand-primary);
        outline-offset: 2px;
      }
      .search label {
        display: block;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-1);
      }
      .search input {
        box-sizing: border-box;
        width: 100%;
        min-height: 44px;
        padding: 0 var(--space-4);
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-lg, var(--radius-xl));
        background: var(--color-surface-subtle);
        font: inherit;
        color: var(--color-text-primary);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .chip {
        min-height: 44px;
        padding: 0 var(--space-4);
        border: 1px solid var(--color-border-strong);
        border-radius: 999px;
        background: var(--color-surface-muted);
        color: var(--color-brand-forest);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .chip[aria-pressed='true'] {
        background: var(--color-brand-primary);
        border-color: var(--color-brand-primary);
        color: var(--color-brand-on-primary);
      }
      .status {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      section {
        border-block-start: 2px solid;
        margin-block: var(--space-6);
      }
      .items {
        display: grid;
        gap: var(--space-4);
        grid-template-columns: 1fr;
      }
      @media (min-width: 768px) {
        .items {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .public-menu {
          padding-inline: var(--space-6);
        }
        .hero {
          margin-inline: calc(var(--space-6) * -1);
          padding-inline: var(--space-8);
        }
      }
      article {
        position: relative;
        display: flex;
        gap: var(--space-4);
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-4);
        box-shadow: var(--shadow-sm);
      }
      .item-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .item-open {
        all: unset;
        cursor: pointer;
        display: block;
        min-height: 44px;
        box-sizing: border-box;
      }
      .item-open::after {
        content: '';
        position: absolute;
        inset: 0;
      }
      .restaurant-logo {
        width: 72px;
        height: 72px;
        object-fit: contain;
        background: var(--color-surface-card);
        border-radius: var(--radius-xl);
      }
      .item-thumbnail {
        flex: none;
        width: 96px;
        height: 96px;
        object-fit: cover;
        border-radius: var(--radius-lg, var(--radius-xl));
        background: var(--color-border-subtle);
      }
      .description {
        margin: 0 0 var(--space-2);
        white-space: pre-wrap;
        color: var(--color-text-secondary);
      }
      .item-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin: auto 0 0;
      }
      .pill {
        padding: var(--space-1) var(--space-3);
        border-radius: 999px;
        background: var(--color-brand-primary-container);
        color: var(--color-brand-on-primary-container);
        font-size: var(--font-size-sm);
        font-weight: 600;
      }
      .price {
        font-weight: 700;
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
        box-shadow: var(--shadow-lg, 0 20px 40px rgb(0 0 0 / 0.25));
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
        border-radius: var(--radius-lg, var(--radius-xl));
      }
      .detail-card h2 {
        margin: 0;
      }
      .detail-close {
        min-height: 48px;
      }
      .display-only {
        text-align: center;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        margin-block: var(--space-6);
      }
      .home {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
      }
      .empty {
        margin-block: var(--space-6);
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
    if (event.target === this.detail()?.nativeElement) this.closeDetail();
  }
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  get page(): PublicPage {
    return this.data()['menu'] as PublicPage;
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
