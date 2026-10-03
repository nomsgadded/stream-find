"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ReviewNote = {
  id: string;
  x: number;
  y: number;
  target: string;
  text: string;
  createdAt: string;
};

type DraftNote = Omit<ReviewNote, "id" | "text" | "createdAt"> & {
  clientX: number;
  clientY: number;
};

export default function ReviewMode() {
  const pathname = usePathname();
  const storageKey = useMemo(() => `streamfind.reviewNotes:${pathname}`, [pathname]);
  const [active, setActive] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [draft, setDraft] = useState<DraftNote | null>(null);
  const [draftText, setDraftText] = useState("");
  const [copied, setCopied] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "offline">("loading");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const reviewEnabled = new URLSearchParams(window.location.search).get("review") === "1";
      setActive(reviewEnabled);
      if (!reviewEnabled) return;
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as ReviewNote[];
        setNotes(Array.isArray(saved) ? saved : []);
      } catch {
        setNotes([]);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const syncNotes = async () => {
      try {
        const localNotes = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as ReviewNote[];
        const response = await fetch(`/api/review-notes?page=${encodeURIComponent(pathname)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Review notes could not sync.");
        const data = await response.json() as { notes?: ReviewNote[] };
        const remoteNotes = Array.isArray(data.notes) ? data.notes : [];
        const remoteIds = new Set(remoteNotes.map((note) => note.id));
        const unsynced = Array.isArray(localNotes) ? localNotes.filter((note) => !remoteIds.has(note.id)) : [];
        if (unsynced.length) {
          await Promise.all(unsynced.map((note) => fetch("/api/review-notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page: pathname, note }),
          })));
        }
        const merged = [...remoteNotes, ...unsynced].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (!cancelled) {
          setNotes(merged);
          setSyncStatus("synced");
        }
      } catch {
        if (!cancelled) setSyncStatus("offline");
      }
    };
    void syncNotes();
    const interval = window.setInterval(() => void syncNotes(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, pathname, storageKey]);

  useEffect(() => {
    if (!active) return;
    window.localStorage.setItem(storageKey, JSON.stringify(notes));
  }, [active, notes, storageKey]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDraft(null);
      setDraftText("");
      setPlacing(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  if (!active) return null;

  const beginNote = () => {
    setDraft(null);
    setDraftText("");
    setPlacing(true);
    setPanelOpen(false);
  };

  const placeNote = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const underlying = document.elementsFromPoint(event.clientX, event.clientY)
      .find((element) => !element.closest("[data-review-ui]"));
    setDraft({
      x: Math.round(event.clientX + window.scrollX),
      y: Math.round(event.clientY + window.scrollY),
      clientX: event.clientX,
      clientY: event.clientY,
      target: describeTarget(underlying),
    });
    setPlacing(false);
  };

  const saveDraft = () => {
    if (!draft || !draftText.trim()) return;
    const note: ReviewNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: draft.x,
      y: draft.y,
      target: draft.target,
      text: draftText.trim(),
      createdAt: new Date().toISOString(),
    };
    setNotes((current) => [...current, note]);
    setSyncStatus("loading");
    void fetch("/api/review-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pathname, note }),
    }).then((response) => {
      if (!response.ok) throw new Error("Sync failed");
      setSyncStatus("synced");
    }).catch(() => setSyncStatus("offline"));
    setDraft(null);
    setDraftText("");
    setPanelOpen(true);
  };

  const copyNotes = async () => {
    const summary = notes.length
      ? notes.map((note, index) => `${index + 1}. ${note.text}\n   Target: ${note.target}\n   Page: ${pathname}`).join("\n\n")
      : `No review notes on ${pathname}`;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const exitReview = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("review");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setActive(false);
  };

  const deleteNote = (id: string) => {
    setNotes((current) => current.filter((item) => item.id !== id));
    setSyncStatus("loading");
    void fetch("/api/review-notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pathname, id }),
    }).then((response) => {
      if (!response.ok) throw new Error("Sync failed");
      setSyncStatus("synced");
    }).catch(() => setSyncStatus("offline"));
  };

  return (
    <div className="reviewMode" data-review-ui>
      <div className="reviewPins" aria-label={`${notes.length} review notes`}>
        {notes.map((note, index) => (
          <button
            type="button"
            className="reviewPin"
            style={{ left: note.x, top: note.y }}
            onClick={() => setPanelOpen(true)}
            aria-label={`Open review note ${index + 1}: ${note.text}`}
            key={note.id}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {placing && <div className="reviewCapture" onClick={placeNote} aria-label="Click anywhere to place a review note"><span>Click the area you want to comment on · Esc to cancel</span></div>}

      {draft && (
        <form
          className="reviewComposer"
          style={{ left: Math.min(draft.clientX, window.innerWidth - 336), top: Math.min(draft.clientY + 18, window.innerHeight - 220) }}
          onSubmit={(event) => { event.preventDefault(); saveDraft(); }}
        >
          <small>Comment on {draft.target}</small>
          <textarea autoFocus value={draftText} onChange={(event) => setDraftText(event.target.value)} placeholder="What should change here?" rows={4} />
          <div><button type="button" onClick={() => setDraft(null)}>Cancel</button><button className="reviewPrimary" type="submit" disabled={!draftText.trim()}>Save note</button></div>
        </form>
      )}

      <div className="reviewToolbar">
        <span><i className={syncStatus} /> Review mode <small>{syncStatus === "synced" ? "Synced" : syncStatus === "offline" ? "Offline" : "Syncing"}</small></span>
        <button className="reviewPrimary" type="button" onClick={beginNote}>+ Add note</button>
        <button type="button" onClick={() => setPanelOpen((current) => !current)}>{notes.length} {notes.length === 1 ? "note" : "notes"}</button>
        <button type="button" onClick={exitReview}>Exit</button>
      </div>

      {panelOpen && (
        <aside className="reviewPanel" aria-label="Review notes">
          <header><div><small>Stream Find review</small><strong>{pathname}</strong></div><button type="button" onClick={() => setPanelOpen(false)} aria-label="Close review notes">×</button></header>
          <div className="reviewNoteList">
            {notes.length ? notes.map((note, index) => (
              <article key={note.id}>
                <span>{index + 1}</span>
                <div><p>{note.text}</p><small>{note.target}</small></div>
                <button type="button" onClick={() => deleteNote(note.id)} aria-label={`Delete note ${index + 1}`}>×</button>
              </article>
            )) : <p className="reviewEmpty">Add a note, then click exactly where you want something changed.</p>}
          </div>
          <footer><button type="button" onClick={() => void copyNotes()} disabled={!notes.length}>{copied ? "Copied" : "Copy notes"}</button></footer>
        </aside>
      )}
    </div>
  );
}

function describeTarget(element: Element | undefined) {
  if (!element) return "page";
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = [...element.classList].filter((name) => !name.startsWith("review")).slice(0, 2).map((name) => `.${name}`).join("");
  const text = element.textContent?.replace(/\s+/g, " ").trim().slice(0, 42);
  return `${tag}${id}${classes}${text ? ` · “${text}${(element.textContent?.trim().length ?? 0) > 42 ? "…" : "”"}` : ""}`;
}
