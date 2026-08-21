import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/test-utils";
import { ResourcePreviewResult } from "./ResourcePreviewResult";
import type { ResourcePreviewState } from "./useResourcePreview";

type PreviewProp = Pick<ResourcePreviewState, "result" | "error" | "hasRun">;

const BASE_SUCCESS = { renderTimeMs: 42, status: 200 };

function preview(overrides: Partial<PreviewProp>): PreviewProp {
  return { result: null, error: null, hasRun: true, ...overrides };
}

describe("ResourcePreviewResult", () => {
  it("renders nothing before the first run", () => {
    const { container } = render(
      <ResourcePreviewResult preview={{ result: null, error: null, hasRun: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a JSON code block for application/json content", () => {
    render(
      <ResourcePreviewResult
        preview={preview({
          result: { ...BASE_SUCCESS, content: { mimeType: "application/json", text: '{"a":1}' } },
        })}
      />,
    );
    expect(screen.getByText("200 OK")).toBeInTheDocument();
    // Tokens render across many spans (prism-react-renderer), so read the
    // full snippet off the rendered <pre> instead of matching one text node.
    expect(document.querySelector("pre")?.textContent).toBe('{"a":1}');
  });

  it("renders an inline image for image/* content with descriptive alt text", () => {
    render(
      <ResourcePreviewResult
        preview={preview({
          result: { ...BASE_SUCCESS, content: { mimeType: "image/png", blob: "Zm9v" } },
        })}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,Zm9v");
    expect(img).not.toHaveAttribute("alt", "");
  });

  it("renders MIME + size + a download link for an unknown binary type, never as text", () => {
    render(
      <ResourcePreviewResult
        preview={preview({
          result: {
            ...BASE_SUCCESS,
            content: { mimeType: "application/octet-stream", blob: "Zm9v" },
          },
        })}
      />,
    );
    expect(screen.getByText(/application\/octet-stream/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download raw/i })).toHaveAttribute(
      "href",
      "data:application/octet-stream;base64,Zm9v",
    );
    expect(document.querySelector("pre")).not.toBeInTheDocument();
  });

  it("collapses large text content behind a View all affordance", () => {
    const huge = "x".repeat(300 * 1024);
    render(
      <ResourcePreviewResult
        preview={preview({
          result: { ...BASE_SUCCESS, content: { mimeType: "text/plain", text: huge } },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /view all/i })).toBeInTheDocument();
    expect(document.querySelector("pre")).not.toBeInTheDocument();
  });

  it("renders the error message on failure", () => {
    render(
      <ResourcePreviewResult
        preview={preview({
          result: null,
          error: { message: "resource not found", renderTimeMs: 5, status: 404 },
        })}
      />,
    );
    expect(screen.getByText("404 — fetch failed")).toBeInTheDocument();
    expect(screen.getByText("resource not found")).toBeInTheDocument();
  });
});
