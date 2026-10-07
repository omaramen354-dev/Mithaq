"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";

/* ============================================================
   OwnerSignFlow — لوحة فلو التوقيع داخل صفحة /sign/[id]
   ثلاث مراحل بنفس ترتيب النسخة القديمة (openSigningView):
   ١) توقيع الطرف الأول فوراً عند فتح الصفحة (بلا نزول للأسفل)
   ٢) زر «مشاركة للتوقيع» لإرسال الرابط للطرف الثاني
   ٣) العقد النهائي الموقّع من الطرفين
   ============================================================ */

type ContractLite = {
  id: string;
  type: string;
  party1Name: string;
  party2Name: string;
  status: string;
  updatedAt?: string | Date | null;
};

type Props = {
  contract: ContractLite;
  shareToken: string;
  shareUrl: string;
  party1Name: string;
  party2Name: string;
  sig1: boolean;
  sig2: boolean;
};

type Point = { x: number; y: number };

export default function OwnerSignFlow({
  contract,
  shareToken,
  shareUrl,
  party1Name,
  party2Name,
  sig1,
  sig2,
}: Props) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef<Point[][]>([]);
  const [name, setName] = useState(party1Name || "");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const stage = sig2 ? 3 : sig1 ? 2 : 1;
  const waHref = whatsappLink(buildOfficialShareMessage(contract, shareUrl));

  /* ===== رسم التوقيع ===== */
  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(r.width * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#18251F";
    for (const s of strokesRef.current) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    }
  }

  function hasInk(): boolean {
    return strokesRef.current.some((s) => s.length >= 2);
  }

  async function submit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk() || !name.trim() || !ack || busy) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch(
        `/api/contracts/${encodeURIComponent(shareToken)}/signatures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            party: "party1",
            name: name.trim(),
            signatureData: dataUrl,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "تعذر حفظ التوقيع");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="no-print" style={{ maxWidth: 860, margin: "0 auto 16px" }}>
      {/* ===== شريط المراحل ===== */}
      <div className="sign-steps" aria-label="مراحل العقد">
        <div className={`sign-step ${stage === 1 ? "active" : stage > 1 ? "done" : ""}`}>
          <i className={stage > 1 ? "fas fa-check" : "fas fa-pen-nib"} />
          <span>١ – التوقيع</span>
        </div>
        <div className={`sign-step ${stage === 2 ? "active" : stage > 2 ? "done" : ""}`}>
          <i className={stage > 2 ? "fas fa-check" : "fas fa-share-nodes"} />
          <span>٢ – مشاركة للتوقيع</span>
        </div>
        <div className={`sign-step ${stage === 3 ? "active" : ""}`}>
          <i className="fas fa-file-circle-check" />
          <span>٣ – العقد النهائي</span>
        </div>
      </div>

      {/* ===== المرحلة ١: توقيع الطرف الأول ===== */}
      {!sig1 && (
        <div className="card" style={{ padding: "18px 22px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>✍️</span>
            <div>
              <b style={{ fontSize: 14.5, color: "var(--green)" }}>
                توقيع الطرف الأول — {party1Name}
              </b>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                وقّع على العقد مباشرة، ثم شارك رابط التوقيع مع الطرف الثاني — لا حاجة
                للنزول للأسفل، الوثيقة أمامك أدناه.
              </p>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: 150,
              border: "1.5px dashed #c7cdd4",
              borderRadius: 10,
              background: "#fff",
              touchAction: "none",
              cursor: "crosshair",
              display: "block",
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawingRef.current = true;
              strokesRef.current.push([pointerPos(e)]);
              paint();
            }}
            onPointerMove={(e) => {
              if (!drawingRef.current) return;
              const s = strokesRef.current[strokesRef.current.length - 1];
              const p = pointerPos(e);
              const prev = s[s.length - 1];
              if (prev && Math.abs(p.x - prev.x) < 2 && Math.abs(p.y - prev.y) < 2) return;
              s.push(p);
              paint();
            }}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
            onPointerLeave={() => {
              drawingRef.current = false;
            }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-soft"
              style={{ padding: "7px 13px" }}
              type="button"
              onClick={() => {
                strokesRef.current.pop();
                paint();
              }}
            >
              ↶ تراجع
            </button>
            <button
              className="btn btn-soft"
              style={{ padding: "7px 13px" }}
              type="button"
              onClick={() => {
                strokesRef.current = [];
                paint();
              }}
            >
              ✕ مسح
            </button>
          </div>

          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 800,
              color: "var(--muted)",
              margin: "12px 0 4px",
            }}
          >
            الاسم الكامل كما يُدوَّن مع التوقيع
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1.5px solid var(--line)",
              borderRadius: 9,
              font: "inherit",
            }}
          />

          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 11.5,
              color: "var(--muted)",
              background: "#f9fafb",
              border: "1px solid var(--line)",
              borderRadius: 9,
              padding: "10px 12px",
              marginTop: 12,
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              بأني اطّلعت على كامل بنود العقد وفهمت مضمونه وأوافق على الالتزام به، وأفهم أن
              التوقيع يُسجَّل مع الوقت وبيانات الجهاز ورقم IP لأغراض الإثبات.
            </span>
          </label>

          {error && (
            <p style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button
              className="btn"
              disabled={!hasInk() || !name.trim() || !ack || busy}
              onClick={submit}
              type="button"
            >
              <i className="fas fa-check" /> {busy ? "جاري الحفظ…" : "توقيع الطرف الأول"}
            </button>
            <a className="btn btn-soft" href="#mithaq-sheet">
              عرض الوثيقة أدناه ↓
            </a>
          </div>
        </div>
      )}

      {/* ===== المرحلة ٢: مشاركة للتوقيع ===== */}
      {sig1 && !sig2 && (
        <div className="card" style={{ padding: "18px 22px", borderColor: "#bfe3cd" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span className="status-badge status-active">✓ {party1Name} — تم التوقيع</span>
            <span className="status-badge status-partial">⏳ {party2Name} — بانتظار التوقيع</span>
          </div>
          <b style={{ fontSize: 15, color: "var(--green)" }}>
            <i className="fas fa-paper-plane" style={{ color: "var(--gold)", marginLeft: 6 }} />
            أرسل العقد إلى الطرف الثاني للتوقيع
          </b>
          <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "6px 0 12px" }}>
            توقيعك محفوظ. شارك رابط التوقيع مع الطرف الثاني ليوقّع من جهازه — يتحدّث
            العقد تلقائياً فور توقيعه ويصير العقد النهائي.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">
              <i className="fab fa-whatsapp" /> مشاركة للتوقيع
            </a>
            <button className="btn btn-soft" type="button" onClick={copyLink}>
              <i className="fas fa-link" /> {copied ? "✓ تم نسخ الرابط" : "نسخ رابط التوقيع"}
            </button>
            <a className="btn btn-soft" href={`/verify/${shareToken}`} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-shield-halved" /> صفحة التحقق
            </a>
          </div>
        </div>
      )}

      {/* ===== المرحلة ٣: العقد النهائي ===== */}
      {sig1 && sig2 && (
        <div
          className="card"
          style={{ padding: "18px 22px", borderColor: "#bfe3cd", background: "#f2fbf5" }}
        >
          <b style={{ fontSize: 15.5, color: "var(--green-2)" }}>
            ✓ العقد النهائي — موقّع من الطرفين
          </b>
          <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "6px 0 12px" }}>
            تم اعتماد الوثيقة وتوقيعها رقمياً من الطرفين مع ختم البصمة SHA-256. الوثيقة
            الكاملة أدناه — اطبعها أو شارك رابط التحقق.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => window.print()}>
              <i className="fas fa-print" /> طباعة / PDF
            </button>
            <a className="btn btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">
              <i className="fab fa-whatsapp" /> مشاركة العقد
            </a>
            <a className="btn btn-soft" href={`/verify/${shareToken}`} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-shield-halved" /> صفحة التحقق
            </a>
            <a className="btn btn-soft" href="/#contracts">
              <i className="fas fa-arrow-right" /> رجوع للعقود
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
