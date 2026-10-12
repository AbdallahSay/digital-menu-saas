import { Component, inject, signal } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface ServiceRequestForm {
  contactName: string;
  restaurantName: string;
  whatsapp: string;
  businessType: string;
  message: string;
}

@Component({
  selector: 'app-marketing',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <!-- Top Navigation Bar -->
    <header class="navbar-wrapper">
      <div class="container navbar-container">
        <a routerLink="/" class="brand-link" aria-label="الصفحة الرئيسية للقائمة الرقمية">
          <div class="brand-icon-box" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
              <path d="M7 2v20" />
              <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
            </svg>
          </div>
          <span class="brand-name">القائمة الرقمية</span>
          <span class="badge badge-forest badge-sm">سحابي</span>
        </a>

        <!-- Desktop Navigation Links -->
        <nav class="desktop-nav" aria-label="التنقل الرئيسي">
          <a href="#features" class="nav-link">المميزات</a>
          <a href="#how-it-works" class="nav-link">الخدمة بتشتغل إزاي؟</a>
          <a href="#audience" class="nav-link">مناسبة لمين؟</a>
          <a href="#pricing" class="nav-link">الأسعار</a>
          <a href="#faq" class="nav-link">الأسئلة الشائعة</a>
          <a routerLink="/r/demo" class="nav-link nav-link-highlight">منيو تجريبي ☕</a>
        </nav>

        <div class="navbar-actions">
          <a href="#request" class="btn btn-primary btn-cta">اعمل منيو لمطعمك</a>
          <!-- Mobile Hamburger Toggle -->
          <button
            type="button"
            class="mobile-menu-btn"
            [attr.aria-expanded]="mobileNavOpen()"
            aria-label="تبديل القائمة الرئيسية"
            (click)="toggleMobileNav()"
          >
            @if (mobileNavOpen()) {
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            } @else {
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            }
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Drawer -->
      @if (mobileNavOpen()) {
        <nav class="mobile-nav-drawer" aria-label="قائمة الهاتف">
          <a href="#features" class="mobile-nav-link" (click)="closeMobileNav()">المميزات</a>
          <a href="#how-it-works" class="mobile-nav-link" (click)="closeMobileNav()"
            >الخدمة بتشتغل إزاي؟</a
          >
          <a href="#audience" class="mobile-nav-link" (click)="closeMobileNav()">مناسبة لمين؟</a>
          <a href="#pricing" class="mobile-nav-link" (click)="closeMobileNav()">الأسعار</a>
          <a href="#faq" class="mobile-nav-link" (click)="closeMobileNav()">الأسئلة الشائعة</a>
          <a
            routerLink="/r/demo"
            class="mobile-nav-link mobile-nav-highlight"
            (click)="closeMobileNav()"
            >منيو تجريبي ☕</a
          >
          <a href="#request" class="btn btn-primary mobile-cta" (click)="closeMobileNav()"
            >اعمل منيو لمطعمك</a
          >
        </nav>
      }
    </header>

    <main id="main-content">
      <!-- 1. Premium Hero Section -->
      <section class="hero-section">
        <div class="container hero-container">
          <div class="hero-content">
            <div class="hero-badge-row">
              <span class="badge badge-brand">✨ منيو رقمي لكافيهات ومطاعم مصر</span>
            </div>
            <h1 class="hero-headline">منيو مطعمك، على مزاجك.</h1>
            <p class="hero-description">
              خلّي زوارك يشوفوا الأطباق والأسعار بمجرد مسح QR، وأنت تعدّل قائمة مطعمك في أي لحظة من
              غير ما تطبع منيو جديد.
            </p>
            <div class="hero-actions">
              <a href="#request" class="btn btn-accent btn-lg">اعمل منيو لمطعمك</a>
              <a routerLink="/r/demo" class="btn btn-secondary btn-lg">شوف المنيو بنفسك</a>
            </div>
            <div class="hero-trust-list">
              <span class="trust-item">⚡ تصفح سريع بدون تحميل أي تطبيق</span>
              <span class="trust-item">✎ تعديل فوري للأسعار في ثوانٍ</span>
              <span class="trust-item">📱 متوافق مع كل الموبايلات</span>
            </div>
          </div>

          <!-- Hero Graphic: Phone Mockup & Table Stand -->
          <div class="hero-visual" aria-hidden="true">
            <div class="mockup-stage">
              <!-- Smartphone Mockup -->
              <div class="phone-frame">
                <div class="phone-notch"></div>
                <div class="phone-screen">
                  <div class="mock-header">
                    <div class="mock-brand">كافيه زاوية — الشيخ زايد</div>
                    <div class="mock-table">طاولة 07</div>
                  </div>
                  <div class="mock-category-tabs">
                    <span class="mock-tab active">قهوة مختصة</span>
                    <span class="mock-tab">مخبوزات</span>
                  </div>
                  <div class="mock-dish-card">
                    <div class="mock-dish-img">☕</div>
                    <div class="mock-dish-info">
                      <div class="mock-dish-title">فلات وايت مختص</div>
                      <div class="mock-dish-price">65.00 ج.م</div>
                      <span class="badge badge-success badge-xs">متوفر</span>
                    </div>
                  </div>
                  <div class="mock-dish-card">
                    <div class="mock-dish-img">🥐</div>
                    <div class="mock-dish-info">
                      <div class="mock-dish-title">كرواسون زعتر وجبنة</div>
                      <div class="mock-dish-price">55.00 ج.م</div>
                      <span class="badge badge-success badge-xs">متوفر</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Table Stand Mockup with QR -->
              <div class="table-stand-mockup">
                <div class="stand-acrylic">
                  <div class="stand-qr-box">
                    <!-- Verified ISO/IEC 18004 Model 2 QR Code (https://menu.example.com/r/demo with 4-module quiet zone) -->
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 37 37"
                      width="80"
                      height="80"
                      shape-rendering="crispEdges"
                      aria-label="معاينة توضيحية لكود QR الطاولة (رابط تجريبي)"
                    >
                      <rect width="37" height="37" fill="#ffffff" />
                      <path
                        d="M4,4h1v1h-1z M5,4h1v1h-1z M6,4h1v1h-1z M7,4h1v1h-1z M8,4h1v1h-1z M9,4h1v1h-1z M10,4h1v1h-1z M12,4h1v1h-1z M18,4h1v1h-1z M21,4h1v1h-1z M22,4h1v1h-1z M23,4h1v1h-1z M26,4h1v1h-1z M27,4h1v1h-1z M28,4h1v1h-1z M29,4h1v1h-1z M30,4h1v1h-1z M31,4h1v1h-1z M32,4h1v1h-1z M4,5h1v1h-1z M10,5h1v1h-1z M13,5h1v1h-1z M14,5h1v1h-1z M17,5h1v1h-1z M22,5h1v1h-1z M23,5h1v1h-1z M24,5h1v1h-1z M26,5h1v1h-1z M32,5h1v1h-1z M4,6h1v1h-1z M6,6h1v1h-1z M7,6h1v1h-1z M8,6h1v1h-1z M10,6h1v1h-1z M12,6h1v1h-1z M16,6h1v1h-1z M19,6h1v1h-1z M23,6h1v1h-1z M24,6h1v1h-1z M26,6h1v1h-1z M28,6h1v1h-1z M29,6h1v1h-1z M30,6h1v1h-1z M32,6h1v1h-1z M4,7h1v1h-1z M6,7h1v1h-1z M7,7h1v1h-1z M8,7h1v1h-1z M10,7h1v1h-1z M14,7h1v1h-1z M16,7h1v1h-1z M17,7h1v1h-1z M20,7h1v1h-1z M22,7h1v1h-1z M23,7h1v1h-1z M26,7h1v1h-1z M28,7h1v1h-1z M29,7h1v1h-1z M30,7h1v1h-1z M32,7h1v1h-1z M4,8h1v1h-1z M6,8h1v1h-1z M7,8h1v1h-1z M8,8h1v1h-1z M10,8h1v1h-1z M12,8h1v1h-1z M16,8h1v1h-1z M17,8h1v1h-1z M20,8h1v1h-1z M21,8h1v1h-1z M22,8h1v1h-1z M23,8h1v1h-1z M26,8h1v1h-1z M28,8h1v1h-1z M29,8h1v1h-1z M30,8h1v1h-1z M32,8h1v1h-1z M4,9h1v1h-1z M10,9h1v1h-1z M14,9h1v1h-1z M15,9h1v1h-1z M18,9h1v1h-1z M19,9h1v1h-1z M20,9h1v1h-1z M21,9h1v1h-1z M22,9h1v1h-1z M23,9h1v1h-1z M26,9h1v1h-1z M32,9h1v1h-1z M4,10h1v1h-1z M5,10h1v1h-1z M6,10h1v1h-1z M7,10h1v1h-1z M8,10h1v1h-1z M9,10h1v1h-1z M10,10h1v1h-1z M12,10h1v1h-1z M14,10h1v1h-1z M16,10h1v1h-1z M18,10h1v1h-1z M20,10h1v1h-1z M22,10h1v1h-1z M24,10h1v1h-1z M26,10h1v1h-1z M27,10h1v1h-1z M28,10h1v1h-1z M29,10h1v1h-1z M30,10h1v1h-1z M31,10h1v1h-1z M32,10h1v1h-1z M14,11h1v1h-1z M16,11h1v1h-1z M19,11h1v1h-1z M21,11h1v1h-1z M22,11h1v1h-1z M24,11h1v1h-1z M5,12h1v1h-1z M8,12h1v1h-1z M10,12h1v1h-1z M13,12h1v1h-1z M14,12h1v1h-1z M16,12h1v1h-1z M20,12h1v1h-1z M21,12h1v1h-1z M22,12h1v1h-1z M23,12h1v1h-1z M24,12h1v1h-1z M28,12h1v1h-1z M30,12h1v1h-1z M32,12h1v1h-1z M4,13h1v1h-1z M6,13h1v1h-1z M7,13h1v1h-1z M8,13h1v1h-1z M9,13h1v1h-1z M11,13h1v1h-1z M12,13h1v1h-1z M13,13h1v1h-1z M15,13h1v1h-1z M16,13h1v1h-1z M17,13h1v1h-1z M19,13h1v1h-1z M20,13h1v1h-1z M25,13h1v1h-1z M26,13h1v1h-1z M27,13h1v1h-1z M29,13h1v1h-1z M32,13h1v1h-1z M6,14h1v1h-1z M7,14h1v1h-1z M8,14h1v1h-1z M10,14h1v1h-1z M12,14h1v1h-1z M13,14h1v1h-1z M15,14h1v1h-1z M16,14h1v1h-1z M18,14h1v1h-1z M19,14h1v1h-1z M20,14h1v1h-1z M21,14h1v1h-1z M25,14h1v1h-1z M27,14h1v1h-1z M28,14h1v1h-1z M30,14h1v1h-1z M31,14h1v1h-1z M32,14h1v1h-1z M4,15h1v1h-1z M11,15h1v1h-1z M12,15h1v1h-1z M15,15h1v1h-1z M17,15h1v1h-1z M18,15h1v1h-1z M20,15h1v1h-1z M21,15h1v1h-1z M22,15h1v1h-1z M23,15h1v1h-1z M24,15h1v1h-1z M25,15h1v1h-1z M26,15h1v1h-1z M31,15h1v1h-1z M4,16h1v1h-1z M5,16h1v1h-1z M9,16h1v1h-1z M10,16h1v1h-1z M12,16h1v1h-1z M13,16h1v1h-1z M14,16h1v1h-1z M18,16h1v1h-1z M19,16h1v1h-1z M21,16h1v1h-1z M24,16h1v1h-1z M25,16h1v1h-1z M26,16h1v1h-1z M27,16h1v1h-1z M29,16h1v1h-1z M31,16h1v1h-1z M32,16h1v1h-1z M4,17h1v1h-1z M5,17h1v1h-1z M9,17h1v1h-1z M12,17h1v1h-1z M13,17h1v1h-1z M15,17h1v1h-1z M16,17h1v1h-1z M18,17h1v1h-1z M19,17h1v1h-1z M21,17h1v1h-1z M22,17h1v1h-1z M24,17h1v1h-1z M25,17h1v1h-1z M26,17h1v1h-1z M29,17h1v1h-1z M32,17h1v1h-1z M5,18h1v1h-1z M7,18h1v1h-1z M9,18h1v1h-1z M10,18h1v1h-1z M11,18h1v1h-1z M13,18h1v1h-1z M16,18h1v1h-1z M17,18h1v1h-1z M21,18h1v1h-1z M22,18h1v1h-1z M24,18h1v1h-1z M25,18h1v1h-1z M26,18h1v1h-1z M29,18h1v1h-1z M31,18h1v1h-1z M32,18h1v1h-1z M5,19h1v1h-1z M8,19h1v1h-1z M11,19h1v1h-1z M12,19h1v1h-1z M16,19h1v1h-1z M19,19h1v1h-1z M21,19h1v1h-1z M23,19h1v1h-1z M24,19h1v1h-1z M28,19h1v1h-1z M29,19h1v1h-1z M31,19h1v1h-1z M8,20h1v1h-1z M10,20h1v1h-1z M11,20h1v1h-1z M12,20h1v1h-1z M13,20h1v1h-1z M14,20h1v1h-1z M16,20h1v1h-1z M20,20h1v1h-1z M21,20h1v1h-1z M22,20h1v1h-1z M23,20h1v1h-1z M24,20h1v1h-1z M25,20h1v1h-1z M26,20h1v1h-1z M29,20h1v1h-1z M31,20h1v1h-1z M32,20h1v1h-1z M5,21h1v1h-1z M7,21h1v1h-1z M8,21h1v1h-1z M11,21h1v1h-1z M12,21h1v1h-1z M13,21h1v1h-1z M14,21h1v1h-1z M17,21h1v1h-1z M19,21h1v1h-1z M20,21h1v1h-1z M24,21h1v1h-1z M26,21h1v1h-1z M29,21h1v1h-1z M30,21h1v1h-1z M32,21h1v1h-1z M4,22h1v1h-1z M6,22h1v1h-1z M10,22h1v1h-1z M11,22h1v1h-1z M13,22h1v1h-1z M14,22h1v1h-1z M15,22h1v1h-1z M18,22h1v1h-1z M19,22h1v1h-1z M20,22h1v1h-1z M21,22h1v1h-1z M24,22h1v1h-1z M27,22h1v1h-1z M28,22h1v1h-1z M31,22h1v1h-1z M32,22h1v1h-1z M5,23h1v1h-1z M6,23h1v1h-1z M7,23h1v1h-1z M8,23h1v1h-1z M9,23h1v1h-1z M12,23h1v1h-1z M17,23h1v1h-1z M18,23h1v1h-1z M20,23h1v1h-1z M21,23h1v1h-1z M22,23h1v1h-1z M23,23h1v1h-1z M25,23h1v1h-1z M29,23h1v1h-1z M31,23h1v1h-1z M4,24h1v1h-1z M6,24h1v1h-1z M8,24h1v1h-1z M9,24h1v1h-1z M10,24h1v1h-1z M13,24h1v1h-1z M14,24h1v1h-1z M15,24h1v1h-1z M16,24h1v1h-1z M18,24h1v1h-1z M19,24h1v1h-1z M20,24h1v1h-1z M21,24h1v1h-1z M24,24h1v1h-1z M25,24h1v1h-1z M26,24h1v1h-1z M27,24h1v1h-1z M28,24h1v1h-1z M12,25h1v1h-1z M18,25h1v1h-1z M19,25h1v1h-1z M21,25h1v1h-1z M24,25h1v1h-1z M28,25h1v1h-1z M30,25h1v1h-1z M31,25h1v1h-1z M32,25h1v1h-1z M4,26h1v1h-1z M5,26h1v1h-1z M6,26h1v1h-1z M7,26h1v1h-1z M8,26h1v1h-1z M9,26h1v1h-1z M10,26h1v1h-1z M13,26h1v1h-1z M14,26h1v1h-1z M15,26h1v1h-1z M17,26h1v1h-1z M23,26h1v1h-1z M24,26h1v1h-1z M26,26h1v1h-1z M28,26h1v1h-1z M29,26h1v1h-1z M31,26h1v1h-1z M32,26h1v1h-1z M4,27h1v1h-1z M10,27h1v1h-1z M13,27h1v1h-1z M15,27h1v1h-1z M20,27h1v1h-1z M21,27h1v1h-1z M24,27h1v1h-1z M28,27h1v1h-1z M29,27h1v1h-1z M32,27h1v1h-1z M4,28h1v1h-1z M6,28h1v1h-1z M7,28h1v1h-1z M8,28h1v1h-1z M10,28h1v1h-1z M12,28h1v1h-1z M15,28h1v1h-1z M16,28h1v1h-1z M19,28h1v1h-1z M20,28h1v1h-1z M21,28h1v1h-1z M24,28h1v1h-1z M25,28h1v1h-1z M26,28h1v1h-1z M27,28h1v1h-1z M28,28h1v1h-1z M31,28h1v1h-1z M4,29h1v1h-1z M6,29h1v1h-1z M7,29h1v1h-1z M8,29h1v1h-1z M10,29h1v1h-1z M13,29h1v1h-1z M14,29h1v1h-1z M15,29h1v1h-1z M16,29h1v1h-1z M20,29h1v1h-1z M21,29h1v1h-1z M27,29h1v1h-1z M28,29h1v1h-1z M30,29h1v1h-1z M4,30h1v1h-1z M6,30h1v1h-1z M7,30h1v1h-1z M8,30h1v1h-1z M10,30h1v1h-1z M13,30h1v1h-1z M14,30h1v1h-1z M16,30h1v1h-1z M23,30h1v1h-1z M27,30h1v1h-1z M28,30h1v1h-1z M29,30h1v1h-1z M32,30h1v1h-1z M4,31h1v1h-1z M10,31h1v1h-1z M12,31h1v1h-1z M14,31h1v1h-1z M19,31h1v1h-1z M20,31h1v1h-1z M21,31h1v1h-1z M22,31h1v1h-1z M23,31h1v1h-1z M24,31h1v1h-1z M25,31h1v1h-1z M31,31h1v1h-1z M4,32h1v1h-1z M5,32h1v1h-1z M6,32h1v1h-1z M7,32h1v1h-1z M8,32h1v1h-1z M9,32h1v1h-1z M10,32h1v1h-1z M13,32h1v1h-1z M16,32h1v1h-1z M17,32h1v1h-1z M18,32h1v1h-1z M19,32h1v1h-1z M20,32h1v1h-1z M21,32h1v1h-1z M23,32h1v1h-1z M24,32h1v1h-1z M25,32h1v1h-1z M26,32h1v1h-1z M27,32h1v1h-1z M31,32h1v1h-1z M32,32h1v1h-1z"
                        fill="#193630"
                      />
                    </svg>
                  </div>
                  <span class="stand-caption">معاينة توضيحية لكود الطاولة</span>
                </div>
                <div class="stand-base"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. About Us Section -->
      <section id="about" class="section-padded">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-forest">عن الخدمة</span>
            <h2 class="section-title">بنحوّل المنيو الورقي لتجربة رقمية جميلة</h2>
            <p class="section-subtitle">
              بنصمم أدوات بسيطة تساعدك تعرض أطباقك باحتراف، وتتحكم في الأسعار والأقسام وصور المنتجات
              بسهولة. هدفنا قيمة واضحة ليك ولعميلك بدون أي تعقيد.
            </p>
          </div>
          <div class="about-grid">
            <div class="about-card">
              <div class="about-icon">⚡</div>
              <h3 class="about-card-title">تصفح فوري وخفيف</h3>
              <p class="about-card-desc">
                المنيو بيفتح في ثوانٍ معدودة من المتصفح مباشرة، بدون انتظار أو تحميل تطبيقات ثقيلة.
              </p>
            </div>
            <div class="about-card">
              <div class="about-icon">🌍</div>
              <h3 class="about-card-title">عربي وإنجليزي</h3>
              <p class="about-card-desc">
                واجهة عربية مريحة مع إمكانية التبديل الفوري للإنجليزية بلمسة واحدة لراحة زباينك
                والسياح.
              </p>
            </div>
            <div class="about-card">
              <div class="about-icon">✎</div>
              <h3 class="about-card-title">تحكم كامل وسريع</h3>
              <p class="about-card-desc">
                لوحة تحكم من الموبايل تعدّل منها الأسعار والأطباق المتوفرة في لحظات وتظهر للزبون
                فوراً.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. Problem vs Solution Comparison -->
      <section id="problem-solution" class="section-padded bg-muted">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-terracotta">المقارنة</span>
            <h2 class="section-title">وداعاً لمشاكل وتكاليف المنيو الورقي</h2>
            <p class="section-subtitle">
              ليه المطاعم والكافيهات بتفضّل المنيو الرقمي عن الطباعة المستمرة؟
            </p>
          </div>

          <div class="comparison-grid">
            <!-- Problem Card -->
            <div class="comparison-card card-problem">
              <div class="card-header-badge badge-danger-soft">المنيو الورقي القديم</div>
              <ul class="comparison-list">
                <li>
                  <span class="icon-negative">✕</span> تكلفة طباعة متكررة مع كل تعديل أسعار أو تغيير
                  في الأطباق.
                </li>
                <li>
                  <span class="icon-negative">✕</span> المنيو بيتبهدل ويقدم مع الاستخدام اليومي
                  وشكله ميبقاش لائق.
                </li>
                <li>
                  <span class="icon-negative">✕</span> إحراج لما الزبون يطلب صنف خلص وتضطر تبلغه إن
                  الطبق مش متاح.
                </li>
                <li>
                  <span class="icon-negative">✕</span> تكلفة زيادة لطباعة نسخ إضافية بالعربي
                  والإنجليزي.
                </li>
              </ul>
            </div>

            <!-- Solution Card -->
            <div class="comparison-card card-solution">
              <div class="card-header-badge badge-success-soft">المنيو الرقمي الذكي</div>
              <ul class="comparison-list">
                <li>
                  <span class="icon-positive">✓</span> تعديل فوري للأسعار من موبايلك في ثوانٍ ومن
                  غير مليم طباعة.
                </li>
                <li>
                  <span class="icon-positive">✓</span> مظهر شيك وعصري بكود QR أنيق وثابت على كل
                  ترابيزة.
                </li>
                <li>
                  <span class="icon-positive">✓</span> زرار يحول حالة الطبق لـ "نفد" فوراً ويمنع أي
                  إحراج لطاقم الضيافة.
                </li>
                <li>
                  <span class="icon-positive">✓</span> تبديل سلس بنقرة واحدة بين العربي والإنجليزي
                  لتجربة راقية.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. Features Section -->
      <section id="features" class="section-padded">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-forest">المميزات</span>
            <h2 class="section-title">كل اللي محتاجه في مكان واحد</h2>
            <p class="section-subtitle">
              أدوات مدروسة بعناية ومصممة لخدمة كافيهك ومطعمك بدون أي تعقيد تقني.
            </p>
          </div>

          <div class="features-grid">
            <div class="feature-box">
              <div class="feature-icon">📱</div>
              <h3 class="feature-title">كود QR دائم</h3>
              <p class="feature-desc">
                كود ثابت ومستقر؛ تطبعه مرة واحدة على الترابيزات وتعدّل المنيو وقت ما تحب.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">✎</div>
              <h3 class="feature-title">تعديل فوري للأسعار</h3>
              <p class="feature-desc">
                حدّث أسعارك بالجنيه المصري فوراً من الموبايل لمواكبة التغيرات وتوفير مصاريف الطباعة.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">▤</div>
              <h3 class="feature-title">تنظيم مرن للأقسام</h3>
              <p class="feature-desc">
                نظّم منيوك بسهولة (مشروبات ساخنة، مقبلات، وجبات، حلويات) ورتّب أولويات العرض براحتك.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">📸</div>
              <h3 class="feature-title">صور أطباق تفتح النفس</h3>
              <p class="feature-desc">
                اعرض أصنافك بصور واضحة ومقاسات متناسقة تساعد الزباين يختاروا أسرع.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">◈</div>
              <h3 class="feature-title">هوية وبراند المكان</h3>
              <p class="feature-desc">
                ألوان وشعار وصور أطباق تتماشى مع طابع وديكور كافيهك أو مطعمك.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">🌐</div>
              <h3 class="feature-title">عربي وإنجليزي</h3>
              <p class="feature-desc">
                تجربة ثنائية اللغة متكاملة بلمسة زرار واحدة بدون إعادة تحميل الصفحة.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">⚡</div>
              <h3 class="feature-title">موبايل أولاً وسريع</h3>
              <p class="feature-desc">
                تصفح خفيف وسلس متوافق مع كل شاشات الموبايل ومناسب لسرعات النت المختلفة.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. How It Works Section -->
      <section id="how-it-works" class="section-padded bg-muted">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-brand">الخطوات</span>
            <h2 class="section-title">الخدمة بتشتغل إزاي؟</h2>
            <p class="section-subtitle">المنيو الرقمي يبدأ في 3 خطوات بسيطة ومباشرة.</p>
          </div>

          <div class="steps-grid">
            <div class="step-card">
              <div class="step-number">1</div>
              <h3 class="step-title">احكيلنا عن مطعمك</h3>
              <p class="step-desc">
                سيب بيانات نشاطك والخدمات اللي محتاجها وتفاصيل أصنافك وأقسامك.
              </p>
            </div>
            <div class="step-card">
              <div class="step-number">2</div>
              <h3 class="step-title">بنجهّز المنيو وهويتك</h3>
              <p class="step-desc">
                بننظم الأقسام والصور والأسعار ونربطها بهوية كافيهك وألوانك الخاصة.
              </p>
            </div>
            <div class="step-card">
              <div class="step-number">3</div>
              <h3 class="step-title">العملاء يمسحوا QR</h3>
              <p class="step-desc">
                اطبع الكود على الترابيزات وعملاؤك يمسحوه ويشوفوا المنيو بكل سهولة.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 6. Interactive Preview Section -->
      <section id="preview" class="section-padded">
        <div class="container">
          <div class="preview-banner">
            <div class="preview-text">
              <span class="badge badge-terracotta">معاينة حية</span>
              <h2 class="preview-title">شوف شكل المنيو بنفسك</h2>
              <p class="preview-desc">
                جرّب النموذج التجريبي وشوف سرعة التصفح وتناسق الألوان والخطوط على الموبايل.
              </p>
              <div class="preview-actions">
                <a routerLink="/r/demo" class="btn btn-primary btn-lg">شوف المنيو بنفسك</a>
              </div>
            </div>
            <div class="preview-mockup-frame" aria-hidden="true">
              <div class="sample-dish-badge">💡 نموذج تجريبي حي</div>
              <div class="sample-card">
                <div class="sample-title">قهوة عربية فاخرة</div>
                <div class="sample-price">45.00 ج.م</div>
                <div class="sample-status">🟢 متوفر</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 7. Who is it for? (Audience) -->
      <section id="audience" class="section-padded bg-muted">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-forest">مناسبة لمين؟</span>
            <h2 class="section-title">مصمم لكافيهات ومطاعم بتفكر لقدام</h2>
            <p class="section-subtitle">
              حلول عملية تناسب كل مكان بيهتم بتقديم تجربة شيك ومريحة لزبائنه.
            </p>
          </div>

          <div class="audience-grid">
            <div class="audience-card">
              <div class="audience-icon">☕</div>
              <h3 class="audience-title">كافيهات ومحامص القهوة المختصة</h3>
              <p class="audience-desc">
                استعراض نوتس التحميص والبن وأنواع المشروبات بطريقة عصرية راقية.
              </p>
            </div>
            <div class="audience-card">
              <div class="audience-icon">🍽️</div>
              <h3 class="audience-title">المطاعم والبيسترو</h3>
              <p class="audience-desc">
                أقسام منظمة وصور جذابة للأطباق تفتح نفس الزبون وتسهّل الطلب.
              </p>
            </div>
            <div class="audience-card">
              <div class="audience-icon">🥐</div>
              <h3 class="audience-title">المخابز والحلويات</h3>
              <p class="audience-desc">
                تحديث يومي وسريع للأصناف الطازجة ومخبوزات اليوم المتوفرة في الفرع.
              </p>
            </div>
            <div class="audience-card">
              <div class="audience-icon">🚚</div>
              <h3 class="audience-title">عربات الطعام والمشاريع الناشئة</h3>
              <p class="audience-desc">
                توفير مساحات المنيو المطبوع وحمايته من عوامل الجو وسرعة في تغيير الأسعار.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 8. Pricing Presentation -->
      <section id="pricing" class="section-padded">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-brand">الباقات والأسعار</span>
            <h2 class="section-title">باقات واضحة تناسب حجم نشاطك</h2>
            <p class="section-subtitle">
              خدمة عرض رقمي متكاملة — بدون سلة تسوق أو دفع إلكتروني أو نسب مبيعات خفية.
            </p>
            <div class="pricing-disclaimer">
              ⚠️ خدمة عرض فقط (Display-Only): بدون سلة شراء أو دفع أونلاين. الأسعار نماذج استرشادية
              واضحة.
            </div>
          </div>

          <div class="pricing-grid">
            <!-- Tier 1 -->
            <div class="pricing-card">
              <div class="pricing-header">
                <h3 class="tier-name">باقة الانطلاق</h3>
                <p class="tier-desc">مثالية للمقاهي الصغيرة وعربات الطعام الناشئة.</p>
                <div class="tier-price">
                  <span class="price-amount">299</span>
                  <span class="price-currency">ج.م / شهرياً</span>
                </div>
                <span class="price-note">(نموذج استرشادي)</span>
              </div>
              <ul class="tier-features">
                <li>✓ كود QR دائم للطاولات</li>
                <li>✓ حتى 5 أقسام رئيسية</li>
                <li>✓ حتى 40 صنفاً ومشروباً</li>
                <li>✓ دعم اللغتين العربية والإنجليزية</li>
                <li>✓ لوحة تحكم موبايل سريعة لتعديل الأسعار</li>
              </ul>
              <a href="#request" class="btn btn-secondary btn-block">طلب الباقة</a>
            </div>

            <!-- Tier 2 (Highlighted) -->
            <div class="pricing-card card-featured">
              <div class="featured-badge">باقة متكاملة</div>
              <div class="pricing-header">
                <h3 class="tier-name">باقة المطاعم الاحترافية</h3>
                <p class="tier-desc">للمطاعم والمقاهي المتنامية الباحثة عن تميز كامل.</p>
                <div class="tier-price">
                  <span class="price-amount">499</span>
                  <span class="price-currency">ج.م / شهرياً</span>
                </div>
                <span class="price-note">(نموذج استرشادي)</span>
              </div>
              <ul class="tier-features">
                <li>✓ كل مميزات باقة الانطلاق</li>
                <li>✓ أقسام وأطباق غير محدودة</li>
                <li>✓ تخصيص ألوان وشعار المطعم بالكامل</li>
                <li>✓ صور عالية الوضوح لكل الأطباق</li>
                <li>✓ تحديث فوري لحالة الأطباق ("متوفر" / "نفد")</li>
                <li>✓ أولوية الدعم الفني وتجهيز المنيو لأول مرة</li>
              </ul>
              <a href="#request" class="btn btn-accent btn-block">طلب الباقة</a>
            </div>
          </div>
        </div>
      </section>

      <!-- 9. FAQ Section -->
      <section id="faq" class="section-padded bg-muted">
        <div class="container max-w-readable">
          <div class="section-header text-center">
            <span class="badge badge-terracotta">الأسئلة الشائعة</span>
            <h2 class="section-title">لسه عندك سؤال؟</h2>
            <p class="section-subtitle">إجابات واضحة على كل الاستفسارات قبل ما تبدأ.</p>
          </div>

          <div class="faq-accordion">
            <details class="faq-item" open>
              <summary class="faq-question">هل الزبون محتاج يحمّل أي تطبيق؟</summary>
              <div class="faq-answer">
                لا خالص، المنيو بيفتح من متصفح الموبايل مباشرة بمجرد مسح كود الـ QR بكاميرا التليفون
                من غير ما يحتاج ينزّل تطبيق أو يسجل حساب.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">لو غيرت الأسعار هل بحتاج أطبع كود QR جديد؟</summary>
              <div class="faq-answer">
                أبداً، كود الـ QR بيفضل ثابت ومش بيتغير (Permanent Link). تقدر تحدّث كل أسعارك
                وأطباقك في أي وقت وهتظهر فوراً بنفس الرابط على كل الترابيزات.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">إزاي بعدّل الأسعار والأطباق؟</summary>
              <div class="faq-answer">
                من خلال لوحة تحكم بسيطة جداً ومصممة للموبايل، تقدر في ثوانٍ تعدّل سعر أي صنف أو تحدد
                إذا كان الطبق متوفر أو خلص.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">هل المنيو شغال عربي وإنجليزي؟</summary>
              <div class="faq-answer">
                أيوه، المنيو مجهز يدعم اللغتين مع إمكانية التبديل بلمسة واحدة عشان يناسب كل ضيوفك
                والسياح.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">لو طبق خلص خلال اليوم أعمل إيه؟</summary>
              <div class="faq-answer">
                بنقرة زرار واحدة من موبايلك بتحول حالة الطبق لـ "نفد" وسيظهر للعملاء فوراً عشان
                تتجنب أي إحراج لطاقم الخدمة.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">هل فيه طلب أونلاين أو دفع إلكتروني؟</summary>
              <div class="faq-answer">
                الخدمة في الإصدار الحالي مخصصة للعرض فقط (Display-Only MVP) لتقديم أسرع وأبسط تجربة
                تصفح، وبدون سلة مشتريات أو دفع إلكتروني.
              </div>
            </details>
          </div>
        </div>
      </section>

      <!-- 10. Service Request Section -->
      <section id="request" class="section-padded">
        <div class="container max-w-readable">
          <div class="section-header text-center">
            <span class="badge badge-brand">طلب الخدمة</span>
            <h2 class="section-title">عايز منيو رقمي لمطعمك؟</h2>
            <p class="section-subtitle">
              سيب بياناتك ونتواصل معاك بالتفاصيل ونجهز لك المنيو المناسب لنشاطك.
            </p>
          </div>

          <div class="request-form-card">
            <div class="lead-api-notice" role="note">
              <span class="notice-icon">ℹ️</span>
              <div class="notice-text">
                <strong>إشعار فني:</strong> نموذج إبداء الاهتمام في مرحلة التحقق الأولي (Frontend
                Pre-flight). سيتم تفعيل الإرسال المباشر فور اعتماد واجهة استقبال الطلبات الرسمية
                (Lead API).
              </div>
            </div>

            <form class="service-form" (ngSubmit)="onFormSubmit()" #form="ngForm">
              <div class="form-group">
                <label for="contactName" class="form-label"
                  >اسم المسؤول <span class="required">*</span></label
                >
                <input
                  type="text"
                  id="contactName"
                  name="contactName"
                  class="form-input"
                  placeholder="مثال: محمد أحمد"
                  required
                  minlength="2"
                  maxlength="80"
                  [(ngModel)]="formData.contactName"
                  #nameCtrl="ngModel"
                />
                @if (nameCtrl.invalid && nameCtrl.touched) {
                  <span class="form-error">يرجى إدخال اسم المسؤول (حرفين على الأقل).</span>
                }
              </div>

              <div class="form-group">
                <label for="restaurantName" class="form-label"
                  >اسم المطعم أو الكافيه <span class="required">*</span></label
                >
                <input
                  type="text"
                  id="restaurantName"
                  name="restaurantName"
                  class="form-input"
                  placeholder="مثال: مطعم أو كافيه السعادة"
                  required
                  minlength="2"
                  maxlength="100"
                  [(ngModel)]="formData.restaurantName"
                  #restCtrl="ngModel"
                />
                @if (restCtrl.invalid && restCtrl.touched) {
                  <span class="form-error">يرجى إدخال اسم المطعم أو الكافيه.</span>
                }
              </div>

              <div class="form-group">
                <label for="whatsapp" class="form-label"
                  >رقم الواتساب <span class="required">*</span></label
                >
                <input
                  type="tel"
                  id="whatsapp"
                  name="whatsapp"
                  class="form-input"
                  dir="ltr"
                  placeholder="+201012345678"
                  required
                  pattern="^[+0-9]{8,16}$"
                  [(ngModel)]="formData.whatsapp"
                  #phoneCtrl="ngModel"
                />
                @if (phoneCtrl.invalid && phoneCtrl.touched) {
                  <span class="form-error">يرجى إدخال رقم هاتف صحيح مسبوقاً برمز الدولة.</span>
                }
              </div>

              <div class="form-group">
                <label for="businessType" class="form-label"
                  >نوع النشاط <span class="required">*</span></label
                >
                <select
                  id="businessType"
                  name="businessType"
                  class="form-select"
                  required
                  [(ngModel)]="formData.businessType"
                >
                  <option value="cafe">كافيه / مقهى</option>
                  <option value="restaurant">مطعم</option>
                  <option value="sweets">حلويات ومخبوزات</option>
                  <option value="foodtruck">عربة طعام (Food Truck)</option>
                  <option value="other">نشاط آخر</option>
                </select>
              </div>

              <div class="form-group">
                <label for="message" class="form-label">ملاحظات أو تفاصيل إضافية (اختياري)</label>
                <textarea
                  id="message"
                  name="message"
                  rows="3"
                  class="form-textarea"
                  placeholder="أي تفاصيل ترغب في إضافتها حول قائمة طعامك..."
                  maxlength="500"
                  [(ngModel)]="formData.message"
                ></textarea>
              </div>

              <div class="form-submit-row">
                <button
                  type="submit"
                  class="btn btn-primary btn-block btn-disabled"
                  disabled
                  title="نموذج الطلب بانتظار تفعيل واجهة الـ API الرسمية"
                >
                  ابدأ طلب الخدمة ↗
                </button>
                <span class="form-hint">
                  🔒 بياناتك في أمان تام؛ لن يتم استخدام رقمك إلا للتواصل بشأن إعداد المنيو.
                </span>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="footer-wrapper">
      <div class="container footer-container">
        <div class="footer-brand-col">
          <div class="footer-brand">
            <span class="brand-name">القائمة الرقمية</span>
            <span class="badge badge-forest badge-sm">سحابي</span>
          </div>
          <p class="footer-desc">
            منيو رقمي مخصص للعرض فقط • بدون سلة أو دفع أونلاين. تجربة تصفح سريعة وراقية لمطاعم
            وكافيهات مصر.
          </p>
        </div>

        <div class="footer-links-col">
          <h4 class="footer-heading">روابط سريعة</h4>
          <ul class="footer-links-list">
            <li><a href="#features">المميزات</a></li>
            <li><a href="#how-it-works">الخدمة بتشتغل إزاي؟</a></li>
            <li><a href="#pricing">الأسعار</a></li>
            <li><a href="#faq">الأسئلة الشائعة</a></li>
            <li><a routerLink="/r/demo">منيو تجريبي</a></li>
            <li><a routerLink="/admin">دخول الإدارة</a></li>
          </ul>
        </div>

        <div class="footer-links-col">
          <h4 class="footer-heading">الضوابط والسياسات</h4>
          <ul class="footer-links-list">
            <li><span>القائمة للعرض فقط (Display-Only)</span></li>
            <li><span>بدون سلة مشتريات أو دفع إلكتروني</span></li>
            <li><span>متوافق مع معايير إمكانية الوصول WCAG AA</span></li>
            <li><span>كود الاستجابة السريع دائم وثابت</span></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="container footer-bottom-inner">
          <p>© 2026 القائمة الرقمية — جميع الحقوق محفوظة.</p>
          <p class="footer-note">منصة عرض فقط (Display-Only SaaS MVP)</p>
        </div>
      </div>
    </footer>
  `,
})
export class Marketing {
  readonly mobileNavOpen = signal(false);

  readonly formData: ServiceRequestForm = {
    contactName: '',
    restaurantName: '',
    whatsapp: '',
    businessType: 'cafe',
    message: '',
  };

  constructor() {
    inject(Title).setTitle('القائمة الرقمية — منيو مطعمك، على مزاجك.');
    inject(Meta).updateTag({
      name: 'description',
      content:
        'خلّي زوارك يشوفوا الأطباق والأسعار بمجرد مسح QR، وأنت تعدّل قائمة مطعمك في أي لحظة من غير ما تطبع منيو جديد.',
    });
    inject(Meta).updateTag({ name: 'robots', content: 'index,follow' });
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update((v) => !v);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  onFormSubmit(): void {
    // Lead Submission API Handoff Invariant:
    // When POST /api/v1/leads is approved and implemented, this handler will submit
    // the validated payload. Currently transmission is intentionally disabled to avoid
    // fake success or unapproved data persistence.
  }
}
