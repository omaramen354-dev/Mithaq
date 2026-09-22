"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ============================================================
   ShareSignPad — لوحة توقيع الطرف الثاني داخل صفحة /share/[id]
   الرسم بالفأرة أو اللمس → POST إلى /api/contracts/[id]/signatures
   بعد النجاح: تحديث الحالة من قاعدة البيانات مباشرة (refresh)
   ============================================================ */

type Props = {
  shareToken: string;
  party2Name: string;
  alreadySigned: boolean;
  fullySigned: boolean;
  waHref: string;
};

type Point = { x: number; y: number };

export default function ShareSignPad({
  shareToken,
  party2Name,
  alreadySigned,
  fullySigned,
  waHref,
}: Props) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef<Point[][]>([]);
  const [name, setName] = useState(party2Name || "");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

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
      const res = await fetch(`/api/contracts/${encodeURIComponent(shareToken)}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party: "party2", name: name.trim(), signatureData: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "تعذر حفظ التوقيع");
      setDone(true);
      router.refresh(); // إعادة جلب الحالة من Neon مباشرة
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (fullySigned || alreadySigned) {
    return (
      <section
        className="card"
        style={{ maxWidth: 860, padding: "20px 24px", borderColor: "#bfe3cd", background: "#f2fbf5" }}
      >
        <b style={{ color: "var(--green-2)", fontSize: 15 }}>
          ✓ تم تسجيل توقيعك بنجاح — العقد {fullySigned ? "موقّع من الطرفين" : "بانتظار الاعتماد"}
        </b>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>
          شكراً لك، تم حفظ التوقيع مع وقت الجهاز وبياناته لأغراض الإثبات.
        </p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>✍️</span>
        <div>
          <b style={{ fontSize: 14 }}>
            التوقيع بصفة الطرف الثاني — {party2Name}
          </b>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
            ارسم توقيعك بيدك (بالمؤشر أو بإصبعك)، اكتب اسمك، ثم اعتمد.
          </p>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 160,
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
          style={{ padding: "8px 14px" }}
          onClick={() => {
            strokesRef.current.pop();
            paint();
          }}
          type="button"
        >
          ↶ تراجع
        </button>
        <button
          className="btn btn-soft"
          style={{ padding: "8px 14px" }}
          onClick={() => {
            strokesRef.current = [];
            paint();
          }}
          type="button"
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
          margin: "14px 0 4px",
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
          بأني اطّلعت على كامل بنود العقد المعروض وفهمت مضمونه وأوافق على الالتزام به،
          وأفهم أن التوقيع يُسجَّل مع الوقت وبيانات الجهاز ورقم IP لأغراض الإثبات.
        </span>
      </label>

      {error && (
        <p style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>
          {error}
        </p>
      )}
      {done && (
        <p style={{ color: "var(--green-2)", fontSize: 13, fontWeight: 800, marginTop: 10 }}>
          ✓ تم الحفظ
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button
          className="btn"
          disabled={!hasInk() || !name.trim() || !ack || busy}
          onClick={submit}
          type="button"
        >
          {busy ? "جاري الإرسال…" : "توقيع وإرسال"}
        </button>
        <a className="btn btn-wa" href={waHref} target="_blank" rel="noopener">
          💬 مشاركة عبر واتساب
        </a>
      </div>
    </section>
  );
}
