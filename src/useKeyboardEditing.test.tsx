import { it, expect, afterEach } from "vitest";
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
  if (original) Object.defineProperty(window, "visualViewport", original);
  else Reflect.deleteProperty(window, "visualViewport");
});
function Harness() {
  useKeyboardEditing();
  return (
    <>
      <input aria-label="RIR" />
      <textarea aria-label="メモ" />
      <input aria-label="疲労" type="range" />
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
