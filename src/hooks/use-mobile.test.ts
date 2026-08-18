import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile", () => {
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  let removeEventListenerMock: ReturnType<typeof vi.fn>;
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let changeHandler: (() => void) | null = null;

  beforeEach(() => {
    addEventListenerMock = vi.fn((event: string, handler: () => void) => {
      if (event === "change") {
        changeHandler = handler;
      }
    });
    removeEventListenerMock = vi.fn();

    matchMediaMock = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal("matchMedia", matchMediaMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    changeHandler = null;
  });

  it("should initialize based on innerWidth", () => {
    vi.stubGlobal("innerWidth", 500); // Mobile
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    vi.stubGlobal("innerWidth", 1024); // Desktop
    const { result: resultDesktop } = renderHook(() => useIsMobile());
    expect(resultDesktop.current).toBe(false);
  });

  it("should update when resize event triggers matchMedia change", () => {
    vi.stubGlobal("innerWidth", 1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      vi.stubGlobal("innerWidth", 500);
      if (changeHandler) changeHandler();
    });

    expect(result.current).toBe(true);
  });

  it("queries and compares against a custom breakpoint", () => {
    vi.stubGlobal("innerWidth", 900);
    const { result } = renderHook(() => useIsMobile(1024));

    // 900 is desktop against the 768 default but mobile against 1024, so this
    // fails if the parameter is ignored.
    expect(result.current).toBe(true);
    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 1023px)");
  });

  it("resubscribes when the breakpoint changes", () => {
    vi.stubGlobal("innerWidth", 900);
    const { result, rerender } = renderHook(({ breakpoint }) => useIsMobile(breakpoint), {
      initialProps: { breakpoint: 1024 },
    });
    expect(result.current).toBe(true);

    rerender({ breakpoint: 768 });

    expect(removeEventListenerMock).toHaveBeenCalled();
    expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 767px)");
    expect(result.current).toBe(false);
  });

  it("should clean up event listener on unmount", () => {
    const { unmount } = renderHook(() => useIsMobile());
    expect(addEventListenerMock).toHaveBeenCalled();
    unmount();
    expect(removeEventListenerMock).toHaveBeenCalled();
  });
});
