import { Component, afterNextRender, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { LeadIntakeService, LeadStatus } from './leads';

/**
 * Privacy notice for the sales request form. The facts about who keeps the data, how long and how
 * to reach them come from server configuration, never from this file. If they are not configured the
 * page says so and shows no notice.
 * DRAFT for owner review. Not legal advice and not a certified policy.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="container max-w-readable section-padded" dir="rtl" lang="ar">
      <p><a routerLink="/">← الرئيسية</a></p>
      <h1>سياسة الخصوصية لطلب الخدمة</h1>
      @if (state() === 'loading') {
        <p role="status">بنحمّل السياسة...</p>
      } @else if (state() === 'unavailable') {
        <p role="alert" data-testid="privacy-unavailable">
          السياسة مش متاحة دلوقتي، واستقبال الطلبات من الموقع مش مفتوح.
        </p>
      } @else {
        <section data-testid="privacy-notice">
          <h2>مين بيحتفظ ببياناتك</h2>
          <p>{{ status()?.controllerName }}</p>
          <p>للتواصل معانا: {{ status()?.contactChannel }}</p>

          <h2>بنجمع إيه</h2>
          <p>
            اسمك، اسم المطعم أو الكافيه، رقم الواتساب، نوع النشاط، وأي ملاحظات بتكتبها بنفسك. لو ما
            كتبتش حاجة في خانة معينة (الملاحظات) ما بنطلبهاش.
          </p>

          <h2>ليه</h2>
          <p>بس عشان نتواصل معاك بخصوص إعداد منيو مطعمك. مبنستخدمهاش في إعلانات.</p>

          <h2>بنشاركها مع مين</h2>
          <p>
            الطلبات بتتخزن في قاعدة بيانات الخدمة، ويشوفها فريق إدارة المنصة بس. مبنبعتهاش لأي جهة
            تانية.
          </p>

          <h2>بنحتفظ بيها قد إيه</h2>
          <p>
            {{ status()?.retentionDays }} يوم من وقت الإرسال، وبعدها بتتمسح تلقائيًا أثناء تشغيل
            الخدمة.
          </p>

          <h2>حقوقك</h2>
          <p>
            تقدر تطلب مسح بياناتك أو تصحيحها في أي وقت عن طريق التواصل معانا على الوسيلة المذكورة
            فوق. فريق الإدارة بيقدر يمسح الطلب فورًا.
          </p>

          <p>إصدار السياسة: {{ status()?.noticeVersion }}</p>
        </section>
      }
    </main>
  `,
})
export class PrivacyComponent {
  private readonly leads = inject(LeadIntakeService);
  readonly status = signal<LeadStatus | null>(null);
  readonly state = signal<'loading' | 'ready' | 'unavailable'>('loading');

  constructor() {
    inject(Title).setTitle('سياسة الخصوصية | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
    afterNextRender(() => void this.load());
  }

  private async load(): Promise<void> {
    const status = await this.leads.status();
    this.status.set(status);
    this.state.set(status?.open ? 'ready' : 'unavailable');
  }
}
