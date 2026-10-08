import Logo from "@/components/Logo";

/* ============================================================
   SuspendedScreen — شاشة الإبطال الاحترافية
   تُعرض في المسارات العامة (/verify و /share و /print) لصالح
   العقود التي تجمد صاحبها بسبب مخالفة مالية لشروط الاستخدام
   (غش أو رقم عملية وهمي). تُحجب كل بيانات العقد تماماً.
   ============================================================ */

export default function SuspendedScreen() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div className="verify-block card" style={{ maxWidth: 560 }}>
        {/* الترويسة بالهوية الرسمية */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 22px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              padding: "5px 8px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #071f1a, #1d4a3e)",
              boxShadow: "0 2px 10px rgba(7,31,26,0.25)",
            }}
          >
            <Logo height={20} />
          </span>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            خدمة التحقق من العقود الرقمية
          </small>
        </div>

        {/* صندوق الإبطال */}
        <div style={{ padding: 26 }}>
          <div
            className="verify-block__box"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
              padding: "22px 18px",
              borderRadius: 16,
              border: "1.5px solid #f5c2c2",
              background: "#fdecec",
              color: "#b91c1c",
              textAlign: "center",
            }}
          >
            <i
              className="fas fa-ban"
              style={{ fontSize: 40, opacity: 0.85 }}
              aria-hidden="true"
            />
            <div>
              <b
                style={{
                  display: "block",
                  fontSize: 16,
                  marginBottom: 4,
                  color: "#991b1b",
                }}
              >
                تم إبطال وثيقة ميثاق
              </b>
              <span style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.8 }}>
                تم إبطال وثيقة ميثاق وتجميد بصمة الـ SHA-256 ورمز التحقق QR
                نظراً لمخالفة مالية لشروط الاستخدام.
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px dashed var(--line)",
              fontSize: 11,
              color: "var(--muted)",
              lineHeight: 1.8,
              textAlign: "center",
            }}
          >
            تم حجب كل بيانات الوثيقة من العرض العام — بما فيها المحتوى والبصمة
            الرقمية. إن كنت صاحب الوثيقة وترى هذه الشاشة بالخطأ، تواصل مع
            الدعم عبر الواتساب لرجم الحالة.
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <a className="btn btn-soft" href="/">
              <i className="fas fa-house" />
              العودة إلى المنصة
            </a>
            <a
              className="btn btn-wa"
              href="https://wa.me/9639XXXXXXXX"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fab fa-whatsapp" />
              تواصل مع الدعم
            </a>
          </div>
        </div>

        <div
          style={{
            padding: "12px 22px",
            borderTop: "1px solid var(--line)",
            textAlign: "center",
            fontSize: 10,
            color: "var(--muted)",
          }}
        >
          🛡️ منظومة ميثاق للتوثيق الإلكتروني — حُجبت هذه الوثيقة بقرار إداري
        </div>
      </div>
    </main>
  );
}
