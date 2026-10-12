import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Menu } from './menu';
import { Marketing } from './marketing';
import { NotFound } from './not-found';
import { LoadingComponent } from './shared/loading.component';
import { DOCUMENT } from '@angular/common';

describe('Application Core & Foundation', () => {
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

  it('renders the marketing landing page with hero headline and sections', async () => {
    await TestBed.configureTestingModule({
      imports: [Marketing],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(Marketing);
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1?.textContent).toContain('منيو مطعمك… بشكل أذكى وأجمل');
    expect(fixture.nativeElement.textContent).toContain('خلّي عملاءك يشوفوا الأطباق والأسعار');
    expect(fixture.nativeElement.textContent).toContain('المميزات الأساسية');
    expect(fixture.nativeElement.textContent).toContain('كيف تعمل');
    expect(fixture.nativeElement.textContent).toContain('الأسئلة الشائعة');
    expect(fixture.nativeElement.textContent).toContain('اطلب خدمتك الآن');
  });

  it('renders the 404 Not Found page with friendly illustration and links', async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1?.textContent).toContain('الصفحة غير موجودة');
    expect(fixture.nativeElement.textContent).toContain('العودة للصفحة الرئيسية');
    expect(fixture.nativeElement.textContent).toContain('تصفح منيو تجريبي');
  });

  it('renders the accessible loading indicator and handles error retry', async () => {
    await TestBed.configureTestingModule({ imports: [LoadingComponent] }).compileComponents();
    const fixture = TestBed.createComponent(LoadingComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeTruthy();

    fixture.componentRef.setInput('hasError', true);
    fixture.componentRef.setInput('errorMessage', 'خطأ في الاتصال');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('خطأ في الاتصال');
  });
});
