"use client";

import { useSyncExternalStore } from "react";
import { clearRecentSearches, parseRecentSearches, recentSearchSnapshot, removeRecentSearch, subscribeRecentSearches, type SearchMode } from "@/lib/recent-searches";

export default function RecentSearches({ mode, onSelect, disabled = false }: { mode: SearchMode; onSelect: (query: string) => void; disabled?: boolean }) {
  const raw = useSyncExternalStore(subscribeRecentSearches, recentSearchSnapshot, () => "[]");
  const items = parseRecentSearches(raw).filter((item) => item.mode === mode && item.query.length >= 3);
  if (!items.length) return null;
  return <section className="recentSearches" aria-label="Recent searches on this device">
    <header><span>Recent searches <small>on this device</small></span><button type="button" onClick={() => clearRecentSearches(mode)}>Clear all</button></header>
    <ul>{items.map(({ query }) => <li key={query}>
      <button className="recentSearchRepeat" type="button" disabled={disabled} onClick={() => onSelect(query)}>{query}</button>
      <button className="recentSearchRemove" type="button" aria-label={`Remove ${query} from recent searches`} onClick={() => removeRecentSearch(query, mode)}>×</button>
    </li>)}</ul>
  </section>;
}
