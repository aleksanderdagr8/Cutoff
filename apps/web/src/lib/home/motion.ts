/** Session gate for header CUTOFF wordmark — once per tab load, not every nav. */
export const HOME_WORDMARK_ENTER_KEY = "cutoff-home-wordmark-enter";

export function peekHomeWordmarkEnter(): boolean {
  try {
    return window.sessionStorage.getItem(HOME_WORDMARK_ENTER_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markHomeWordmarkEnterPlayed(): void {
  try {
    window.sessionStorage.setItem(HOME_WORDMARK_ENTER_KEY, "1");
  } catch {
    /* private mode / blocked storage */
  }
}
