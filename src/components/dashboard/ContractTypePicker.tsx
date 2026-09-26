"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CONTRACT_TYPES } from "@/lib/contract-types";

/* ============================================================
   ContractTypePicker — قائمة أنواع العقود المنبثقة
   منقولة بروح «لوحة القوائم المنبثقة» من الإنديكس القديم:
   حقل بحث فوري + خيارات بأيقونات ذهبية + علامة اختيار للنوع النشط.

   تُرسم عبر React Portal في جسم الصفحة بتموضع fixed محسوب من
   مستطيل الزر — فلا تتأثر بأي overflow أو تراص طبقات لأقسام
   الصفحة (هذا هو الإصلاح الجذري لظهورها خلف الطبقات)، وتتبع
   الزر عند التمرير وتنقلب للأعلى عند قرب أسفل الشاشة.
   يعمل نفس حدث mithaq:pick-type الذي يلتقطه نموذج الإنشاء.
   ============================================================ */

const TYPE_ICONS: Record<string, string> = {
  lease: "fa-house",
  sale: "fa-handshake",
  services: "fa-gears",
  freelance: "fa-laptop-code",
  pledge: "fa-scale-balanced",
  supply: "fa-truck-fast",
  partnership: "fa-people-group",
  nda: "fa-user-lock",
  lease_commercial: "fa-shop",
  design: "fa-pen-ruler",
  rent_furnished: "fa-couch",
};

const TYPE_DESCS: Record<string, string> = {
  lease: "إيجار سكني واضح ومتوازن",
  sale: "بيع وشراء نافياً للجهالة",
  services: "تقديم خدمات بنطاق محدد",
  freelance: "أعمال حرة بدفعات مرحلية",
  pledge: "تعهدات وإقرارات ملزمة",
  supply: "توريد مواد وسلع",
  partnership: "شراكة بحصص واضحة",
  nda: "اتفاقية سرية وصمت",
  lease_commercial: "إيجار محلات ومكاتب",
  design: "تصميم وبرمجة وتسليم ملفات",
  rent_furnished: "إيجار مفروش بجرد تفصيلي",
};

const POP_MAX_H = 320;

export default function ContractTypePicker() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [popStyle, setPopStyle] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  /* حساب موضع القائمة من مستطيل الزر — تُفتح لأسفل أو للأعلى حسب المساحة */
  const reposition = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.max(r.width, 300);
    const openUp = r.bottom + POP_MAX_H + 20 > window.innerHeight && r.top > POP_MAX_H + 40;
    setPopStyle(
      openUp
        ? {
            position: "fixed",
            bottom: window.innerHeight - r.top + 8,
            insetInlineStart: "auto",
            right: Math.max(8, window.innerWidth - r.right),
            width,
          }
        : {
            position: "fixed",
            top: r.bottom + 8,
            insetInlineStart: "auto",
            right: Math.max(8, window.innerWidth - r.right),
            width,
          }
    );
  };

  /* إغلاق خارجي + Escape + تتبع الزر عند التمرير/التحجيم + إغلاق إذا خرج الزر من الشاشة */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onMove = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      /* إذا انطفأ الزر عن الشاشة (مثلاً أُغلق السايدبار) نغلق القائمة */
      if (r.right < 0 || r.left > window.innerWidth || r.bottom < 0 || r.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      reposition();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      reposition();
      inputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [open]);

  const entries = useMemo(() => Object.entries(CONTRACT_TYPES), []);
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return entries;
    return entries.filter(
      ([key, name]) =>
        name.includes(q) ||
        key.includes(q.toLowerCase()) ||
        (TYPE_DESCS[key] || "").includes(q)
    );
  }, [entries, query]);

  const pick = (key: string) => {
    setActive(key);
    setOpen(false);
    /* نفس حدث النماذج القديمة — نموذج الإنشاء يلتقطه ويحدد النوع */
    window.dispatchEvent(new CustomEvent("mithaq:pick-type", { detail: key }));
    document.getElementById("create")?.scrollIntoView({ behavior: "smooth" });
  };

  const activeName = active ? CONTRACT_TYPES[active] : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="mq-opt"
        style={{ width: "100%", borderRadius: 10 }}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <i className="fas fa-layer-group" style={{ color: "var(--gold-light)" }} />
        <span style={{ flex: 1, textAlign: "start" }}>
          {activeName ? `القالب: ${activeName}` : "اختر نوع عقدك"}
        </span>
        <i className={`fas fa-chevron-down chev${open ? " rotated" : ""}`} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={popRef}
            className="mq-pop mq-pop-fixed"
            role="listbox"
            aria-label="أنواع العقود"
            style={popStyle}
          >
            <div className="mq-search">
              <i className="fas fa-magnifying-glass" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن نوع العقد…"
                aria-label="ابحث عن نوع العقد"
              />
            </div>
            {filtered.length ? (
              <ul className="mq-list">
                {filtered.map(([key, name]) => (
                  <li key={key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active === key}
                      className={`mq-opt${active === key ? " active" : ""}`}
                      onClick={() => pick(key)}
                    >
                      <span className="mq-opt-ico">
                        <i className={`fas ${TYPE_ICONS[key] || "fa-file-contract"}`} />
                      </span>
                      <span className="mq-opt-txt">
                        <b>{name}</b>
                        <span>{TYPE_DESCS[key] || ""}</span>
                      </span>
                      <i className="fas fa-check mq-opt-check" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mq-empty">لا يوجد نوع مطابق لبحثك</div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
