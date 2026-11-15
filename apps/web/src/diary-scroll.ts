// Only a URL and an offset; never persist diary content or authentication data.
export const diaryScrollKey = "akai-lock-scroll";
export function savedDiaryScroll(url: string): number | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(diaryScrollKey) ?? "null");
    return value?.path === url && Number.isFinite(value?.y)
      ? Math.max(0, value.y)
      : null;
  } catch {
    return null;
  }
}
export function clearDiaryScroll() {
  try {
    sessionStorage.removeItem(diaryScrollKey);
  } catch {
    /* Optional storage. */
  }
}
