import { type ReactNode } from "react";
import { Card, type CardProps } from "./Card";

export interface SectionCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  padding?: CardProps["padding"];
}

export function SectionCard({ title, children, className, padding }: SectionCardProps) {
  return (
    <Card className={className} padding={padding}>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-4 text-[var(--color-on-surface-secondary)]">
        {title}
      </h3>
      {children}
    </Card>
  );
}
