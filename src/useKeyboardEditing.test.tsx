import { it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { useKeyboardEditing } from "./useKeyboardEditing";
const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (original) Object.defineProperty(window, "visualViewport", original);
  else Reflect.deleteProperty(window, "visualViewport");
});
function Harness({ showInput = true }: { showInput?: boolean }) {
  useKeyboardEditing();
  return (
    <>
      {showInput && <input aria-label="RIR" />}
      <textarea aria-label="メモ" />
      <input aria-label="疲労" type="range" />
      <button>保存</button>
    </>
  );
}
it("hides overlays on text focus and restores them when the keyboard closes even without blur", async () => {
  class Viewport extends window.EventTarget {
    height = 844;
  }
  const viewport = new Viewport();
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  render(<Harness />);
  const input = screen.getByLabelText("RIR");
  act(() => input.focus());
  expect(document.documentElement.dataset.keyboardEditing).toBe("true");
  act(() => {
    viewport.height = 400;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(document.documentElement.dataset.keyboardEditing).toBe("true");
  act(() => {
    viewport.height = 844;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(document.documentElement.dataset.keyboardEditing).toBe("false");
  expect(document.activeElement).toBe(input);
  fireEvent.pointerDown(input);
  expect(document.documentElement.dataset.keyboardEditing).toBe("true");
  act(() => input.blur());
  await waitFor(() =>
    expect(document.documentElement.dataset.keyboardEditing).toBe("false"),
  );
});
it("does not hide overlays for a fatigue slider", () => {
  render(<Harness />);
  act(() => screen.getByLabelText("疲労").focus());
  expect(document.documentElement.dataset.keyboardEditing).toBe("false");
});
it("holds the layout stable through iOS delayed click, then restores navigation", () => {
  vi.useFakeTimers();
  render(<Harness />);
  const input = screen.getByLabelText("RIR"),
    button = screen.getByRole("button", { name: "保存" });
  act(() => input.focus());
  fireEvent.pointerDown(button);
  act(() => input.blur());
  fireEvent.pointerUp(button);
  act(() => vi.advanceTimersByTime(100));
  expect(document.documentElement.dataset.keyboardEditing).toBe("true");
  fireEvent.click(button);
  act(() => vi.advanceTimersByTime(1));
  expect(document.documentElement.dataset.keyboardEditing).toBe("false");
});
it("restores navigation after the focused input is removed before iOS restores viewport height", async () => {
  class Viewport extends window.EventTarget {
    height = 844;
  }
  const viewport = new Viewport();
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  const view = render(<Harness />);
  const input = screen.getByLabelText("RIR");
  act(() => input.focus());
  act(() => {
    viewport.height = 400;
    viewport.dispatchEvent(new Event("resize"));
  });
  // iOS may remove the focused workout input while the visual viewport is
  // still reduced. Its stale height must not keep navigation hidden forever.
  view.rerender(<Harness showInput={false} />);
  act(() => viewport.dispatchEvent(new Event("resize")));
  expect(document.documentElement.dataset.keyboardEditing).toBe("false");
  view.unmount();
});
