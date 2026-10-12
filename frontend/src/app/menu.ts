import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { demo, publicOrigin } from './demo';

@Component({
  selector: 'app-menu',
  template: `
    <main class="demo-menu-container">
      <div class="demo-banner">
        <span class="badge badge-forest">قائمة تجريبية — للعرض فقط</span>
        <p class="demo-note">قائمة تجريبية — بيانات وهمية</p>
      </div>
      <header class="demo-header">
        <h1 class="demo-restaurant-name">{{ menu.name }}</h1>
        <p class="demo-restaurant-tagline">منيو رقمي للعرض فقط على الطاولات</p>
      </header>
      <section aria-labelledby="category" class="demo-category-section">
        <h2 id="category" class="demo-category-title">{{ menu.category }}</h2>
        <article class="demo-item-card">
          <div class="demo-item-header">
            <h3 class="demo-item-title">{{ menu.item }}</h3>
            <span class="badge badge-success badge-sm">متوفر</span>
          </div>
          <p class="demo-item-desc">{{ menu.description }}</p>
          <div class="demo-item-footer">
            <p class="demo-item-price">{{ menu.price }} جنيه مصري</p>
          </div>
        </article>
      </section>
      <nav class="demo-nav-back">
        <a href="/" class="btn btn-secondary">الصفحة الرئيسية</a>
      </nav>
    </main>
  `,
  styles: [
    `
      .demo-menu-container {
        max-width: 680px;
        margin: 0 auto;
        padding: var(--space-8) var(--space-4);
        min-height: 100vh;
      }
      .demo-banner {
        text-align: center;
        margin-bottom: var(--space-6);
      }
      .demo-note {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin: var(--space-2) 0 0;
      }
      .demo-header {
        text-align: center;
        margin-bottom: var(--space-8);
        padding-bottom: var(--space-6);
        border-bottom: 1px solid var(--color-border-subtle);
      }
      .demo-restaurant-name {
        font-family: var(--font-family-display);
        font-size: var(--font-size-3xl);
        font-weight: var(--font-weight-extrabold);
        color: var(--color-brand-forest);
        margin: 0 0 var(--space-2);
      }
      .demo-restaurant-tagline {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }
      .demo-category-section {
        margin-bottom: var(--space-8);
      }
      .demo-category-title {
        font-family: var(--font-family-display);
        font-size: var(--font-size-xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-brand-forest);
        margin: 0 0 var(--space-4);
        padding-bottom: var(--space-2);
        border-bottom: 2px solid var(--color-brand-primary-container);
        display: inline-block;
      }
      .demo-item-card {
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-5);
        box-shadow: var(--shadow-sm);
      }
      .demo-item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }
      .demo-item-title {
        font-family: var(--font-family-display);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0;
      }
      .demo-item-desc {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-3);
        line-height: var(--line-height-normal);
      }
      .demo-item-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }
      .demo-item-price {
        font-family: var(--font-family-display);
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-brand-primary);
        margin: 0;
      }
      .demo-nav-back {
        text-align: center;
        margin-top: var(--space-8);
      }
    `,
  ],
})
export class Menu {
  readonly menu = demo;
  constructor() {
    inject(Title).setTitle(demo.name + ' | القائمة التجريبية');
    inject(Meta).updateTag({
      name: 'description',
      content: demo.description + ' — قائمة تجريبية ببيانات وهمية.',
    });
    inject(Meta).updateTag({ name: 'robots', content: 'index,follow' });
    const document = inject(DOCUMENT);
    const canonical =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = publicOrigin + '/r/demo';
    document.head.appendChild(canonical);
    const schema =
      document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]') ??
      document.createElement('script');
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: demo.name,
      url: canonical.href,
      menu: canonical.href,
    }).replace(/</g, '\\u003c');
    document.head.appendChild(schema);
  }
}
