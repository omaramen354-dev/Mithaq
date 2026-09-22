# ميثاق — النسخة الثانية (Next.js + Neon + Vercel)

منصة العقود العربية الذكية، معاد بناؤها بالكامل:
Next.js App Router · Neon Serverless Postgres · Drizzle ORM · Auth.js v5 (Google)

> ✅ البناء مُختبَر: `next build` ناجح — 12 مسار + middleware حماية

---

## 1) إنشاء قاعدة البيانات (Neon)

1. أنشئ حساباً على Neon → **Create project**
2. انسخ **Connection string** (يشبه:
   `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`)
3. الصقه في `mithaq-next/.env.local` مكان قيمة `DATABASE_URL` المؤقتة
4. أنشئ الجداول (schema كامل: users, contracts, signature_events, payment_requests):

```bash
cd mithaq-next
npx drizzle-kit push
```

---

## 2) تسجيل الدخول عبر Google

1. افتح [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. أنشئ **OAuth client ID** → نوع **Web application**
3. أضف **Authorized redirect URIs**:

   ```
   http://localhost:3000/api/auth/callback/google
   https://miithaq.com/api/auth/callback/google
   ```

4. انسخ Client ID و Client Secret إلى `.env.local`:

   ```
   AUTH_GOOGLE_ID=xxxx.apps.googleusercontent.com
   AUTH_GOOGLE_SECRET=GOCSPX-xxxx
   ADMIN_EMAILS=بريدك@gmail.com
   ```

---

## 3) التشغيل المحلي

```bash
cd mithaq-next
npm run dev        # http://localhost:3000
```

> ⚠️ **مهم لجهازك:** شبكتك تعطّل IPv6 (`ENETUNREACH`) وهذا يعلّق npm.
> الحل الدائم — نفّذه مرة واحدة:
>
> ```bash
> setx NODE_OPTIONS "--dns-result-order=ipv4first"
> ```
> (ثم أعد فتح الطرفية — يصلح npm وnode نهائياً على جهازك)

---

## 4) النشر على Vercel + ربط miithaq.com

1. ارفع مجلد `mithaq-next` إلى مستودع GitHub
2. في [vercel.com](https://vercel.com) → **Add New Project** → اختر المستودع
   (يكتشف Next.js تلقائياً — لا إعدادات بناء مطلوبة)
3. أضف **Environment Variables** (نسخة Production):

   | المتغير | القيمة |
   |---|---|
   | `DATABASE_URL` | نفس رابط Neon (استخدم **pooled connection** من Neon للإنتاج) |
   | `AUTH_SECRET` | سلسلة عشوائية طويلة (`openssl rand -base64 32`) |
   | `AUTH_GOOGLE_ID` | من خطوة Google |
   | `AUTH_GOOGLE_SECRET` | من خطوة Google |
   | `NEXT_PUBLIC_BASE_URL` | `https://miithaq.com` |
   | `ADMIN_EMAILS` | بريدك |

4. Deploy ثم: **Settings → Domains → Add** → `miithaq.com`
5. عند مسجّل الدومين: سجل **CNAME** باسم `www` يشير إلى
   `cname.vercel-dns.com`، وسجل **A** باسم `@` يشير إلى `76.76.21.21`
   (أو القيم التي تعرضها Vercel لك — اتبعها حرفياً)
6. HTTPS يُفعَّل تلقائياً بعد انتشار DNS

---

## هيكلية المشروع

```
mithaq-next/
├── src/
│   ├── db/
│   │   ├── schema.ts            # 4 جداول (users, contracts, signature_events, payment_requests)
│   │   └── index.ts             # اتصال Neon عبر Drizzle (neon-http)
│   ├── lib/
│   │   ├── auth.ts              # Auth.js v5 + مزامنة users + صلاحية المشرف
│   │   ├── auth.config.ts       # إعداد Edge للـ middleware (بلا DB)
│   │   ├── clauses.ts           # البنود الافتراضية لكل أنواع العقود
│   │   ├── contract-text.ts     # بناء نص العقد + تعبئة الحقول الديناميكية
│   │   ├── contract-types.ts    # أنواع العقود وأسماؤها
│   │   ├── fingerprint.ts       # بصمة SHA-256 + مرجع MEQ + روابط المشاركة
│   │   ├── whatsapp.ts          # رسالة المشاركة الرسمية
│   │   ├── telegram.ts          # إشعارات تيليجرام (اختياري)
│   │   └── format.ts            # التواريخ العربية
│   ├── middleware.ts            # حماية الصفحات (عام: /share و /verify فقط)
│   ├── app/
│   │   ├── page.tsx             # لوحة العقود (محمية)
│   │   ├── login/               # تسجيل الدخول بـ Google
│   │   ├── share/[id]/          # صفحة الطرف الثاني العامة + لوحة توقيعه
│   │   ├── verify/[id]/         # التحقق من سلامة العقد بالبصمة
│   │   ├── print/[id]/          # نسخة A4 للطباعة/PDF (لحظية من DB)
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── contracts/               # GET قائمة + POST إنشاء
│   │       ├── contracts/[id]/          # GET/PUT/DELETE
│   │       ├── contracts/[id]/signatures/   # توقيع الأطراف (يحدّث الحالة)
│   │       ├── contracts/[id]/share-info/   # بيانات نافذة الإرسال
│   │       └── verify/[id]/             # تحقق برمجي بالبصمة
│   └── components/
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
- **حالة الأزرار من قاعدة البيانات**: نهاية الهجرة تحل مشكلة الأزرار الصامتة
  جذرياً — كل نافذة تقرأ حالة العقد من Neon مباشرة (source of truth واحد)
- **توقيع الطرف الثاني عبر الرابط فقط**: صفحة `/share/[id]` العامة تحفظ
  التوقيع في Neon مع IP + جهاز + وقت (جدول signature_events للإثبات)
- **البصمة الموحّدة**: SHA-256 لحقل واحد مشترك بين الإنشاء والتوقيع والتحقق —
  أي تغيير حرفي على العقد يُكتشف في `/verify/[id]`
- **أول مستخدم يصبح مشرفاً** تلقائياً في قاعدة نظيفة (ما لم تحدد `ADMIN_EMAILS`)
