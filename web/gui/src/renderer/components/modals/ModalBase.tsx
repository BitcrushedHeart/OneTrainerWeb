import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "@/components/shared";

export interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-[400px]",
  md: "max-w-[600px]",
  lg: "max-w-[800px]",
  xl: "max-w-[1000px]",
};

export function ModalBase({ open, onClose, title, children, size = "md", closeOnBackdrop = true }: ModalBaseProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Trap focus and handle escape
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Focus the dialog
    setTimeout(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea");
      firstFocusable?.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      style={{ backdropFilter: "blur(8px)", background: "rgba(0, 0, 0, 0.5)" }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col rounded-[var(--radius-md)]
          bg-[var(--color-surface)] border border-[var(--color-border-subtle)]
          shadow-[var(--shadow-3)] animate-[rowFade_200ms_ease-out]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-lg font-semibold text-[var(--color-on-surface)]">{title}</h2>
          <IconButton icon={<X className="w-full h-full" />} label="Close" variant="ghost" size="sm" onClick={onClose} />
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
