"use client";

import ModalDialog from "@/components/ModalDialog";
import RecentSearches from "@/components/RecentSearches";
import { rememberSearch } from "@/lib/recent-searches";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { titlePath } from "@/lib/title-routes";
import { suggestionAvailabilityLabel, type SuggestionOffer } from "@/lib/search-suggestion-label";

type Result = {
  id: number;
  title: string;
  year?: number;
  mediaType: "movie" | "show";
  imageUrl?: string;
  availability?: SuggestionOffer[];
  tmdbId?: number;
  corrected?: boolean;
};

function serviceSnapshot() { try { return window.localStorage.getItem("streamfind.services") || "[]"; } catch { return "[]"; } }
function subscribeServices(callback: () => void) { window.addEventListener("storage", callback); return () => window.removeEventListener("storage", callback); }

export function GlobalSearchOverlay({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch?: (query: string) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRequestRef = useRef<AbortController | null>(null);
  const suggestionCache = useRef(new Map<string, { expires: number; results: Result[] }>());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const rawServices = useSyncExternalStore(subscribeServices, serviceSnapshot, () => "[]");
  let savedServices: string[] = [];
  try { const parsed: unknown = JSON.parse(rawServices); if (Array.isArray(parsed)) savedServices = parsed.filter((item): item is string => typeof item === "string"); } catch { /* Optional saved preferences. */ }

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 3) return;
    const controller = new AbortController();
    autocompleteRequestRef.current = controller;
    let region = "US";
    try { region = window.localStorage.getItem("streamfind.country") || "US"; } catch { /* Storage is optional. */ }
    const cacheKey = `${region}:${trimmed.toLowerCase()}`;
    const timer = window.setTimeout(() => {
      const cached = suggestionCache.current.get(cacheKey);
      if (cached && cached.expires > Date.now()) { setResults(cached.results); setActiveIndex(-1); setLoading(false); setSuggestionsReady(true); setSuggestionError(false); return; }
      setLoading(true);
      setSuggestionError(false);
      void fetch(`/api/autocomplete?q=${encodeURIComponent(trimmed)}&region=${encodeURIComponent(region)}&v=3`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("Suggestions unavailable");
          return response.json() as Promise<{ results?: Result[] }>;
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          suggestionCache.current.set(cacheKey, { expires: Date.now() + 300_000, results: data.results ?? [] });
          while (suggestionCache.current.size > 50) suggestionCache.current.delete(suggestionCache.current.keys().next().value!);
          setResults(data.results ?? []);
          setSuggestionsReady(true);
          setActiveIndex(-1);
        })
        .catch(() => { if (!controller.signal.aborted) setSuggestionError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, retry]);

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`global-suggestion-${results[activeIndex]?.id}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  if (!open) return null;

  const openResult = (result: Result) => {
    const path = titlePath({ title: result.title, mediaType: result.mediaType, watchmodeId: result.id > 0 ? result.id : undefined, tmdbId: result.tmdbId });
    if (!path) return;
    rememberSearch(result.title, "screen");
    onClose();
    router.push(path);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim().length < 3) return;
    inputRef.current?.blur();
    const trimmed = query.trim();
    if (trimmed) {
      rememberSearch(trimmed, "screen");
      onClose();
      onSearch?.(trimmed);
      router.push(`/?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      openResult(results[activeIndex]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
    }
  };

  return <div className="globalSearchBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <ModalDialog className="globalSearchPanel" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
      <header>
        <div><p className="sectionKicker">Search Stream Find</p><h2 id="global-search-title">What do you want to watch?</h2></div>
        <button type="button" onClick={onClose} aria-label="Close search">×</button>
      </header>
      <form onSubmit={submit} role="search">
        <SearchGlyph />
        <label className="srOnly" htmlFor="global-title-search">Search movies and shows</label>
        <input ref={inputRef} data-dialog-autofocus id="global-title-search" type="search" enterKeyHint="search" maxLength={80} value={query} onChange={(event) => {
          const nextQuery = event.target.value;
          autocompleteRequestRef.current?.abort();
          setQuery(nextQuery);
          setSuggestionError(false);
          setSuggestionsReady(false);
          setLoading(false);
          setActiveIndex(-1);
          setResults([]);
          if (nextQuery.trim().length < 3) {
            setResults([]);
            setLoading(false);
            setSuggestionError(false);
          }
        }} onKeyDown={onKeyDown} placeholder="Search movies and shows" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls="global-search-results" aria-expanded={results.length > 0} aria-activedescendant={activeIndex >= 0 ? `global-suggestion-${results[activeIndex]?.id}` : undefined} />
        <div className="globalSearchFieldActions">
          {query.length > 0 && <button className="searchClear" type="button" aria-label="Clear search" onPointerDown={(event) => event.preventDefault()} onClick={() => {
            autocompleteRequestRef.current?.abort();
            setQuery("");
            setResults([]);
            setActiveIndex(-1);
            setLoading(false);
            inputRef.current?.focus();
          }}>×</button>}
          {loading && <span className="globalSearchLoading" aria-label="Searching" />}
        </div>
      </form>
      <div className="globalSearchBody">
      {!query.trim() && <RecentSearches mode="screen" onSelect={(value) => {
        rememberSearch(value, "screen");
        onClose();
        onSearch?.(value);
        router.push(`/?q=${encodeURIComponent(value)}`);
      }} />}
      <div className="globalSearchResults" id="global-search-results" role="listbox" aria-label="Search suggestions">
        {results.map((result, index) => <button id={`global-suggestion-${result.id}`} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} onClick={() => openResult(result)} key={result.id}>
          <span>{result.imageUrl ? <Image src={result.imageUrl} alt="" width={46} height={62} unoptimized /> : result.title.slice(0, 1)}</span>
          <div><strong>{result.title}</strong><small>{[result.year, result.mediaType === "movie" ? "Movie" : "Series"].filter(Boolean).join(" · ")}</small>{result.corrected && <small>Similar title</small>}{suggestionAvailabilityLabel(result.availability, savedServices) && <small className="suggestionAvailability">{suggestionAvailabilityLabel(result.availability, savedServices)}</small>}</div>
          <i aria-hidden="true">→</i>
        </button>)}
      </div>
      {results.length > 0 && <p className="srOnly" role="status">{results.length} title suggestions. Use arrow keys to select a title, then Enter to open it. Press Enter without selecting to search all matches.</p>}
        {loading && <p role="status">Finding titles…</p>}
        {query.trim().length > 2 && !loading && suggestionError && <p role="status">Suggestions couldn’t load. <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button> or press Enter to search.</p>}
        {query.trim().length > 0 && query.trim().length < 3 && <p role="status">Enter at least 3 characters to search.</p>}
        {query.trim().length > 2 && suggestionsReady && !loading && !suggestionError && results.length === 0 && <p role="status">No suggestions found. Press Enter to search all matches, or check the spelling.</p>}
      </div>
      <footer><span>Search across live streaming availability</span><kbd>ESC</kbd></footer>
    </ModalDialog>
  </div>;
}

export function HeaderSearchButton({ onClick, href }: { onClick?: () => void; href?: string }) {
  if (href) return <Link className="headerSearchButton" href={href} aria-label="Search movies and shows"><SearchGlyph /><span>Search</span></Link>;
  return <button className="headerSearchButton" type="button" onClick={onClick} aria-label="Search movies and shows"><SearchGlyph /><span>Search</span></button>;
}

export function SearchGlyph() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="icon"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
