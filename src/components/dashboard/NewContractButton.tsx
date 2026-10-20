"use client";

export default function NewContractButton({
  className = "btn",
  label = "عقد جديد",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        window.dispatchEvent(new CustomEvent("mithaq:open-contract-modal"))
      }
    >
      <i className="fas fa-file-circle-plus" /> {label}
    </button>
  );
}
