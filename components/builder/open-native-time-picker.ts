/**
 * Opens the browser's native time picker from the current user gesture.
 *
 * Android Chrome 154 can fail to open a time picker when the family taps
 * the value area instead of the clock affordance. Calling showPicker() from
 * the click keeps the native control while making the whole field actionable.
 * Unsupported browsers, or browsers that reject the call, retain their normal
 * input behaviour.
 */
export function openNativeTimePicker(input: HTMLInputElement): void {
  if (typeof input.showPicker !== "function") return;

  try {
    input.showPicker();
  } catch {
    // The click's default behaviour remains the fallback (for example when
    // the browser rejects showPicker because another picker is already open).
  }
}
