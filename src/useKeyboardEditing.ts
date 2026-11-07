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
export function useKeyboardEditing() {
  useEffect(() => {
    const root = document.documentElement,
      vv = window.visualViewport;
    let baseline = vv?.height ?? innerHeight,
      wasOpen = false,
      dismissed: Element | null = null,
      timer = 0,
      frame = 0;
    const viewport = () => {
      const height = vv?.height ?? innerHeight,
        focused = editable(document.activeElement),
        shrunken = baseline - height > 120;
      if (focused && shrunken) wasOpen = true;
      if (wasOpen && !shrunken) {
        dismissed = document.activeElement;
        wasOpen = false;
      }
      const hide =
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
      timer = window.setTimeout(reveal, 250);
    };
    const blur = () => {
      clearTimeout(timer);
      timer = window.setTimeout(viewport, 0);
    };
    const resized = () => {
      viewport();
      if (root.dataset.keyboardEditing === "true") reveal();
    };
    const pointer = (e: Event) => {
      if (editable(e.target as Element)) focus();
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("pointerdown", pointer);
    vv?.addEventListener("resize", resized);
    window.addEventListener("resize", resized);
    viewport();
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("pointerdown", pointer);
      vv?.removeEventListener("resize", resized);
      window.removeEventListener("resize", resized);
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      delete root.dataset.keyboardEditing;
    };
  }, []);
}
