"use client";

import { useMemo, useState } from "react";
import { DEFAULT_CLAUSES } from "@/lib/clauses";

/* ============================================================
   ClausePickerModal — نافذة اختيار البنود (الهوية الأسطورية)
   بطاقة عاجية، تحديد بحد ذهبي وخلفية ذهبية فاتحة.
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
        background: "rgba(7, 31, 26, 0.58)",
        backdropFilter: "blur(10px)",
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
          maxWidth: 660,
          width: "100%",
          margin: 0,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 30,
        }}
      >
        <header
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <b style={{ fontSize: 15.5, color: "var(--green)" }}>
              بنود جاهزة — محررة قانونياً
            </b>
            <p
              style={{ color: "var(--muted)", fontSize: 11.5, margin: "3px 0 0" }}
            >
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

        <div style={{ padding: "16px 22px", overflowY: "auto", flex: 1 }}>
          {candidates.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              لا توجد بنود جاهزة لهذا النوع — أضف بنودك يدوياً من النموذج.
            </p>
          )}
          <div style={{ display: "grid", gap: 9 }}>
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
                    padding: "11px 13px",
                    border: `1.5px solid ${checked ? "var(--gold)" : "var(--line)"}`,
                    borderRadius: 16,
                    background: checked
                      ? "linear-gradient(135deg, #fff7d8, #fffdf6)"
                      : "#fffefa",
                    cursor: exists ? "not-allowed" : "pointer",
                    opacity: exists ? 0.5 : 1,
                    transition: "0.2s var(--ease)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={exists}
                    onChange={() => toggle(i)}
                    style={{ marginTop: 4, accentColor: "var(--gold)" }}
                  />
                  <span style={{ fontSize: 12.5, lineHeight: 1.8 }}>{text}</span>
                </label>
              );
            })}
          </div>
        </div>

        <footer
          style={{
            padding: "16px 22px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            gap: 9,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            className="btn"
            type="button"
            disabled={!selected.length}
            style={{ opacity: selected.length ? 1 : 0.55 }}
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
