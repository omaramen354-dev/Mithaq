"use client";

import { useMemo, useState } from "react";
import { DEFAULT_CLAUSES } from "@/lib/clauses";

/* ============================================================
   ClausePickerModal — نافذة اختيار البنود الجاهزة لنوع العقد
   تفتح من زر "إضافة بنود جاهزة" في نموذج الإنشاء، وتتيح
   تحديد بنود متعددة (مع فرز حسب الأكثر اختياراً) ثم إضافتها
   دفعة واحدة إلى قائمة بنود العقد الجاري تحريره.
   ============================================================ */

export default function ClausePickerModal({
  open,
  contractType,
  existingClauses,
  onClose,
  onAdd,
}: {
  open: boolean;
  contractType: string;
  existingClauses: string[];
  onClose: () => void;
  onAdd: (clauses: string[]) => void;
}) {
  const candidates = DEFAULT_CLAUSES[contractType] || [];
  const [selected, setSelected] = useState<number[]>([]);

  /* البنود المضافة سابقاً — لتعطيل إضافتها مرتين */
  const existingSet = useMemo(
    () => new Set(existingClauses.map((c) => c.trim())),
    [existingClauses]
  );
  const isExisting = (i: number) => existingSet.has(candidates[i]?.trim());

  if (!open) return null;

  const toggle = (i: number) =>
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  const add = () => {
    const chosen = selected
      .map((i) => candidates[i])
      .filter(Boolean)
      .filter((c) => !existingSet.has(c.trim()));
    if (chosen.length) onAdd(chosen);
    setSelected([]);
    onClose();
  };

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 28, 22, 0.55)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          maxWidth: 640,
          width: "100%",
          margin: 0,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <b style={{ fontSize: 15 }}>بنود جاهزة — محررها قانونياً</b>
            <p style={{ color: "var(--muted)", fontSize: 11.5, margin: "2px 0 0" }}>
              اختر ما يناسب عقدك — تُعبأ الحقول بين [الأقواس] تلقائياً من بيانات
              النموذج
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              border: 0,
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
              color: "var(--muted)",
              padding: 6,
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: "14px 20px", overflowY: "auto", flex: 1 }}>
          {candidates.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              لا توجد بنود جاهزة لهذا النوع — أضف بنودك يدوياً من النموذج.
            </p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {candidates.map((text, i) => {
              const exists = isExisting(i);
              const checked = selected.includes(i);
              return (
                <label
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    border: `1.5px solid ${checked ? "var(--green)" : "var(--line)"}`,
                    borderRadius: 10,
                    background: checked ? "#f2f8f4" : "#fff",
                    cursor: exists ? "not-allowed" : "pointer",
                    opacity: exists ? 0.55 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={exists}
                    onChange={() => toggle(i)}
                    style={{ marginTop: 4, accentColor: "var(--green)" }}
                  />
                  <span style={{ fontSize: 12.5, lineHeight: 1.8 }}>{text}</span>
                </label>
              );
            })}
          </div>
        </div>

        <footer
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-start",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            className="btn"
            type="button"
            disabled={!selected.length}
            style={{ opacity: selected.length ? 1 : 0.5 }}
            onClick={add}
          >
            إضافة البنود المحددة ({selected.length})
          </button>
          <button className="btn btn-soft" type="button" onClick={onClose}>
            إلغاء
          </button>
        </footer>
      </div>
    </div>
  );
}
