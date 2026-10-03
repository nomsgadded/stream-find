export type SearchMode = "screen" | "music";
const key = "streamfind.recent-searches.v1";
const event = "streamfind:recent-searches";
export type RecentSearch = { query: string; mode: SearchMode };

export function parseRecentSearches(raw: string): RecentSearch[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((item) => {
      if (!item || typeof item.query !== "string" || !["screen", "music"].includes(item.mode)) return [];
      const query = item.query.trim();
      const identity = `${item.mode}:${query.toLowerCase()}`;
      if (query.length < 2 || query.length > 80 || seen.has(identity)) return [];
      seen.add(identity);
      return [{ query, mode: item.mode as SearchMode }];
    }).slice(0, 8);
  } catch { return []; }
}
export function recentSearchSnapshot() {
  try { return window.localStorage.getItem(key) || "[]"; } catch { return "[]"; }
}
export function subscribeRecentSearches(callback: () => void) {
  const storage = (e: StorageEvent) => { if (e.key === key || e.key === null) callback(); };
  window.addEventListener(event, callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(event, callback); window.removeEventListener("storage", storage); };
}
function save(items: RecentSearch[]) {
  try { window.localStorage.setItem(key, JSON.stringify(items)); window.dispatchEvent(new Event(event)); } catch { /* Search works without storage. */ }
}
export function rememberSearch(query: string, mode: SearchMode) {
  save(parseRecentSearches(JSON.stringify([{ query, mode }, ...parseRecentSearches(recentSearchSnapshot())])));
}
export function removeRecentSearch(query: string, mode: SearchMode) {
  save(parseRecentSearches(recentSearchSnapshot()).filter((item) => item.mode !== mode || item.query !== query));
}
export function clearRecentSearches(mode: SearchMode) {
  save(parseRecentSearches(recentSearchSnapshot()).filter((item) => item.mode !== mode));
}
