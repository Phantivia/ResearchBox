import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FigureBlock } from "./FigureBlock";

describe("FigureBlock", () => {
  it("opens the image viewer when a figure image is clicked", () => {
    render(
      <FigureBlock>
        <figure>
          <img src="x.png" alt="diagram" />
          <figcaption>Figure 1</figcaption>
        </figure>
      </FigureBlock>,
    );

    expect(screen.queryByTestId("image-viewer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByAltText("diagram"));

    expect(screen.getByTestId("image-viewer")).toBeInTheDocument();
  });

  it("ignores clicks that are not on an image", () => {
    render(
      <FigureBlock>
        <figure>
          <img src="x.png" alt="diagram" />
          <figcaption>Figure 1</figcaption>
        </figure>
      </FigureBlock>,
    );

    fireEvent.click(screen.getByText("Figure 1"));

    expect(screen.queryByTestId("image-viewer")).not.toBeInTheDocument();
  });
});
