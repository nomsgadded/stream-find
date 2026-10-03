"use client";

import type { ButtonHTMLAttributes } from "react";

export function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="icon"><path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75V21l-5-3.2L7 21V4.75Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

export default function WatchlistButton({ saved, titleName, className = "", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title" | "aria-label" | "aria-pressed"> & { saved: boolean; titleName: string }) {
  const label = `${saved ? "Remove" : "Save"} ${titleName} ${saved ? "from" : "to"} watchlist`;
  return <button {...props} type="button" className={`watchlistIconButton ${className}${saved ? " saved" : ""}`} aria-pressed={saved} aria-label={label} title={label}><BookmarkIcon filled={saved} /></button>;
}
