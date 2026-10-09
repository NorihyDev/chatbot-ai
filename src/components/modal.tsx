"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { trapFocus } from "@/lib/focus";

export function Modal({
  children,
  labelId,
  onClose,
  className = "",
}: {
  children: ReactNode;
  labelId: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`settings-dialog ${className}`}
      aria-labelledby={labelId}
      onCancel={onClose}
      onKeyDown={trapFocus}
      onClick={(event) => {
        if (event.target !== ref.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>
  );
}
