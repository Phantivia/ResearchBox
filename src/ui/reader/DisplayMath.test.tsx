import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DisplayMath } from "./DisplayMath";

describe("DisplayMath", () => {
  it("renders KaTeX output inside a clickable region", () => {
    const { container } = render(<DisplayMath tex="E = mc^2" display />);

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(screen.getByRole("button", { name: "放大查看公式" })).toBeInTheDocument();
  });

  it("opens a spotlight on click and closes it on Escape", () => {
    render(<DisplayMath tex="E = mc^2" display />);

    expect(screen.queryByTestId("math-spotlight")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "放大查看公式" }));
    expect(screen.getByTestId("math-spotlight")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("math-spotlight")).not.toBeInTheDocument();
  });
});
