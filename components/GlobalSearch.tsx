"use client";

import ModalDialog from "@/components/ModalDialog";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { titlePath } from "@/lib/title-routes";

type Result = {
  id: number;
  title: string;
  year?: number;
  mediaType: "movie" | "show";
  imageUrl?: string;
};

export function GlobalSearchOverlay({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch?: (query: string) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

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
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/autocomplete?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<{ results?: Result[] }> : { results: [] })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data.results ?? []);
          setActiveIndex(-1);
        })
        .catch(() => undefined)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  if (!open) return null;

  const openResult = (result: Result) => {
    const path = titlePath({ title: result.title, mediaType: result.mediaType, watchmodeId: result.id });
    if (!path) return;
    onClose();
    router.push(path);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    inputRef.current?.blur();
    const selected = results[activeIndex];
    if (selected) return openResult(selected);
    const trimmed = query.trim();
    if (trimmed) {
      onClose();
      onSearch?.(trimmed);
      router.push(`/?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
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
        <input ref={inputRef} data-dialog-autofocus id="global-title-search" type="search" enterKeyHint="search" value={query} onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setActiveIndex(-1);
          setResults([]);
          if (nextQuery.trim().length < 3) {
            setResults([]);
            setLoading(false);
          }
        }} onKeyDown={onKeyDown} placeholder="Search movies and shows" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls="global-search-results" aria-expanded={results.length > 0} />
        {loading && <span className="globalSearchLoading" aria-label="Searching" />}
      </form>
      <div className="globalSearchResults" id="global-search-results" role="listbox" aria-label="Search suggestions">
        {results.map((result, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} onClick={() => openResult(result)} key={result.id}>
          <span>{result.imageUrl ? <Image src={result.imageUrl} alt="" width={46} height={62} unoptimized /> : result.title.slice(0, 1)}</span>
          <div><strong>{result.title}</strong><small>{[result.year, result.mediaType === "movie" ? "Movie" : "Series"].filter(Boolean).join(" · ")}</small></div>
          <i aria-hidden="true">→</i>
        </button>)}
        {query.trim().length > 2 && !loading && results.length === 0 && <p>No suggestions yet. Press Enter to search all streaming sources.</p>}
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
