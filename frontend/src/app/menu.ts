import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { demo, publicOrigin } from './demo';

@Component({
  selector: 'app-menu',
  template: `
    <main>
      <p>قائمة تجريبية — بيانات وهمية</p>
      <h1>{{ menu.name }}</h1>
      <section aria-labelledby="category">
        <h2 id="category">{{ menu.category }}</h2>
        <article>
          <h3>{{ menu.item }}</h3>
          <p>{{ menu.description }}</p>
          <p>{{ menu.price }} جنيه مصري</p>
        </article>
      </section>
      <a href="/">الصفحة الرئيسية</a>
    </main>
  `,
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
