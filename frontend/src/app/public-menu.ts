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
        <div
          class="frame"
          [class.searching]="query().trim() !== ''"
          [style.--tp]="menu.restaurant.primaryColor"
        >
          @if (menu.restaurant.theme === 'cafe') {
            <header class="hero hero-cafe">
              @if (menu.restaurant.brandLabel) {
                <p class="hero-brand">{{ menu.restaurant.brandLabel }}</p>
              }
              @if (menu.restaurant.tagline) {
                <p class="hero-tagline">{{ menu.restaurant.tagline }}</p>
              }
              @if (menu.restaurant.heroUrl ?? menu.restaurant.logoUrl; as logoUrl) {
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
                {{ subtitle(menu.restaurant.theme) }}
              </p>
            </div>
          } @else {
            <header class="hero">
              <div class="hero-inner" [class.has-art]="!!(menu.restaurant.heroUrl ?? menu.restaurant.logoUrl)">
                @if (menu.restaurant.brandLabel) {
                  <p class="hero-brand">{{ menu.restaurant.brandLabel }}</p>
                }
                <h1>{{ menu.restaurant.name }}</h1>
                @if (menu.restaurant.tagline) {
                  <p class="hero-tagline">{{ menu.restaurant.tagline }}</p>
                }
                <p class="hero-pill">{{ english ? 'Digital menu' : 'قائمة رقمية' }}</p>
                <p class="hero-note" aria-hidden="true">
                  {{ english ? 'Food that tells a story' : 'طعام بيحكي حكاية' }}
                </p>
                @if (menu.restaurant.heroUrl ?? menu.restaurant.logoUrl; as logoUrl) {
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
              <div class="brand-text">
                <p class="brand-title">
                  {{ english ? 'Menu' : 'منيو' }} {{ menu.restaurant.name }}
                </p>
                <p class="brand-sub">{{ subtitle(menu.restaurant.theme) }}</p>
              </div>
              <nav class="language" aria-label="Language">
                <a
                  [href]="'/r/' + menu.restaurant.slug + '?lang=en'"
                  lang="en"
                  [attr.aria-current]="english ? 'true' : null"
                  >EN</a
                >
                <a
                  [href]="'/r/' + menu.restaurant.slug + '?lang=ar'"
                  lang="ar"
                  [attr.aria-current]="english ? null : 'true'"
                  >عربي</a
                >
              </nav>
            </div>
          }
          @if (menu.categories.length > 0) {
            <h2 class="search-title">{{ english ? 'Search the menu' : 'بحث في المنيو' }}</h2>
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
                [placeholder]="searchPlaceholder(menu.restaurant.theme)"
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
              @if (menu.restaurant.theme !== 'cafe') {
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="selected() === null"
                  (click)="select(null)"
                >
                  {{ english ? 'All' : 'الكل' }}
                </button>
              }
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
          @if (query().trim() !== '') {
            <section aria-labelledby="results-title">
              <h2 class="section-title" id="results-title">
                {{ english ? 'Results' : 'نتائج البحث' }} ({{ searchHits().on.length }})
              </h2>
              <div class="items">
                @for (item of searchHits().on; track item.id) {
                  <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
                }
              </div>
            </section>
            @if (searchHits().off.length > 0) {
              <section aria-labelledby="off-title">
                <h2 class="section-title" id="off-title">
                  {{ english ? 'Availability' : 'حالات العرض' }}
                </h2>
                <div class="items">
                  @for (item of searchHits().off; track item.id) {
                    <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
                  }
                </div>
              </section>
            }
            @if (searchHits().on.length === 0) {
              <div class="no-results">
                <p class="no-results-title">
                  {{ english ? "Can't find the dish you want?" : 'ملقتش الطبق اللي بتدور عليه؟' }}
                </p>
                <p class="no-results-sub">
                  {{
                    english
                      ? 'Try another name or browse all categories.'
                      : 'جرب اسم تاني أو استعرض كل الأقسام.'
                  }}
                </p>
              </div>
            }
          }
          @if (query().trim() === '' && featuredItems().length > 0) {
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
          @for (
            category of query().trim() === ''
              ? menu.restaurant.theme === 'cafe'
                ? cafeRest()
                : visibleCategories()
              : [];
            track category.id;
            let ci = $index
          ) {
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
                  <span class="pill" [class.pill-off]="!item.available">{{
                    item.available
                      ? english
                        ? 'Available'
                        : 'متوفر'
                      : english
                        ? 'Sold out'
                        : 'نفد'
                  }}</span>
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
                <div class="detail-hero">
                  <button
                    type="button"
                    class="detail-x"
                    [attr.aria-label]="english ? 'Close' : 'إغلاق'"
                    (click)="closeDetail()"
                  >
                    ×
                  </button>
                  @if (item.image; as image) {
                    <img
                      class="detail-image"
                      [src]="image.url"
                      [alt]="image.alt"
                      [width]="image.width"
                      [height]="image.height"
                      (error)="imageFailed($event)"
                    />
                  }
                </div>
                <div class="detail-body">
                  <h2>{{ item.name }}</h2>
                  @if (categoryOf(item); as cat) {
                    <p class="detail-cat">{{ cat }}</p>
                  }
                  <p class="detail-avail">
                    <span class="pill" [class.pill-off]="!item.available">{{
                      item.available
                        ? english
                          ? 'Available now'
                          : 'متوفر الآن'
                        : english
                          ? 'Sold out'
                          : 'نفد'
                    }}</span>
                  </p>
                  @if (item.description) {
                    <h3>{{ english ? 'About the dish' : 'عن الطبق' }}</h3>
                    <p class="description">{{ item.description }}</p>
                  }
                  <p class="detail-price">
                    <span class="detail-price-label">{{ english ? 'Price' : 'السعر' }}</span>
                    <span class="price">
                      <bdi>{{ item.priceText }}</bdi>
                      {{ english ? menu.restaurant.currency : 'جنيه مصري' }}
                    </span>
                  </p>
                  <button
                    type="button"
                    class="btn btn-primary detail-close"
                    (click)="closeDetail()"
                  >
                    {{ english ? 'Back to menu' : 'الرجوع للمنيو' }}
                  </button>
                  <p class="detail-note">
                    {{
                      english
                        ? 'Display only. Ordering is not available on this page.'
                        : 'العرض فقط، لا نقوم بطلبات داخل الموقع'
                    }}
                  </p>
                </div>
              </div>
            }
          </dialog>
        </div>
        @if (page.menu?.restaurant?.theme === 'cafe') {
          <nav class="language footer-lang" aria-label="Language">
            <a
              [href]="'/r/' + page.menu!.restaurant.slug + '?lang=en'"
              lang="en"
              [attr.aria-current]="english ? 'true' : null"
              >EN</a
            >
            <a
              [href]="'/r/' + page.menu!.restaurant.slug + '?lang=ar'"
              lang="ar"
              [attr.aria-current]="english ? null : 'true'"
              >عربي</a
            >
          </nav>
        }
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
        overflow-wrap: anywhere;
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
        padding: 20px;
        border-radius: 0 0 28px 28px;
        position: relative;
        overflow: hidden;
      }
      /* Figma classic hero: a darker panel on the physical left edge. */
      .hero:not(.hero-cafe)::before {
        content: '';
        position: absolute;
        left: 0;
        top: 12px;
        width: 90px;
        height: 236px;
        border-radius: 0 40px 40px 0;
        background: #00000014;
      }
      .hero-inner {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        min-height: 215px;
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
      .hero-inner .hero-brand {
        margin-bottom: 27px;
      }
      .hero-note,
      .hero-tagline {
        margin: 0;
        font-size: 13px;
        color: rgb(255 255 255 / 0.85);
      }
      .hero-note {
        margin-top: 11px;
        color: #fff7;
      }
      .hero-cafe {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        position: relative;
        min-height: 280px;
        padding: 30px 20px 32px;
      }
      .footer-lang {
        width: fit-content;
        margin: 16px auto 0;
      }
      .hero-cafe .restaurant-logo {
        position: static;
        width: 144px;
        height: 144px;
        margin-top: 6px;
      }
      .hero-cafe .hero-brand {
        color: #fff;
        font-size: 22px;
        letter-spacing: 0.04em;
      }
      .cafe-title {
        padding: 31px 4px 0;
      }
      .cafe-title .brand-sub {
        margin-top: 8px;
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
        margin: 14px 0 0;
        min-width: 130px;
        padding: 6px 16px;
        text-align: center;
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
        inset-inline-end: 0;
        width: 130px;
        height: 90px;
        object-fit: cover;
        border-radius: 50%;
        background: #f4e9d6;
        top: 65px;
      }
      .has-art > :not(.restaurant-logo) {
        max-width: calc(100% - 140px);
      }
      @media (max-width: 360px) {
        .has-art > :not(.restaurant-logo) {
          max-width: calc(100% - 110px);
        }
        .restaurant-logo {
          width: 100px;
        }
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
        margin-top: -27px;
        position: relative;
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: 18px;
        padding: 10px 16px;
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
      .language a:last-child::before {
        content: '|';
        margin-inline-end: 8px;
        color: var(--color-text-secondary);
        font-weight: 400;
      }
      .language a {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        min-width: 44px;
        justify-content: center;
        padding: 0 10px;
        border-radius: 999px;
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 700;
        text-decoration: none;
      }
      .language a[aria-current='true'] {
        color: var(--color-brand-forest);
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
        width: 100%;
        min-height: 50px;
        padding-block: 0;
        padding-inline: 16px 52px;
        border: 1px solid var(--color-border-subtle);
        border-radius: 14px;
        background: #fff;
        font: inherit;
        font-size: 14px;
      }
      .brand-card ~ .search {
        margin-top: 26px;
      }
      .search-icon {
        position: absolute;
        inset-inline-end: 30px;
        top: 14px;
        color: var(--tp);
        pointer-events: none;
      }
      .section-title {
        margin: 22px 0 12px;
        font-size: 22px;
      }
      .chips {
        display: flex;
        flex-wrap: nowrap;
        gap: 8px;
        overflow-x: auto;
        padding-block: 4px;
        scrollbar-width: none;
      }
      .chips::-webkit-scrollbar {
        display: none;
      }
      .cafe-title ~ .search {
        margin-top: 36px;
      }
      .cafe-title ~ .search input {
        min-height: 54px;
      }
      .cafe-title ~ .chips {
        margin-top: 30px;
      }
      .chip {
        flex: none;
        white-space: nowrap;
        min-height: 30px;
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
        inset: -5px 0;
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
        gap: 22px;
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
        width: 128px;
        height: 128px;
        object-fit: cover;
        border-radius: 14px;
        background: #f5ece0;
      }
      .description {
        margin: 0 0 8px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-secondary);
      }
      article .description {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      dialog .description {
        display: block;
        overflow: visible;
        font-size: 14px;
        line-height: 2;
        -webkit-line-clamp: unset;
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
        background: #dfeee7;
        color: #4d7b6f;
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
      .search-title {
        display: none;
        margin: 0;
        padding: 32px 22px 16px;
        font-size: 24px;
      }
      .searching .search-title {
        display: block;
      }
      .searching .hero,
      .searching .brand-card,
      .searching .cafe-title,
      .searching .chips,
      .searching .status,
      .cafe-title ~ .status,
      .searching #categories-title {
        display: none;
      }
      .pill-off {
        background: #ece8de;
        color: var(--color-text-secondary);
      }
      .no-results {
        margin: 24px 16px;
        padding: 20px 16px;
        border-radius: 16px;
        background: #e3f1ec;
        text-align: start;
      }
      .no-results p {
        margin: 0;
      }
      .no-results-title {
        font-weight: 700;
        color: var(--color-brand-primary);
      }
      .no-results-sub {
        margin-top: 6px !important;
        font-size: 12px;
        color: var(--color-text-secondary);
      }
      .detail {
        width: min(100vw, 390px);
        max-width: none;
        max-height: 100dvh;
        margin: 0 auto;
        padding: 0;
        border: 0;
        border-radius: 0;
        overflow: auto;
        background: var(--color-bg-canvas);
        color: var(--color-text-primary);
      }
      .detail::backdrop {
        background: rgb(25 54 48 / 0.55);
      }
      .detail-card {
        display: block;
      }
      .detail-hero {
        position: relative;
        display: grid;
        place-items: center;
        height: 330px;
        background: color-mix(in srgb, var(--tp, #0f766e) 30%, #0b1f1b);
        border-radius: 0 0 24px 24px;
      }
      .detail-x {
        position: absolute;
        left: 20px;
        top: 24px;
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 50%;
        background: #fff;
        color: #1c2b27;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
      }
      .detail-image {
        width: 296px;
        height: 200px;
        object-fit: contain;
      }
      .detail-image.broken {
        visibility: hidden;
      }
      .detail-body {
        display: grid;
        gap: 12px;
        padding: 28px 22px 22px;
        text-align: start;
      }
      .detail-body h2 {
        margin: 0;
        text-align: start;
        font-size: 28px;
        margin-top: 12px;
      }
      .detail-cat {
        margin: 0;
        text-align: start;
        font-size: 12px;
        color: var(--color-text-secondary);
      }
      .detail-avail {
        margin: 6px 0 14px;
        text-align: start;
      }
      .detail-body h3 {
        margin: 8px 0 0;
        font-size: 18px;
      }
      .detail-price {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 8px 0 0;
        padding-top: 14px;
        border-top: 1px solid var(--color-border, #e6e1d6);
      }
      .detail-price-label {
        font-size: 11px;
        color: var(--color-text-secondary);
      }
      .detail-close {
        width: 100%;
        margin-top: 10px;
      }
      .detail-note {
        margin: 0;
        text-align: center;
        font-size: 10px;
        color: var(--color-text-secondary);
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
    if (!menu || this.query().trim() !== '') return [];
    const sel = this.selected();
    if (menu.restaurant.theme === 'cafe')
      return menu.categories
        .filter((c) => c.id === sel)
        .flatMap((c) => c.items.filter((i) => i.featured));
    if (sel !== null) return [];
    return menu.categories.flatMap((c) => c.items.filter((i) => i.featured));
  });

  searchPlaceholder(theme: 'classic' | 'cafe'): string {
    if (theme === 'cafe')
      return this.english ? 'Search drinks or desserts' : 'ابحث عن مشروب أو حلوى';
    return this.english ? 'What are you craving today?' : 'بتدور على إيه النهارده؟';
  }

  subtitle(theme: 'classic' | 'cafe'): string {
    if (theme === 'cafe')
      return this.english ? 'A curated menu of coffee and sweets' : 'منيو مختار للقهوة والحلويات';
    return this.english ? 'Enjoy the best dishes' : 'استمتع بأفضل الأطباق';
  }

  featuredTitle(theme: 'classic' | 'cafe'): string {
    if (theme === 'cafe') return this.english ? 'Favorite coffee' : 'القهوة المفضلة';
    return this.english ? 'Featured picks' : 'اختيارات مميزة';
  }

  readonly searchHits = computed(() => {
    const menu = this.page.menu;
    const needle = normalizeSearch(this.query());
    const all = (menu?.categories ?? []).flatMap((c) =>
      c.items.filter(
        (i) => needle !== '' && normalizeSearch(i.name + ' ' + i.description).includes(needle),
      ),
    );
    return { on: all.filter((i) => i.available), off: all.filter((i) => !i.available) };
  });

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
  readonly cafeRest = computed(() => {
    const cats = this.visibleCategories();
    return cats
      .map((c) => ({ ...c, items: c.items.filter((i) => !i.featured) }))
      .filter((c) => c.items.length > 0);
  });
  get statusText(): string {
    const searching = this.query().trim() !== '';
    const count = searching
      ? this.searchHits().on.length
      : this.visibleCategories().reduce((n, c) => n + c.items.length, 0);
    if (!searching && this.selected() === null) return '';
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
  imageFailed(event: Event): void {
    (event.target as HTMLImageElement).classList.add('broken');
  }
  categoryOf(item: DisplayItem): string | null {
    for (const c of this.page.menu?.categories ?? [])
      if (c.items.some((i) => i.id === item.id)) return c.name;
    return null;
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
        this.selected.set(
          page.menu?.restaurant.theme === 'cafe' ? (page.menu.categories[0]?.id ?? null) : null,
        );
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
