# ميثاق — دليل الأمان والفحص (Security & Testing)

> آخر تحديث: 2026-10-12 | مرجع سريع لفحص الموقع عبر OWASP ZAP من Kali Linux على VirtualBox، ومراجع مفتوحة المصدر المستفاد منها.

## 1) النسخ الاحتياطي قبل أي فحص أو تعديل

- **Tag للكود:** `backup-pre-zap-20261012` (لكل مرحلة مستقبلية: `backup-pre-<مرحلة>-<تاريخ>`)
- **أرشيف خارجي:** `D:/PROGRAMING/mithaq-backup-YYYYmmdd-HHMM.tar.gz` (~22MB — بدون `node_modules` / `.next` / `.git`)
- الاستعادة:
  ```bash
  tar xzf mithaq-backup-20261012-2033.tar.gz -C /d/PROGRAMING/
  # ثم npm install داخل مجلد المشروع
  ```

## 2) فحص OWASP ZAP — خطوة بخطوة من Kali على VirtualBox

### أ) تجهيز الشبكة
- في VirtualBox: إعدادات الـ VM ← Network ← **Bridged Adapter** (أو Host-Only).
- شغّل السيرفر على الويندوز: `npm run dev` (port 3000).
- من داخل كالي، تأكد أن الموقع متاح:
  ```bash
  # بدّل <WIN_IP> بعنوان الويندوز في الشبكة
  curl -I http://<WIN_IP>:3000
  ```

### ب) سير ZAP (برنامج سطحي — baseline scan بدون هجمات نشطة)
```bash
# بعد تثبيت ZAP على كالي (zaproxy) أو عبر Docker:
zap-baseline.py -t http://<WIN_IP>:3000 -r mithaq-zap-report.html
```
ملاحظات:
- الفحص الافتراضي: spider (دقيقة واحدة) + passive scan على كل صفحة يزورها.
- مسارات مؤهلة: `/`، `/pricing`، `/verify/[id]`، `/share/[id]`، `/privacy`، `/terms`.
- تمكين مزيد من الزحف: `-c 10 -r 5000` (أزيد crawler +ял-pages timeout).

### ج) Optional: Docker (أنظف على كالي)
```bash
docker pull ghcr.io/zaproxy/zaproxy:stable
docker run --rm --network host ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://<WIN_IP>:3000 -r mithaq-zap-report.html
```

### د) تفسير النتائج — الهدف للمنصة
| Alert | خطورة | معالجة |
|-------|--------|--------|
| CSP Wildcard / Missing | متوسط | موجودة في `next.config.ts` (خطوط + CDN مسموحين) |
| Cookie SameSite | منخفض | `SameSite=Lax` للـ session |
| X-Frame-Options / X-Content-Type-Options | متوسط | عن طريق `next.config.ts` headers |
| SCRF / Cookies | — | `next-auth` يجرّها افتراضياً |

## 3) مراجع مفيدة (GitHub) — قرار الدمج

| Repo | مفيد؟ | قرار |
|------|------|------|
| [zaproxy/zaproxy](https://github.com/zaproxy/zaproxy) | ✅ بلي | أداة الفحص نفسها — مرجع خارجي، لا يدمج بالكود |
| [ankane/awesome-legal](https://github.com/ankane/awesome-legal) | ✅ محدود | مرجع صيغ قانونية (إنجليزي)؛ عبّر عن كل عقد عربي أنفسنا في `src/lib/clauses.ts` |
| [GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse) | ✅ نعم | تقييم أداء Lighthouse — أداة CLI خارجية، لا تكود |
| [Accord Project](https://accordproject.org/) | ❌ لا | Smart legal contracts — خارج نطاق ميثاق (لا smart contracts) |
| [rezmoss/awesome-security-pipeline](https://github.com/rezmoss/awesome-security-pipeline) | 🔄 لاحقاً | قائمة أدوات CI/CD أمنية — بعد ZAP ونشر Vercel |

## 4) المسؤالية القانونية
- الصيغ القانونية في `src/lib/clauses.ts` هي مزارع/بنود افتراضية قابلة للتعديل — الكود يتضمن **خدمة مراجعة قانونية مدفوعة** في `/pricing` مع ملاحظة أن المستخدم مسؤول عن اعتماد الصياغة النهائية.
- صفحتان قانونيتان مطلوبة للنشر: `/privacy` + `/terms` (موجودتان).
- سجل الأحداث: جدول `activity_logs` يوثق كل إجراء إداري.

## 5) Q&A سريعة
- **ZAP سيرفر على كل جهاز؟** لا — بس أداة CLI ثانية مثل npm.
- **لازم Kali؟** لا — يمكن من الويندوز Docker Desktop يعمل نفس الشيء، بس Kali هي الأنسب للفحص الهادف.
- **شو بعد ZAP؟** نشر على Vercel (PROD mode)، ثم تسويق.
