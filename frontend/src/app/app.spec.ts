import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Menu } from './menu';
import { DOCUMENT } from '@angular/common';

describe('Foundation', () => {
  it('creates the routed application', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
  it('renders the fake menu with Arabic semantics and metadata', async () => {
    await TestBed.configureTestingModule({ imports: [Menu] }).compileComponents();
    const fixture = TestBed.createComponent(Menu);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('مطعم التجربة');
    expect(fixture.nativeElement.textContent).toContain('قهوة عربية');
    const document = TestBed.inject(DOCUMENT);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'http://localhost:4000/r/demo',
    );
    const schema = document.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(schema?.textContent ?? '{}')['@type']).toBe('Restaurant');
  });
});
