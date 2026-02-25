import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock the config store before importing Toggle
vi.mock("@/store/configStore", () => ({
  useConfigStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = { config: null, updateField: vi.fn() };
    return selector(state);
  }),
  getByPath: vi.fn(() => undefined),
}));

import { Toggle } from "../Toggle";

describe("Toggle", () => {
  it("renders with label", () => {
    render(<Toggle label="Enable" value={false} onChange={() => {}} />);
    expect(screen.getByText("Enable")).toBeInTheDocument();
  });

  it("calls onChange when clicked", () => {
    const onChange = vi.fn();
    render(<Toggle label="Enable" value={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("has correct aria attributes", () => {
    render(<Toggle value={true} onChange={() => {}} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("is disabled when disabled prop is true", () => {
    render(<Toggle value={false} onChange={() => {}} disabled />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
