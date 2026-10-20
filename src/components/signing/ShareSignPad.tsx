"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";

/* ============================================================
   ShareSignPad — لوحة توقيع الطرف الثاني داخل صفحة /share/[id]
   الرسم/الرفع/التصوير عبر SignaturePad الموحّد → POST إلى
   /api/contracts/[id]/signatures ثم تحديث الحالة من Neon.
   ============================================================ */

type Props = {
  shareToken: string;
  party2Name: string;
  alreadySigned: boolean;
  fullySigned: boolean;
  waHref: string;
};

export default function ShareSignPad({
  shareToken,
  party2Name,
  alreadySigned,
  fullySigned,
  waHref,
}: Props) {
  const router = useRouter();
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(party2Name || "");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (!hasInk || !name.trim() || !ack || busy) return;
    const dataUrl = padRef.current?.toDataURL() || "";
    if (!dataUrl) {
      setError("ارسم توقيعك أولاً أو ارفع صورة توقيع.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/contracts/${encodeURIComponent(shareToken)}/signatures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            party: "party2",
            name: name.trim(),
            signatureData: dataUrl,
          }),
        }
      );
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
      <section className="card sign-done-card">
        <b className="sign-done-title">
          ✓ تم تسجيل توقيعك بنجاح — العقد{" "}
          {fullySigned ? "موقّع من الطرفين" : "بانتظار الاعتماد"}
        </b>
        <p className="sign-done-sub">
          شكراً لك، تم حفظ التوقيع مع وقت الجهاز وبياناته لأغراض الإثبات.
        </p>
      </section>
    );
  }

  return (
    <section className="card signpad-card">
      <div className="signpad-head">
        <span className="signpad-ico">✍️</span>
        <div>
          <b>التوقيع بصفة الطرف الثاني — {party2Name}</b>
          <p>
            ارسم توقيعك بيدك (بأكثر من لمسة)، أو ارفع صورة توقيعك، ثم اكتب
            اسمك واعتمد.
          </p>
        </div>
      </div>

      <SignaturePad
        ref={padRef}
        height={160}
        onChange={setHasInk}
        label="توقيع الطرف الثاني"
      />

      <label className="signpad-field-label" htmlFor="shareSignName">
        الاسم الكامل كما يُدوَّن مع التوقيع
      </label>
      <input
        id="shareSignName"
        className="form-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
      />

      <label className="signpad-ack">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        <span>
          بأني اطّلعت على كامل بنود العقد المعروض وفهمت مضمونه وأوافق على
          الالتزام به، وأفهم أن التوقيع يُسجَّل مع الوقت وبيانات الجهاز ورقم IP
          لأغراض الإثبات.
        </span>
      </label>

      {error && <p className="signpad-error">{error}</p>}
      {done && <p className="signpad-ok">✓ تم الحفظ</p>}

      <div className="signpad-actions">
        <button
          className="btn"
          disabled={!hasInk || !name.trim() || !ack || busy}
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
