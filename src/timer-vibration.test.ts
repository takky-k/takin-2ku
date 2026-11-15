import { it, expect, vi, afterEach } from "vitest";
import { vibrateTimerEnd, stopTimerVibration } from "./timer-vibration";
const original = Object.getOwnPropertyDescriptor(navigator, "vibrate");
afterEach(() => {
  if (original) Object.defineProperty(navigator, "vibrate", original);
  else Reflect.deleteProperty(navigator, "vibrate");
});
it("requests a one-second vibration and cancels it on stop", () => {
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  expect(vibrateTimerEnd()).toBe(true);
  expect(vibrate).toHaveBeenCalledWith(1000);
  stopTimerVibration();
  expect(vibrate).toHaveBeenLastCalledWith(0);
});
it("does not fail when vibration is unsupported or browser policy rejects it", () => {
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: undefined,
  });
  expect(vibrateTimerEnd()).toBe(false);
  expect(() => stopTimerVibration()).not.toThrow();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: () => {
      throw new Error("blocked");
    },
  });
  expect(vibrateTimerEnd()).toBe(false);
  expect(() => stopTimerVibration()).not.toThrow();
});
