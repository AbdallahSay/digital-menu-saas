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
          <span class="badge badge-brand badge-sm">سحابي</span>
        </a>

        <!-- Desktop Navigation Links -->
        <nav class="desktop-nav" aria-label="التنقل الرئيسي">
          <a href="#features" class="nav-link">المميزات</a>
          <a href="#how-it-works" class="nav-link">كيف تعمل</a>
          <a href="#audience" class="nav-link">لمن صُممت؟</a>
          <a href="#pricing" class="nav-link">الأسعار</a>
          <a href="#faq" class="nav-link">الأسئلة الشائعة</a>
          <a routerLink="/r/demo" class="nav-link nav-link-highlight">منيو تجريبي 🍽️</a>
        </nav>

        <div class="navbar-actions">
          <a href="#request" class="btn btn-primary btn-cta">اطلب خدمتك الآن</a>
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
          <a href="#how-it-works" class="mobile-nav-link" (click)="closeMobileNav()">كيف تعمل</a>
          <a href="#audience" class="mobile-nav-link" (click)="closeMobileNav()">لمن صُممت؟</a>
          <a href="#pricing" class="mobile-nav-link" (click)="closeMobileNav()">الأسعار</a>
          <a href="#faq" class="mobile-nav-link" (click)="closeMobileNav()">الأسئلة الشائعة</a>
          <a
            routerLink="/r/demo"
            class="mobile-nav-link mobile-nav-highlight"
            (click)="closeMobileNav()"
            >منيو تجريبي 🍽️</a
          >
          <a href="#request" class="btn btn-primary mobile-cta" (click)="closeMobileNav()"
            >اطلب خدمتك الآن</a
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
              <span class="badge badge-brand"
                >✨ المنصة العربية الذكية لعرض قوائم الطعام الرقمية</span
              >
            </div>
            <h1 class="hero-headline">منيو مطعمك… بشكل أذكى وأجمل</h1>
            <p class="hero-description">
              خلّي عملاءك يشوفوا الأطباق والأسعار بمجرد مسح QR، وغيّر المنيو في أي وقت من غير إعادة
              طباعة.
            </p>
            <div class="hero-actions">
              <a href="#request" class="btn btn-primary btn-lg">اطلب خدمتك الآن</a>
              <a routerLink="/r/demo" class="btn btn-secondary btn-lg">شاهد منيو تجريبي</a>
            </div>
            <div class="hero-trust-list">
              <span class="trust-item">⚡ تصفح فوري بدون تحميل تطبيق</span>
              <span class="trust-item">🔄 تعديل فوري للأسعار في ثوانٍ</span>
              <span class="trust-item">📱 متوافق مع كافة الهواتف</span>
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
                    <div class="mock-brand">مطعم التجربة</div>
                    <div class="mock-table">طاولة 04</div>
                  </div>
                  <div class="mock-category-tabs">
                    <span class="mock-tab active">الأطباق الرئيسية</span>
                    <span class="mock-tab">المشروبات</span>
                  </div>
                  <div class="mock-dish-card">
                    <div class="mock-dish-img">☕</div>
                    <div class="mock-dish-info">
                      <div class="mock-dish-title">قهوة عربية فاخرة</div>
                      <div class="mock-dish-price">45.00 ج.م</div>
                      <span class="badge badge-success badge-xs">متوفر</span>
                    </div>
                  </div>
                  <div class="mock-dish-card">
                    <div class="mock-dish-img">🍲</div>
                    <div class="mock-dish-info">
                      <div class="mock-dish-title">شاورما لحم بلدي</div>
                      <div class="mock-dish-price">120.00 ج.م</div>
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
                        stroke="#0f172a"
                        stroke-width="6"
                      />
                      <rect x="15" y="15" width="10" height="10" fill="#0f172a" />
                      <rect
                        x="65"
                        y="5"
                        width="30"
                        height="30"
                        rx="4"
                        fill="none"
                        stroke="#0f172a"
                        stroke-width="6"
                      />
                      <rect x="75" y="15" width="10" height="10" fill="#0f172a" />
                      <rect
                        x="5"
                        y="65"
                        width="30"
                        height="30"
                        rx="4"
                        fill="none"
                        stroke="#0f172a"
                        stroke-width="6"
                      />
                      <rect x="15" y="75" width="10" height="10" fill="#0f172a" />
                      <!-- Pattern modules -->
                      <rect x="42" y="10" width="8" height="8" fill="#0f766e" />
                      <rect x="45" y="25" width="6" height="6" fill="#0f172a" />
                      <rect x="10" y="45" width="8" height="6" fill="#0f766e" />
                      <rect x="25" y="45" width="8" height="8" fill="#0f172a" />
                      <rect x="42" y="42" width="16" height="16" rx="2" fill="#d97706" />
                      <rect x="65" y="45" width="12" height="8" fill="#0f172a" />
                      <rect x="85" y="45" width="6" height="12" fill="#0f766e" />
                      <rect x="45" y="65" width="8" height="10" fill="#0f172a" />
                      <rect x="65" y="65" width="10" height="8" fill="#0f766e" />
                      <rect x="80" y="75" width="12" height="12" fill="#0f172a" />
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
            <span class="badge badge-brand">عن المنصة</span>
            <h2 class="section-title">حل رقمي صُمم خصيصاً للمطاعم العربية</h2>
            <p class="section-subtitle">
              القائمة الرقمية هي منصة سحابية متخصصة تُمكّن المطاعم، المقاهي، وعربات الطعام في العالم
              العربي من تحويل قوائم طعامهم التقليدية إلى تجربة استعراض رقمية تفاعلية سريعة وأنيقة.
              تم بناء النظام بالكامل وفق سلوك الضيوف المحلي لتوفير أسرع تجربة مسح وتصفح دون الحاجة
              لتحميل تطبيقات أو تسجيل حسابات.
            </p>
          </div>
          <div class="about-grid">
            <div class="about-card">
              <div class="about-icon">⚡</div>
              <h3 class="about-card-title">سرعة فائقة وخفة تامة</h3>
              <p class="about-card-desc">
                تفتح القائمة في أجزاء من الثانية بفضل تقنيات الرندر السحابي المتقدمة (SSR) دون أي
                انتظار.
              </p>
            </div>
            <div class="about-card">
              <div class="about-icon">🌍</div>
              <h3 class="about-card-title">ثنائية لغة عربية وأجنبية</h3>
              <p class="about-card-desc">
                واجهة عربية أصيلة (RTL) تدعم التبديل اللحظي للغة الإنجليزية (LTR) لتلبية رغبات
                السياح والزوار.
              </p>
            </div>
            <div class="about-card">
              <div class="about-icon">🛡️</div>
              <h3 class="about-card-title">تحكم كامل للمالك</h3>
              <p class="about-card-desc">
                لوحة تحكم موبايل بديهية تمكنك من تعديل الأسعار، إيقاف الأطباق المنتهية، وتحديث الصور
                في ثوانٍ.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. Problem vs Solution Comparison -->
      <section id="problem-solution" class="section-padded bg-muted">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-warning">المقارنة الذكية</span>
            <h2 class="section-title">وداعاً لمشاكل وتكاليف المنيو الورقي</h2>
            <p class="section-subtitle">
              لماذا يتجه رواد المطاعم العصريون إلى القائمة الرقمية بدلاً من الطباعة الورقية
              المستمرة؟
            </p>
          </div>

          <div class="comparison-grid">
            <!-- Problem Card -->
            <div class="comparison-card card-problem">
              <div class="card-header-badge badge-danger-soft">القوائم الورقية التقليدية</div>
              <ul class="comparison-list">
                <li>
                  <span class="icon-negative">✕</span> تكلفة طباعة متكررة ومرهقة مع كل تغيير في
                  الأسعار أو المكونات.
                </li>
                <li>
                  <span class="icon-negative">✕</span> تلف وتمزق القوائم الورقية سريعاً وتلوثها مع
                  الاستخدام اليومي.
                </li>
                <li>
                  <span class="icon-negative">✕</span> إحراج مستمر عند طلب العميل لطبق نفد بسبب عدم
                  القدرة على التحديث الفوري.
                </li>
                <li>
                  <span class="icon-negative">✕</span> صعوبة وتكلفة مضاعفة لطباعة نسخ ثنائية اللغة
                  على نفس الطاولة.
                </li>
              </ul>
            </div>

            <!-- Solution Card -->
            <div class="comparison-card card-solution">
              <div class="card-header-badge badge-success-soft">القائمة الرقمية الذكية (SaaS)</div>
              <ul class="comparison-list">
                <li>
                  <span class="icon-positive">✓</span> تعديل لحظي للأسعار والأطباق من هاتفك في ثوانٍ
                  دون أي تكلفة طباعة.
                </li>
                <li>
                  <span class="icon-positive">✓</span> نظافة وأناقة دائمة بمسح رمز QR دائم وعصري
                  موضوع على الطاولة.
                </li>
                <li>
                  <span class="icon-positive">✓</span> زر تحويل حالة الطبق إلى "نفد" فوراً لمنع أي
                  إحراج لطاقم الضيافة.
                </li>
                <li>
                  <span class="icon-positive">✓</span> تبديل فوري بنقرة واحدة بين العربية
                  والإنجليزية لتجربة دولية راقية.
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
            <span class="badge badge-brand">المميزات الأساسية</span>
            <h2 class="section-title">كل ما تحتاجه لإدارة منيو احترافي</h2>
            <p class="section-subtitle">
              أدوات مدروسة بعناية صُممت لخدمة المطاعم والكافيهات بدون أي تعقيد تقني.
            </p>
          </div>

          <div class="features-grid">
            <div class="feature-box">
              <div class="feature-icon">📱</div>
              <h3 class="feature-title">رمز QR دائم لا يتغير</h3>
              <p class="feature-desc">
                رابط مختصر ثابت ومستقر؛ اطبع الرمز مرة واحدة للأبد على طاولاتك دون قلق من أي تغيير
                مستقبلي.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">💰</div>
              <h3 class="feature-title">تعديل فوري للأسعار</h3>
              <p class="feature-desc">
                حدّث أسعار أطباقك بالجنيه المصري فوراً من موبايلك لمواكبة التغيرات دون أي تكلفة
                طباعة.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">📁</div>
              <h3 class="feature-title">إدارة مرنة للأقسام</h3>
              <p class="feature-desc">
                نظّم قوائمك بسهولة (مقبلات، أطباق رئيسية، مشروبات، حلويات) ورتّب أولويات العرض كما
                تشاء.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">📸</div>
              <h3 class="feature-title">صور أطباق احترافية</h3>
              <p class="feature-desc">
                اعرض وجباتك بصور واضحة بأبعاد متناسقة تفتح الشهية وتساعد العملاء على اتخاذ قرارهم
                بسرعة.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">🎨</div>
              <h3 class="feature-title">هوية بصرية مخصصة</h3>
              <p class="feature-desc">
                أضف شعار مطعمك واختر ألوان علامتك التجارية لتبدو القائمة امتداداً طبيعياً لديكور
                وهوية المكان.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">🌐</div>
              <h3 class="feature-title">دعم كامل للعربية والإنجليزية</h3>
              <p class="feature-desc">
                تجربة متكاملة تدعم التبديل السلس بين اللغتين (RTL / LTR) بلمسة واحدة دون إعادة
                تحميل.
              </p>
            </div>
            <div class="feature-box">
              <div class="feature-icon">🚀</div>
              <h3 class="feature-title">قائمة متجاوبة وفائقة السرعة</h3>
              <p class="feature-desc">
                أداء خفيف ومتجاوب يعمل بسلاسة على كل مقاسات الهواتف والشاشات بأعلى معايير الويب
                الحديثة.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. How It Works Section -->
      <section id="how-it-works" class="section-padded bg-muted">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-brand">خطوات البدء</span>
            <h2 class="section-title">ابدأ مع القائمة الرقمية في 3 خطوات</h2>
            <p class="section-subtitle">
              إعداد سهل وسريع يتيح لك إطلاق قائمة مطعمك الرقمية خلال دقائق.
            </p>
          </div>

          <div class="steps-grid">
            <div class="step-card">
              <div class="step-number">1</div>
              <h3 class="step-title">اضبط بيانات مطعمك</h3>
              <p class="step-desc">
                أدخل اسم المطعم، وارفع شعارك، واختر ألوان هويتك البصرية من لوحة الإعدادات.
              </p>
            </div>
            <div class="step-card">
              <div class="step-number">2</div>
              <h3 class="step-title">أضف الأقسام والأطباق</h3>
              <p class="step-desc">
                أدخل أسماء الأطباق بالعربية والإنجليزية مع الأسعار بالجنيه المصري وصور الوجبات.
              </p>
            </div>
            <div class="step-card">
              <div class="step-number">3</div>
              <h3 class="step-title">اعرض رمز QR على الطاولات</h3>
              <p class="step-desc">
                حمّل رمز الاستجابة السريعة بجودة عالية للطباعة وضعه على طاولاتك ليتصفح ضيوفك فوراً.
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
              <span class="badge badge-brand">معاينة حية</span>
              <h2 class="preview-title">شاهد كيف تبدو قائمتك لعملائك</h2>
              <p class="preview-desc">
                تصفح الآن النموذج التجريبي الحي لترى بنفسك سرعة التصفح وتناسق الأطباق والألوان على
                الهواتف.
              </p>
              <div class="preview-actions">
                <a routerLink="/r/demo" class="btn btn-primary btn-lg"
                  >تصفح القائمة التجريبية الحية</a
                >
              </div>
            </div>
            <div class="preview-mockup-frame" aria-hidden="true">
              <div class="sample-dish-badge">💡 نموذج تجريبي معتمد</div>
              <div class="sample-card">
                <div class="sample-title">قهوة عربية فاخرة</div>
                <div class="sample-price">45.00 ج.م</div>
                <div class="sample-status">🟢 متوفر للطلب المباشر</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 7. Who is it for? (Audience) -->
      <section id="audience" class="section-padded bg-muted">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge badge-brand">القطاعات المستفيدة</span>
            <h2 class="section-title">لمن صُممت القائمة الرقمية؟</h2>
            <p class="section-subtitle">
              حلول مرنة ومثالية تناسب كافة مجالات تقديم الأغذية والمشروبات.
            </p>
          </div>

          <div class="audience-grid">
            <div class="audience-card">
              <div class="audience-icon">🍽️</div>
              <h3 class="audience-title">المطاعم الفاخرة والسريعة</h3>
              <p class="audience-desc">
                تسريع تجربة الجلوس واستعراض كامل الخيارات بتصميم راقٍ يليق بضيوفك.
              </p>
            </div>
            <div class="audience-card">
              <div class="audience-icon">☕</div>
              <h3 class="audience-title">المقاهي والكافيهات</h3>
              <p class="audience-desc">
                مرونة تحديث أصناف القهوة، المشروبات الموسمية، وعروض اليوم الطازجة.
              </p>
            </div>
            <div class="audience-card">
              <div class="audience-icon">🍰</div>
              <h3 class="audience-title">محلات الحلويات والمخابز</h3>
              <p class="audience-desc">
                إبراز الحلويات والمخبوزات بصور شهية وتحديث الأصناف المتوفرة أولاً بأول.
              </p>
            </div>
            <div class="audience-card">
              <div class="audience-icon">🚚</div>
              <h3 class="audience-title">عربات الطعام (Food Trucks)</h3>
              <p class="audience-desc">
                توفير مساحات القوائم المعلقة وحمايتها من العوامل الجوية مع سرعة التعديل.
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
            <h2 class="section-title">باقات مرنة تناسب حجم نشاطك</h2>
            <p class="section-subtitle">
              اختر الباقة المناسبة لمطعمك وابدأ بتجربة استعراض رقمية متكاملة.
            </p>
            <div class="pricing-disclaimer">
              ⚠️ ملاحظة: الأسعار المعروضة أدناه هي نماذج استرشادية قابلة للتخصيص بحسب حجم النشاط
              وليست نهائية.
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
                <li>✓ رمز QR دائم للطاولات</li>
                <li>✓ حتى 5 أقسام رئيسية</li>
                <li>✓ حتى 40 طبقاً ومشروباً</li>
                <li>✓ دعم ثنائي للغتين العربية والإنجليزية</li>
                <li>✓ لوحة تحكم موبايل سريعة</li>
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
                <li>✓ تحديث فوري لحالة الأطباق ("نفد")</li>
                <li>✓ أولوية الدعم الفني والاستشارات</li>
              </ul>
              <a href="#request" class="btn btn-primary btn-block">طلب الباقة</a>
            </div>
          </div>
        </div>
      </section>

      <!-- 9. FAQ Section -->
      <section id="faq" class="section-padded bg-muted">
        <div class="container max-w-readable">
          <div class="section-header text-center">
            <span class="badge badge-brand">الأسئلة المتكررة</span>
            <h2 class="section-title">إجابات على الأسئلة الشائعة</h2>
            <p class="section-subtitle">كل ما ترغب بمعرفته حول نظام القائمة الرقمية.</p>
          </div>

          <div class="faq-accordion">
            <details class="faq-item" open>
              <summary class="faq-question">هل يحتاج العميل لتحميل تطبيق لتصفح المنيو؟</summary>
              <div class="faq-answer">
                لا، إطلاقاً. يفتح المنيو فوراً في متصفح الهاتف بمجرد توجيه كاميرا الهاتف نحو رمز الـ
                QR دون الحاجة لتثبيت أي تطبيق أو تسجيل دخول.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">
                هل يتغير رمز الـ QR إذا قمت بتعديل الأسعار أو إضافة أطباق؟
              </summary>
              <div class="faq-answer">
                لا يتغير الرمز أبداً. رمز الـ QR دائم وثابت (Permanent Link). يمكنك تحديث كل أطباقك
                وأسعارك آلاف المرات دون الحاجة لإعادة طباعة الرمز على الطاولات.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">كيف أقوم بتعديل القائمة والأسعار؟</summary>
              <div class="faq-answer">
                من خلال لوحة تحكم بسيطة للغاية ومصممة للعمل بسلاسة من الهاتف المحمول، تتيح لك تعديل
                أي سعر أو تبديل حالة طبق في ثوانٍ معدودة.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">هل تدعم القائمة اللغتين العربية والإنجليزية؟</summary>
              <div class="faq-answer">
                نعم، تدعم القائمة واجهة ثنائية اللغة متكاملة (عربي RTL وإنجليزي LTR) مع إمكانية
                التبديل بنقرة زر واحدة تناسب كافة الزوار والسياح.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">ماذا يحدث إذا نفد طبق معين أثناء اليوم؟</summary>
              <div class="faq-answer">
                بنقرة زر واحدة من هاتفك، يمكنك تحويل حالة الطبق إلى "نفد" وسيظهر للعملاء فوراً بهذا
                الشكل دون الحاجة لحذفه من القائمة.
              </div>
            </details>

            <details class="faq-item">
              <summary class="faq-question">هل يشمل النظام خيارات الدفع أو الطلب أونلاين؟</summary>
              <div class="faq-answer">
                النظام في إصداره الحالي مخصص للاستعراض فقط (Display-Only MVP) بهدف تقديم أسرع وأبسط
                تجربة تصفح لضيوف الطاولات، ولا يتضمن عمليات الدفع أو سلة المشتريات.
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
            <h2 class="section-title">اطلب منيو مطعمك الرقمي الآن</h2>
            <p class="section-subtitle">
              املأ النموذج أدناه لتجهيز قائمة مطعمك وسنتواصل معك فوراً لتأكيد التفاصيل.
            </p>
          </div>

          <div class="request-form-card">
            <div class="lead-api-notice" role="note">
              <span class="notice-icon">ℹ️</span>
              <div class="notice-text">
                <strong>إشعار فني:</strong> نموذج طلب الخدمة في مرحلة العرض والتحقق الأولي (Frontend
                Pre-flight). سيتم تفعيل الإرسال المباشر فور اعتماد واجهة استقبال الطلبات الرسمية
                (Lead API).
              </div>
            </div>

            <form class="service-form" (ngSubmit)="onFormSubmit()" #form="ngForm">
              <div class="form-group">
                <label for="contactName" class="form-label"
                  >اسم جهة الاتصال <span class="required">*</span></label
                >
                <input
                  type="text"
                  id="contactName"
                  name="contactName"
                  class="form-input"
                  placeholder="مثال: أحمد محمود"
                  required
                  minlength="2"
                  maxlength="80"
                  [(ngModel)]="formData.contactName"
                  #nameCtrl="ngModel"
                />
                @if (nameCtrl.invalid && nameCtrl.touched) {
                  <span class="form-error">يرجى إدخال اسم جهة الاتصال (حرفين على الأقل).</span>
                }
              </div>

              <div class="form-group">
                <label for="restaurantName" class="form-label"
                  >اسم المطعم أو النشاط <span class="required">*</span></label
                >
                <input
                  type="text"
                  id="restaurantName"
                  name="restaurantName"
                  class="form-input"
                  placeholder="مثال: مطعم الشرق للأكلات الشعبية"
                  required
                  minlength="2"
                  maxlength="100"
                  [(ngModel)]="formData.restaurantName"
                  #restCtrl="ngModel"
                />
                @if (restCtrl.invalid && restCtrl.touched) {
                  <span class="form-error">يرجى إدخال اسم المطعم أو النشاط.</span>
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
                  <option value="restaurant">مطعم</option>
                  <option value="cafe">مقهى / كافيه</option>
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
                  الإرسال بانتظار تفعيل واجهة الـ API
                </button>
                <span class="form-hint">
                  🔒 نلتزم بحماية بياناتك؛ لن يتم استخدام رقمك إلا للتواصل بشأن إعداد المنيو.
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
            <span class="badge badge-brand badge-sm">سحابي</span>
          </div>
          <p class="footer-desc">
            المنصة العربية السحابية الأولى لعرض القوائم الرقمية الذكية للمطاعم والمقاهي. سرعة فائقة،
            أناقة كاملة، وتحكم فوري دون طباعة.
          </p>
        </div>

        <div class="footer-links-col">
          <h4 class="footer-heading">روابط سريعة</h4>
          <ul class="footer-links-list">
            <li><a href="#features">المميزات</a></li>
            <li><a href="#how-it-works">كيف تعمل</a></li>
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
    businessType: 'restaurant',
    message: '',
  };

  constructor() {
    inject(Title).setTitle('القائمة الرقمية — منيو مطعمك… بشكل أذكى وأجمل');
    inject(Meta).updateTag({
      name: 'description',
      content:
        'خلّي عملاءك يشوفوا الأطباق والأسعار بمجرد مسح QR، وغيّر المنيو في أي وقت من غير إعادة طباعة. منصة رقمية سحابية للمطاعم والمقاهي.',
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
