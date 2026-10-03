const key = "streamfind.titleNavigation";
const previewKey = "streamfind.titlePreview";

export function rememberTitleNavigation(path: string, preview?: unknown) {
  if (!path.startsWith("/title/")) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ target: path, time: Date.now() }));
    if (preview) window.sessionStorage.setItem(previewKey, JSON.stringify({ target: path, time: Date.now(), title: preview }));
  } catch { /* Navigation still works if session storage is unavailable. */ }
}

export function readTitleNavigationPreview<T>(path: string): T | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(previewKey) ?? "null") as { target?: string; time?: number; title?: T } | null;
    return saved?.target === path && typeof saved.time === "number" && Date.now() - saved.time < 5 * 60_000 ? saved.title ?? null : null;
  } catch { return null; }
}

export function hasInternalTitleOrigin(path: string) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as { target?: string; time?: number } | null;
    return saved?.target === path && typeof saved.time === "number" && Date.now() - saved.time < 30 * 60_000;
  } catch { return false; }
}
