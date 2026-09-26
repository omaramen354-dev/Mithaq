"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CONTRACT_TYPES } from "@/lib/contract-types";

/* ============================================================
   ContractTypePicker — قائمة أنواع العقود المنبثقة
   منقولة بروح «لوحة القوائم المنبثقة» من الإنديكس القديم:
   حقل بحث فوري + خيارات بأيقونات ذهبية + علامة اختيار للنوع النشط.
   تُدمَج ضمن الهيرو والسايدبار ويعمل نفس حدث mithaq:pick-type
   الذي يلتقطه نموذج الإنشاء ليحدد النوع ويمرّر المستخدم للأسفل.

   ملاحظة تقنية: داخل السايدبار (overflow-y: auto) تُفتح القائمة
   بـ position: fixed محسوبة من مستطيل الزر حتى لا تُقتَطع بالحواف.
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

export default function ContractTypePicker({
  variant = "hero",
}: {
  variant?: "hero" | "sidebar";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [fixedStyle, setFixedStyle] = useState<CSSProperties | undefined>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSidebar = variant === "sidebar";

  /* إغلاق عند النقر خارج القائمة أو الضغط على Escape أو تمرير الصفحة */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const root = isSidebar ? btnRef.current : wrapRef.current;
      const target = e.target as Node;
      if (root && !root.contains(target) && !target.parentElement?.closest?.(".mq-pop")) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => {
      if (isSidebar) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, isSidebar]);

  /* فتح الحقل للبحث مباشرة + حساب موضع القائمة الثابت في السايدبار */
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      if (isSidebar && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const width = Math.max(rect.width, 300);
        const openUp = rect.bottom + 300 > window.innerHeight;
        setFixedStyle(
          openUp
            ? {
                position: "fixed",
                bottom: window.innerHeight - rect.top + 8,
                right: window.innerWidth - rect.right,
                width,
                zIndex: 120,
              }
            : {
                position: "fixed",
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right,
                width,
                zIndex: 120,
              }
        );
      } else {
        setFixedStyle(undefined);
      }
    } else {
      setQuery("");
    }
  }, [open, isSidebar]);

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
    <div className="mq-pop-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={isSidebar ? "mq-opt" : "hero-picker-trigger"}
        style={isSidebar ? { width: "100%", borderRadius: 10 } : undefined}
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

      {open && (
        <div
          className={`mq-pop${fixedStyle ? " mq-pop-fixed" : ""}`}
          role="listbox"
          aria-label="أنواع العقود"
          style={fixedStyle}
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
        </div>
      )}
    </div>
  );
}
