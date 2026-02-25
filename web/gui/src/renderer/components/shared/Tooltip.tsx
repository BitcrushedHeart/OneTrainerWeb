import { type ReactNode, useState, useRef, useEffect, useId } from "react";

export interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: "top" | "right" | "bottom" | "left";
  delay?: number;
}

export function Tooltip({ children, content, position = "top", delay = 200 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();

  const show = () => { timeoutRef.current = setTimeout(() => setVisible(true), delay); };
  const hide = () => { clearTimeout(timeoutRef.current); setVisible(false); };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 px-3 py-2 text-sm rounded-[var(--radius-sm)] whitespace-nowrap pointer-events-none
            bg-[var(--color-ink-950)] text-[var(--color-lavender-50)] shadow-[var(--shadow-2)]
            ${positionClasses[position]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
