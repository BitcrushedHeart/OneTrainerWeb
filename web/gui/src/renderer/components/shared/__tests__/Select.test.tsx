import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { enumLabel } from "@/utils/enumLabels";

vi.mock("@/store/configStore", () => ({
  useConfigStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = { config: null, updateField: vi.fn() };
    return selector(state);
  }),
  getByPath: vi.fn(() => undefined),
}));

import { Select } from "../Select";

describe("Select", () => {
  const options = ["OPTION_A", "OPTION_B", "OPTION_C"];

  it("renders all options with formatted labels", () => {
    render(<Select label="Choose" options={options} value="OPTION_A" />);
    options.forEach((opt) => {
      expect(screen.getByText(enumLabel(opt))).toBeInTheDocument();
    });
  });

  it("calls onChange on selection with raw value", () => {
    const onChange = vi.fn();
    render(<Select label="Choose" options={options} value="OPTION_A" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "OPTION_B" } });
    expect(onChange).toHaveBeenCalledWith("OPTION_B");
  });

  it("renders label", () => {
    render(<Select label="My Label" options={options} value="OPTION_A" />);
    expect(screen.getByText("My Label")).toBeInTheDocument();
  });

  it("uses custom formatLabel when provided", () => {
    const custom = (v: string) => `Custom: ${v}`;
    render(<Select label="Choose" options={options} value="OPTION_A" formatLabel={custom} />);
    options.forEach((opt) => {
      expect(screen.getByText(`Custom: ${opt}`)).toBeInTheDocument();
    });
  });
});
