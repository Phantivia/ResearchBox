import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageViewer } from "./ImageViewer";

describe("ImageViewer", () => {
  it("renders the image and a 100% zoom indicator", () => {
    render(<ImageViewer src="x.png" alt="diagram" onClose={() => {}} />);

    expect(screen.getByAltText("diagram")).toHaveAttribute("src", "x.png");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("zooms in when the zoom-in control is pressed", () => {
    render(<ImageViewer src="x.png" alt="diagram" onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "放大" }));

    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("resets zoom to 100% via the indicator", () => {
    render(<ImageViewer src="x.png" alt="diagram" onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    fireEvent.click(screen.getByRole("button", { name: "重置缩放" }));

    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("closes from the close button and from Escape", () => {
    const onClose = vi.fn();
    render(<ImageViewer src="x.png" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
