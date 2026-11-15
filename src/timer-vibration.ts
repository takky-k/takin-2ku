// WebKit/iOS does not expose this API. Unsupported or blocked vibration must
// never interrupt the visual timer notification.
export function vibrateTimerEnd() {
  try {
    return typeof navigator.vibrate === "function" && navigator.vibrate(1000);
  } catch {
    return false;
  }
}
export function stopTimerVibration() {
  try {
    navigator.vibrate?.(0);
  } catch {
    /* Visual controls remain available. */
  }
}
