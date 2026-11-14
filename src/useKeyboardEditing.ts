import { useEffect } from "react";
const editable = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement &&
      ![
        "checkbox",
        "radio",
        "range",
        "file",
        "button",
        "submit",
        "reset",
        "color",
      ].includes(el.type)));
export function useKeyboardEditing(resetKey = "") {
  useEffect(() => {
    const root = document.documentElement,
      vv = window.visualViewport;
    let baseline = vv?.height ?? innerHeight,
      wasOpen = false,
      dismissed: Element | null = null,
      timer = 0,
      frame = 0,
      releaseTimer = 0,
      pointerHold = false;
    const viewport = () => {
      const height = vv?.height ?? innerHeight,
        focused = editable(document.activeElement),
        shrunken = baseline - height > 120;
      if (!focused) wasOpen = false;
      if (focused && shrunken) wasOpen = true;
      if (wasOpen && !shrunken) {
        dismissed = document.activeElement;
        wasOpen = false;
      }
      const hide =
        pointerHold ||
        (focused && document.activeElement !== dismissed) ||
        (wasOpen && shrunken);
      root.dataset.keyboardEditing = String(hide);
      if (!hide) baseline = Math.max(baseline, height);
    };
    const reveal = () => {
      const target = document.activeElement;
      if (editable(target)) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() =>
          target.scrollIntoView?.({ block: "nearest", inline: "nearest" }),
        );
      }
    };
    const focus = () => {
      dismissed = null;
      viewport();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (editable(document.activeElement))
        timer = window.setTimeout(reveal, 250);
    };
    const blur = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      timer = window.setTimeout(viewport, 0);
    };
    const resized = () => {
      viewport();
      if (root.dataset.keyboardEditing === "true") reveal();
    };
    const pointer = (e: Event) => {
      if (editable(e.target as Element)) focus();
      else {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        // Keep a returning bottom bar from covering the button between
        // pointerdown and click when an input near the screen bottom blurs.
        pointerHold = root.dataset.keyboardEditing === "true";
      }
    };
    const release = (e: Event) => {
      clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(
        () => {
          pointerHold = false;
          viewport();
          // iOS can synthesize click well after pointerup. Keep the layout stable
          // through that click so the save button is not replaced by the bottom bar.
        },
        e.type === "click" ? 0 : 400,
      );
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("click", release);
    vv?.addEventListener("resize", resized);
    window.addEventListener("resize", resized);
    viewport();
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      document.removeEventListener("click", release);
      vv?.removeEventListener("resize", resized);
      window.removeEventListener("resize", resized);
      clearTimeout(timer);
      clearTimeout(releaseTimer);
      cancelAnimationFrame(frame);
      delete root.dataset.keyboardEditing;
    };
  }, [resetKey]);
}
