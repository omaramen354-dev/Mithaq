"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/* ============================================================
   SignaturePad — لوحة توقيع موحّدة لكل صفحات التوقيع
   • رسم حر بلمسات متعددة (كل لمسة خط مستقل — يمكن رفع القلم
     والبدء من جديد دون فقدان ما رُسم).
   • رفع صورة توقيع جاهزة من الجهاز.
   • مسح/تصوير توقيع ورقي بالكاميرا (capture على الجوال).
   • تصدير PNG شفاف بلا خلفية لطباعة نظيفة.
   ============================================================ */

type Point = { x: number; y: number };

export type SignaturePadHandle = {
  toDataURL: () => string;
  clear: () => void;
  hasInk: () => boolean;
};

type Props = {
  height?: number;
  onChange?: (hasInk: boolean) => void;
  label?: string;
};

const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  function SignaturePad({ height = 160, onChange, label }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const strokesRef = useRef<Point[][]>([]);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [ink, setInk] = useState(false);
    const [error, setError] = useState("");

    function syncInk(next: boolean) {
      setInk(next);
      onChange?.(next);
    }

    function currentInk(): boolean {
      return Boolean(imageRef.current) || strokesRef.current.some((s) => s.length >= 1);
    }

    function paint() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (canvas.width !== Math.round(r.width * dpr)) {
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);

      /* صورة التوقيع المرفوعة/المصوّرة تُرسم في المنتصف بنسبة محفوظة */
      const img = imageRef.current;
      if (img) {
        const scale = Math.min((r.width - 24) / img.width, (r.height - 20) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (r.width - w) / 2, (r.height - h) / 2, w, h);
      }

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

    useEffect(() => {
      paint();
      const onResize = () => paint();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      toDataURL: () => {
        const canvas = canvasRef.current;
        if (!canvas) return "";
        /* نرسم على قماش مؤقت بخلفية شفافة للحصول على PNG نظيف */
        return canvas.toDataURL("image/png");
      },
      clear: () => {
        strokesRef.current = [];
        imageRef.current = null;
        setError("");
        paint();
        syncInk(false);
      },
      hasInk: currentInk,
    }));

    function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): Point {
      const canvas = canvasRef.current!;
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function loadImage(file: File | undefined) {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("اختر صورة توقيع صحيحة (PNG أو JPG).");
        return;
      }
      setError("");
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;
          strokesRef.current = [];
          paint();
          syncInk(true);
        };
        img.onerror = () => setError("تعذر قراءة الصورة — جرّب صيغة أخرى.");
        img.src = String(reader.result);
      };
      reader.onerror = () => setError("تعذر قراءة الملف — جرّب مرة أخرى.");
      reader.readAsDataURL(file);
    }

    return (
      <div className="sigpad">
        {label ? <div className="sigpad-label">{label}</div> : null}

        <canvas
          ref={canvasRef}
          className="sigpad-canvas"
          style={{ height }}
          aria-label="مساحة رسم التوقيع"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawingRef.current = true;
            strokesRef.current.push([pointerPos(e)]);
            paint();
          }}
          onPointerMove={(e) => {
            if (!drawingRef.current) return;
            const s = strokesRef.current[strokesRef.current.length - 1];
            if (!s) return;
            const p = pointerPos(e);
            const prev = s[s.length - 1];
            if (prev && Math.abs(p.x - prev.x) < 1.5 && Math.abs(p.y - prev.y) < 1.5) return;
            s.push(p);
            paint();
          }}
          onPointerUp={() => {
            drawingRef.current = false;
            syncInk(currentInk());
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
            syncInk(currentInk());
          }}
          onPointerLeave={() => {
            if (drawingRef.current) {
              drawingRef.current = false;
              syncInk(currentInk());
            }
          }}
        />

        <div className="sigpad-tools">
          <button
            className="btn btn-soft btn-sm"
            type="button"
            onClick={() => {
              strokesRef.current.pop();
              paint();
              syncInk(currentInk());
            }}
            disabled={!ink && !imageRef.current}
          >
            <i className="fas fa-rotate-left" /> تراجع
          </button>
          <button
            className="btn btn-soft btn-sm"
            type="button"
            onClick={() => {
              strokesRef.current = [];
              imageRef.current = null;
              paint();
              syncInk(false);
            }}
          >
            <i className="fas fa-eraser" /> مسح
          </button>

          <label className="btn btn-soft btn-sm sigpad-upload">
            <i className="fas fa-upload" /> رفع توقيع
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                loadImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          <label className="btn btn-soft btn-sm sigpad-upload">
            <i className="fas fa-camera" /> مسح بالكاميرا
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                loadImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <p className="sigpad-hint">
          <i className="fas fa-circle-info" />
          يمكنك رفع صورة توقيعك أو تصوير توقيع ورقي، أو الرسم مباشرة —
          والرسم يقبل عدة لمسات/خطوط متتابعة.
        </p>

        {error ? <p className="sigpad-error">{error}</p> : null}
      </div>
    );
  }
);

export default SignaturePad;
