import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card } from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Content here</Card>);
    expect(screen.getByText("Content here")).toBeInTheDocument();
  });

  it("applies padding class", () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toHaveClass("p-8");
  });

  it("applies the card class", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass("card");
  });
});
