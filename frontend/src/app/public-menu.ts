import { toSignal } from '@angular/core/rxjs-interop';
import { Component, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import type { PublicPage } from './public-menu-contract';

@Component({
  selector: 'app-public-menu',
  template: `
    <main class="public-menu">
      @if (page.menu; as menu) {
        <header>
          <h1>{{ menu.restaurant.name }}</h1>
          <nav aria-label="Language">
            <a [href]="'/r/' + menu.restaurant.slug + '?lang=ar'" lang="ar">العربية</a>
            <a [href]="'/r/' + menu.restaurant.slug + '?lang=en'" lang="en">English</a>
          </nav>
        </header>
        @if (menu.categories.length === 0) {
          <p>{{ english ? 'The menu is currently empty.' : 'المنيو فاضي حاليًا.' }}</p>
        }
        @for (category of menu.categories; track category.id; let ci = $index) {
          <section
            [attr.aria-labelledby]="'category-' + ci"
            [style.border-color]="menu.restaurant.primaryColor"
          >
            <h2 [id]="'category-' + ci">{{ category.name }}</h2>
            @if (category.items.length === 0) {
              <p>{{ english ? 'No available items.' : 'مفيش أصناف متاحة حاليًا.' }}</p>
            }
            @for (item of category.items; track item.id) {
              <article>
                <h3>{{ item.name }}</h3>
                <p class="description">{{ item.description }}</p>
                <p class="price">
                  <bdi>{{ item.priceText }}</bdi>
                  {{ english ? menu.restaurant.currency : 'جنيه مصري' }}
                </p>
              </article>
            }
          </section>
        }
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
      <a href="/" class="btn btn-secondary">{{ english ? 'Home' : 'الصفحة الرئيسية' }}</a>
    </main>
  `,
  styles: [
    `
      .public-menu {
        max-width: 680px;
        margin: auto;
        padding: var(--space-8) var(--space-4);
        min-height: 100vh;
        overflow-wrap: anywhere;
      }
      header {
        text-align: center;
        margin-bottom: var(--space-8);
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
      }
      nav {
        display: flex;
        justify-content: center;
        gap: var(--space-4);
      }
      nav a {
        padding: var(--space-3);
      }
      section {
        border-block-start: 2px solid;
        margin-block: var(--space-6);
      }
      article {
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-5);
        margin-block: var(--space-4);
        box-shadow: var(--shadow-sm);
      }
      .description {
        white-space: pre-wrap;
      }
      .price {
        font-weight: 700;
        color: var(--color-brand-primary);
      }
    `,
  ],
})
export class PublicMenuComponent {
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
      document
        .querySelectorAll('link[rel="canonical"], script[type="application/ld+json"]')
        .forEach((element) => element.remove());
      if (menu) {
        const canonical = document.createElement('link');
        canonical.rel = 'canonical';
        canonical.href = this.page.publicOrigin + '/r/' + menu.restaurant.slug;
        document.head.appendChild(canonical);
      }
    });
  }
}
