import { useEffect, useRef } from "react";

export default function NoticeModal({ open, message, confirmLabel = "확인", onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const frameId = requestAnimationFrame(() => closeButtonRef.current?.unfocus());
    const onKeyDown = (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="notice-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="notice-modal"
        role="dialog"
        aria-modal="true"
        aria-describedby="notice-modal-message"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="notice-modal-message">{message}</p>
        <div className="notice-modal-actions">
          <button ref={closeButtonRef} className="btn" type="button" onClick={onClose}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
