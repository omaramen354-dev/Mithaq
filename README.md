# ميثاق — النسخة الثانية (Next.js + Neon + Vercel)

منصة العقود العربية الذكية، معاد بناؤها بالكامل:
Next.js App Router · Neon Serverless Postgres · Drizzle ORM · Auth.js v5 (Google)

> ✅ البناء مُختبَر: `next build` ناجح — والـ typecheck (`npm run typecheck`) نظيف

---

## ⚡ شورت — الأساسيات في 30 ثانية

| السؤال | الجواب |
|---|---|
| ما هذا؟ | منصة عربية (RTL) لإنشاء العقود القانونية من قوالب جاهزة، توقيع رقمي عن بُعد، بصمة تحقق SHA-256، وPDF لحظي |
| التقنية | Next.js (App Router) + Neon Postgres + Drizzle + Auth.js v5 (Google) |
| التشغيل | `npm install` ← عدّل `.env.local` ← `npx drizzle-kit push` ← `npm run dev` |
| النشر | Vercel + دومين `miithaq.com` (الخطوات أدناه) |
| الدخول؟ | **اختياري** — الضيف يجرّب ويحفظ مسودة محلية، والدخول بجوجل يُطلب عند الحفظ |
| الأوامر | `dev` / `build` / `start` / `lint` / `typecheck` |

**مسارات عامة بدون تسجيل:** `/` (اللوحة) · `/share/[id]` · `/verify/[id]`

---

## 🆕 آخر التحديثات

- **نافذة إنشاء العقد المنبثقة (ContractModal)** — بنفس تصميم النسخة القديمة:
  ترويسة زمردية بخط ذهبي، شريط مراحل، وقوائم منبثقة متطورة:
  - منتقي **عملة** (USD/EUR/SYP/SAR/AED/USDT) بحقل مبلغ مقسوم
  - **منتقي تاريخ** كامل (شبكة أيام + اليوم/مسح) بالعربية
  - **دولة ← مدينة** مع بحث فوري والمدن تتبع الدولة
  - **مدة** رقم + وحدة بصياغة عربية صحيحة (يوم واحد / يومان / 3 أيام…)
  - **طريقة سداد** بقائمة بحث (شام كاش، USDT، تحويل بنكي…) مع قيمة مخصصة
  - **معاينة حية** لنص العقد أثناء الكتابة + بنود قابلة للاختيار
- **فتح المودال من كل مكان**: زر الهيرو، رابط السايدبار، زر «+» في الشريط العلوي،
  وبطاقات القوالب — عبر الأحداث `mithaq:open-contract-modal` و `mithaq:pick-type`
  (بدون تمرير للصفحة)
- **استراتيجية Guest-First**: الصفحة الرئيسية عامة؛ الضيف يبني العقد كاملاً وتُحفظ
  **مسودته محلياً** (`mithaq.guestDraft.v1`) وتُستعاد تلقائياً بعد تسجيل الدخول
  عبر `POST /api/contracts/restore`
- **بوابة الدخول عند الحفظ** (`LoginGateModal`) بدل حجب اللوحة كلياً
- **استعادة المسودة من مكان واحد**: النموذج المضمّن القديم أُزيل من الصفحة
  واستُبدل بالمودال — لا ازدواج في الاستعادة أو الطلبات
- **بيانات القوائم مستخرجة** إلى `src/lib/contract-form-data.ts` (عملات، ~67 دولة
  بأعلامها ومدنها، طرق سداد، منطق التطبيع العربي `normAr`)
- **لوحة أدمن** على `/admin` + صورة OG مولّدة بخط ثمانية (`opengraph-image`)

---

## 1) إنشاء قاعدة البيانات (Neon)

1. أنشئ حساباً على [Neon](https://neon.tech) → **Create project**
2. انسخ **Connection string** (يشبه:
   `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`)
3. الصقه في `.env.local` مكان قيمة `DATABASE_URL`
4. أنشئ الجداول (schema: users, contracts, signature_events, guest_prompt_seen, payment_requests):

```bash
npx drizzle-kit push
```

> 💡 استخدم **pooled connection** من Neon للإنتاج على Vercel، والمباشر (direct)
> للترحيلات محلياً.

---

## 2) تسجيل الدخول عبر Google

1. افتح [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. أنشئ **OAuth client ID** → نوع **Web application**
3. أضف **Authorized redirect URIs**:

   ```
   http://localhost:3000/api/auth/callback/google
   https://miithaq.com/api/auth/callback/google
   ```

4. انسخ Client ID و Client Secret إلى `.env.local` (انظر جدول المتغيرات أدناه)

---

## 3) التشغيل المحلي

```bash
npm install
npm run dev        # http://localhost:3000
```

فحوصات الجودة:

```bash
npm run typecheck  # TypeScript بلا إخراج
npm run lint       # ESLint
npm run build      # بناء الإنتاج
```

> ⚠️ **مهم لجهازك (Windows):** إن علّق npm بسبب شبكة تمنع IPv6 (`ENETUNREACH`)،
> نفّذ مرة واحدة:
>
> ```bash
> setx NODE_OPTIONS "--dns-result-order=ipv4first"
> ```
>
> ثم أعد فتح الطرفية — يصلح npm وnode نهائياً.

---

## 4) النشر على Vercel + ربط miithaq.com

1. ارفع المستودع إلى GitHub
2. في [vercel.com](https://vercel.com) → **Add New Project** → اختر المستودع
   (يكتشف Next.js تلقائياً — لا إعدادات بناء مطلوبة)
3. أضف **Environment Variables** (نسخة Production):

   | المتغير | القيمة |
   |---|---|
   | `DATABASE_URL` | رابط Neon — استخدم **pooled connection** للإنتاج |
   | `AUTH_SECRET` | سلسلة عشوائية طويلة (`openssl rand -base64 32`) |
   | `AUTH_GOOGLE_ID` | من خطوة Google |
   | `AUTH_GOOGLE_SECRET` | من خطوة Google |
   | `NEXT_PUBLIC_BASE_URL` | `https://miithaq.com` |
   | `ADMIN_EMAILS` | بريدك (فاصلة بين أكثر من بريد) |

4. Deploy ثم: **Settings → Domains → Add** → `miithaq.com`
5. عند مسجّل الدومين: سجل **CNAME** باسم `www` يشير إلى `cname.vercel-dns.com`،
   وسجل **A** باسم `@` يشير إلى `76.76.21.21` — أو اتبع القيم التي تعرضها
   Vercel لك حرفياً
6. HTTPS يُفعَّل تلقائياً بعد انتشار DNS

---

## هيكلية المشروع

```
├── src/
│   ├── db/
│   │   ├── schema.ts            # 5 جداول (users, contracts, signature_events, guest_prompt_seen, payment_requests)
│   │   └── index.ts             # اتصال Neon عبر Drizzle (neon-http)
│   ├── auth.config.ts           # إعداد Edge للـ middleware (بلا DB)
│   ├── lib/
│   │   ├── auth.ts              # Auth.js v5 + مزامنة users + صلاحية المشرف
│   │   ├── clauses.ts           # البنود الافتراضية لكل أنواع العقود
│   │   ├── contract-text.ts     # بناء نص العقد + تعبئة الحقول الديناميكية
│   │   ├── contract-types.ts    # أنواع العقود وأسماؤها
│   │   ├── contract-form-data.ts# بيانات القوائم: عملات، دول ومدن، طرق سداد، normAr
│   │   ├── guest-draft.ts       # مسودة الضيف المحلية + الاستعادة بعد الدخول
│   │   ├── fingerprint.ts       # بصمة SHA-256 + مرجع MEQ + روابط المشاركة
│   │   ├── whatsapp.ts          # رسالة المشاركة الرسمية
│   │   ├── telegram.ts          # إشعارات تيليجرام (اختياري)
│   │   └── format.ts            # التواريخ العربية
│   ├── middleware.ts            # Guest-First: الصفحة الرئيسية و /share و /verify عامة؛ الحماية داخل الـ API
│   ├── app/
│   │   ├── page.tsx             # لوحة العقود (عامة — الدخول عند الحفظ)
│   │   ├── mithaq.css           # التصميم الأسطوري + ستايلات المودال
│   │   ├── admin/               # لوحة الأدمن
│   │   ├── login/               # تسجيل الدخول بـ Google
│   │   ├── share/[id]/          # صفحة الطرف الثاني العامة + لوحة توقيعه
│   │   ├── verify/[id]/         # التحقق من سلامة العقد بالبصمة
│   │   ├── print/[id]/          # نسخة A4 للطباعة/PDF (لحظية من DB)
│   │   ├── opengraph-image.tsx  # صورة المشاركة بخط ثمانية
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── contracts/               # GET قائمة + POST إنشاء (401 للضيف)
│   │       ├── contracts/restore/       # استعادة مسودة الضيف بعد الدخول
│   │       ├── contracts/[id]/          # GET/PUT/DELETE
│   │       ├── contracts/[id]/signatures/   # توقيع الأطراف (يحدّث الحالة)
│   │       ├── contracts/[id]/share-info/   # بيانات نافذة الإرسال
│   │       ├── guest-prompt/            # حالة تنبيه الضيف
│   │       ├── me/  ·  health/
│   │       └── verify/[id]/             # تحقق برمجي بالبصمة
│   └── components/
│       ├── dashboard/
│       │   ├── ContractModal.tsx        # نافذة إنشاء العقد (تُفتح من كل الأزرار)
│       │   ├── MithaqSidebar.tsx        # السايدبار الزمردي
│       │   ├── MithaqHero.tsx / MithaqSections.tsx
│       │   ├── ClausePickerModal.tsx    # اختيار البنود
│       │   ├── LoginGateModal.tsx       # بوابة الدخول عند الحفظ
│       │   ├── SaveSuccessModal.tsx     # نجاح الحفظ + زر واتساب
│       │   └── ContractsTable.tsx       # جدول عقود المستخدم
│       ├── signing/ShareSignPad.tsx     # لوحة توقيع الطرف الثاني عن بُعد
│       └── print/PrintButton.tsx        # زر الطباعة/PDF
├── drizzle.config.ts            # إعداد drizzle-kit
└── .env.local                   # أسرارك (غير مرفوع لgit)
```

---

## نقاط تصميمية مهمة

- **PDF لحظي بلا تخزين**: العقد (نص + توقيعات base64) في Neon، والـ PDF
  يُولَّد عبر طباعة المتصفح من `/print/[id]` — يعمل على Vercel مجاناً ويحافظ
  على العربية وRTL
- **المودال بدل الصفحة**: إنشاء العقد كله في نافذة واحدة بقوائم منبثقة أصلية
  (عملة/تاريخ/دولة/مدة/سداد) — تجربة النسخة القديمة نفسها بدون أخطاء الأزرار
- **حالة الأزرار من قاعدة البيانات**: كل نافذة تقرأ حالة العقد من Neon مباشرة
  (source of truth واحد)
- **توقيع الطرف الثاني عبر الرابط فقط**: صفحة `/share/[id]` العامة تحفظ
  التوقيع في Neon مع IP + جهاز + وقت (جدول signature_events للإثبات)
- **البصمة الموحّدة**: SHA-256 لحقل واحد مشترك بين الإنشاء والتوقيع والتحقق —
  أي تغيير حرفي على العقد يُكتشف في `/verify/[id]`
- **مسودة الضيف آمنة**: تُخزَّن محلياً في المتصفح وتُنقل للسيرفر مرة واحدة
  بعد تسجيل الدخول (claim)، فلا تُفقد أي بيانات
- **أول مستخدم يصبح مشرفاً** تلقائياً في قاعدة نظيفة (ما لم تحدد `ADMIN_EMAILS`)

---

## 💡 نصائح

### للتشغيل والإنتاج
- **نسخ احتياطي للقاعدة**: Neon يوفر History بمدة حسب خطتك — للمشاركة الجادة
  فعّل دوريّات `pg_dump` أو خطة أعلى قبل إطلاق المستخدمين الحقيقيين
- **لا تشارك `DATABASE_URL` أبداً** ولا ترفع `.env.local` — لو تسربت، بدّل
  كلمة المرور من Neon فوراً
- **`ADMIN_EMAILS` من اليوم الأول**: خلافها أول حساب يصبح مشرفاً تلقائياً —
  قد لا يكون حسابك أنت
- **راجع سرعة الطلبات**: Neon free tier يخفض النشط بعد الخمول — أول طلب بعد
  الخمول أبطأ (cold start)؛ طبيعي على Vercel serverless
- **اختبر `/api/health` بعد كل نشر**: `https://miithaq.com/api/health` يجب أن
  يرجع `ok:true` — أسرع فحص أن الداتابايز متصلة

### للجودة والدقة القانونية
- **دقّق القوالب قانونياً مرة واحدة** لدى مختص قبل التسويق — القوالب مراجعة
  لكن ميثاق وثيقة تنظيمية لا يغني عن المحامي في الحالات المعقدة (اكتب ذلك
  في شروط الاستخدام)
- **أضف أنواع عقود جديدة بثلاث خطوات فقط**: نوع في `contract-types.ts` +
  بنود في `clauses.ts` + (إن لزم) حقول ديناميكية في `contract-text.ts` —
  المودال والقوالب يلتقطانه تلقائياً
- **عدّل بيانات الدول/العملات** من `contract-form-data.ts` وحدها — لا تلمس
  المودال

### للتطوير
- **`npm run typecheck` قبل كل commit** — أسرع من build ويكشف 90% من الأخطاء
- **حدثا المودال**: `mithaq:open-contract-modal` (فتح فارغ) و
  `mithaq:pick-type` (فتح بنوع محدد) — أي زر جديد في المستقبل يطلق أحدهما
  بدل منطق خاص
- **النسخة القديمة محفوظة** في `archive/legacy-app/` للرجوع إلى التصميم
  والمنطق الأصلي عند الحاجة — لا تنشرها

### أفكار للخطوة القادمة
- [ ] ربط بوابة دفع آلية (شام كاش / USDT) لتغليق payment_requests
- [ ] إشعارات تيليجرام عند توقيع الطرف الثاني (الكود جاهز — فعّل المتغيرين)
- [ ] صفحة أرشيف ببحث وفلاتر للحالات (مسودة/بانتظار توقيع/موقّع)
- [ ] نسخة PWA للاستخدام من الجوال كتطبيق
