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
          <a href="#audience" class="nav-link">لمن صُممت؟</a>
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
          <a href="#audience" class="mobile-nav-link" (click)="closeMobileNav()">لمن صُممت؟</a>
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
                    <!-- SVG QR Representation -->
                    <svg viewBox="0 0 100 100" width="80" height="80" fill="currentColor">
                      <!-- Position detection patterns -->
                      <rect
                        x="5"
                        y="5"
                        width="30"
                        height="30"
                        rx="4"
                        fill="none"
                        stroke="#193630"
                        stroke-width="6"
                      />
                      <rect x="15" y="15" width="10" height="10" fill="#193630" />
                      <rect
                        x="65"
                        y="5"
                        width="30"
                        height="30"
                        rx="4"
                        fill="none"
                        stroke="#193630"
                        stroke-width="6"
                      />
                      <rect x="75" y="15" width="10" height="10" fill="#193630" />
                      <rect
                        x="5"
                        y="65"
                        width="30"
                        height="30"
                        rx="4"
                        fill="none"
                        stroke="#193630"
                        stroke-width="6"
                      />
                      <rect x="15" y="75" width="10" height="10" fill="#193630" />
                      <!-- Pattern modules -->
                      <rect x="42" y="10" width="8" height="8" fill="#0f766e" />
                      <rect x="45" y="25" width="6" height="6" fill="#193630" />
                      <rect x="10" y="45" width="8" height="6" fill="#0f766e" />
                      <rect x="25" y="45" width="8" height="8" fill="#193630" />
                      <rect x="42" y="42" width="16" height="16" rx="2" fill="#ca7655" />
                      <rect x="65" y="45" width="12" height="8" fill="#193630" />
                      <rect x="85" y="45" width="6" height="12" fill="#0f766e" />
                      <rect x="45" y="65" width="8" height="10" fill="#193630" />
                      <rect x="65" y="65" width="10" height="8" fill="#0f766e" />
                      <rect x="80" y="75" width="12" height="12" fill="#193630" />
                    </svg>
                  </div>
                  <span class="stand-caption">امسح لتصفح المنيو</span>
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
            <span class="badge badge-forest">لمن صُممت؟</span>
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
              <div class="featured-badge">الأكثر طلباً</div>
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
