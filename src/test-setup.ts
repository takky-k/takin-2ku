import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
}
