/**
 * Shared Tailwind class strings for form controls.
 *
 * Every input, select, and side-button in the shared component library
 * should reference these constants so that styling stays consistent and
 * changes only need to happen in one place.
 */

/** Core input styling — no width class. */
export const INPUT_BASE = [
  "px-3 py-1.5 text-sm rounded-[6px]",
  "bg-[var(--color-input-bg)] text-[var(--color-on-surface)]",
  "border border-[var(--color-border-subtle)]",
  "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
  "hover:border-[var(--color-on-surface-secondary)]",
  "focus:border-[var(--color-orchid-600)] focus:shadow-[var(--shadow-inset-focus)] focus:outline-none",
  "disabled:opacity-40 disabled:cursor-not-allowed",
].join(" ");

/** Full-width input. */
export const INPUT_FULL = `w-full ${INPUT_BASE}`;

/** Flex-fill input (for inputs beside a button). */
export const INPUT_FLEX = `flex-1 ${INPUT_BASE}`;

/** Full-width select. */
export const SELECT_FULL = `${INPUT_FULL} cursor-pointer`;

/** Flex-fill select (for selects beside a button). */
export const SELECT_FLEX = `${INPUT_FLEX} cursor-pointer`;

/** Select with no width class (inline selects like TimeEntry unit). */
export const SELECT_BASE = `${INPUT_BASE} cursor-pointer`;

/** Browse / advanced side-button. */
export const SIDE_BUTTON = [
  "px-2 py-1.5 rounded-[6px] border border-[var(--color-border-subtle)]",
  "bg-[var(--color-input-bg)] text-[var(--color-on-surface-secondary)]",
  "hover:text-[var(--color-on-surface)] hover:border-[var(--color-on-surface-secondary)]",
  "transition-[border-color,color,background-color] duration-200 ease-out cursor-pointer",
  "disabled:opacity-40 disabled:cursor-not-allowed",
].join(" ");

/** Placeholder text colour — append to input class strings when needed. */
export const PLACEHOLDER = "placeholder:text-[var(--color-on-surface-secondary)]";
