import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
@Component({
  selector: 'app-admin',
  template: '<main><h1>الإدارة</h1><p>واجهة مؤقتة. تسجيل الدخول غير متاح في F01.</p></main>',
})
export class Admin {
  constructor() {
    inject(Title).setTitle('الإدارة | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }
}
