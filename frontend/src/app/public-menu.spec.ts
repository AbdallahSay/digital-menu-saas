import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { PublicMenuComponent } from './public-menu';
import type { DisplayMenu, PublicPage } from './public-menu-contract';

function displayMenu(logoUrl: string | null): DisplayMenu {
  return {
    restaurant: {
      name: 'Public',
      slug: 'a',
      primaryColor: '#123456',
      currency: 'EGP',
      logoUrl,
    },
    language: 'ar',
    publishedMenuVersion: 1,
    categories: [],
  };
}

function page(menu: DisplayMenu | null, status: PublicPage['status'] = 200): PublicPage {
  return { slug: 'a', language: 'ar', status, publicOrigin: 'https://menu.example', menu };
}

function ogImage(): string | null {
  return document.head.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null;
}

describe('PublicMenuComponent managed og:image', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[property="og:image"]').forEach((e) => e.remove());
  });

  async function create(initial: PublicPage) {
    const data = new BehaviorSubject({ menu: initial });
    await TestBed.configureTestingModule({
      imports: [PublicMenuComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { data: data.asObservable(), snapshot: { data: { menu: initial } } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PublicMenuComponent);
    fixture.detectChanges();
    return { fixture, data };
  }

  it('sets og:image from the logo and removes it on logo-to-no-logo and error transitions', async () => {
    const { fixture, data } = await create(
      page(displayMenu('/api/v1/public/media/logo/0123456789abcdef0123')),
    );
    expect(ogImage()).toBe('https://menu.example/api/v1/public/media/logo/0123456789abcdef0123');

    // Route reuse with a logo-less menu: the previous logo must not linger.
    data.next({ menu: page(displayMenu(null)) });
    fixture.detectChanges();
    expect(ogImage()).toBeNull();

    // A later menu with a different logo replaces the tag.
    data.next({ menu: page(displayMenu('/api/v1/public/media/logo/00112233445566778899')) });
    fixture.detectChanges();
    expect(ogImage()).toBe('https://menu.example/api/v1/public/media/logo/00112233445566778899');

    // An unavailable menu clears the tag as well.
    data.next({ menu: page(null, 404) });
    fixture.detectChanges();
    expect(ogImage()).toBeNull();
  });
});
