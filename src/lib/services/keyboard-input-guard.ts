const NAVIGATION_TEXT_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uF700-\uF8FF]/g;
const HAS_NAVIGATION_TEXT_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uF700-\uF8FF]/;

export function stripMacosNavigationPrivateUseChars(value: string): string {
  return value.replace(NAVIGATION_TEXT_CHARS, "");
}

export function preventMacosNavigationPrivateUseInput(event: InputEvent) {
  if (event.data && HAS_NAVIGATION_TEXT_CHARS.test(event.data)) {
    event.preventDefault();
  }
}

export function preventMacosNavigationPrivateUseKeypress(event: KeyboardEvent) {
  if (event.key.length === 1 && HAS_NAVIGATION_TEXT_CHARS.test(event.key)) {
    event.preventDefault();
  }
}

export function sanitizeTextInputValue(input: HTMLInputElement | HTMLTextAreaElement): string {
  const value = input.value;
  if (!HAS_NAVIGATION_TEXT_CHARS.test(value)) {
    return value;
  }

  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const nextValue = stripMacosNavigationPrivateUseChars(value);

  input.value = nextValue;

  if (selectionStart !== null && selectionEnd !== null) {
    const removedBeforeStart =
      value.slice(0, selectionStart).length -
      stripMacosNavigationPrivateUseChars(value.slice(0, selectionStart)).length;
    const removedBeforeEnd =
      value.slice(0, selectionEnd).length -
      stripMacosNavigationPrivateUseChars(value.slice(0, selectionEnd)).length;

    input.setSelectionRange(
      Math.max(0, selectionStart - removedBeforeStart),
      Math.max(0, selectionEnd - removedBeforeEnd),
    );
  }

  return nextValue;
}
