"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import ModalDialog from "@/components/ModalDialog";
import ProviderLogo from "@/components/ProviderLogo";
import EpisodeGuide from "@/components/EpisodeGuide";

type PreviewTitle = { title: string; synopsis: string; year: number; runtime: string; genres: string[]; trailerUrl?: string; offers: Array<{ provider: string; type: "included" | "free" | "rent" | "buy"; url?: string }> };
type Credit = { personId: number; name: string; role: string; type: string; photoUrl?: string };
export type PreviewCandidate = { tmdbId: number; mediaType: "movie" | "show"; title: string; year?: number; posterUrl: string };

export default function TitlePreviewDialog({ candidate, region, onClose }: { candidate: PreviewCandidate; region: string; onClose: () => void }) {
  const [details, setDetails] = useState<{ title: PreviewTitle; credits: Credit[] } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(`/api/title-details?id=${candidate.tmdbId}&type=${candidate.mediaType}&region=${encodeURIComponent(region)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.title) throw new Error(data.error || "Details could not be loaded.");
      if (!controller.signal.aborted) setDetails({ title: data.title, credits: data.credits ?? [] });
    })().catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Details could not be loaded."); });
    return () => controller.abort();
  }, [candidate.tmdbId, candidate.mediaType, region, retry]);

  return <div className="modalBackdrop togetherPreviewBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <ModalDialog className="togetherPreview" aria-labelledby="together-preview-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="togetherPreviewHeader"><span>Title details</span><button type="button" data-dialog-autofocus aria-label="Close title details and return to picks" onClick={onClose}>×</button></header>
      <div className="togetherPreviewContent">
        <div className="togetherPreviewIntro">{candidate.posterUrl && <span className="togetherCandidatePoster" style={{ backgroundImage: `url(${JSON.stringify(candidate.posterUrl)})` }} aria-hidden="true" />}<div><p className="sectionKicker">{candidate.mediaType === "show" ? "Series" : "Movie"}{candidate.year ? ` · ${candidate.year}` : ""}</p><h2 id="together-preview-title">{candidate.title}</h2>{details && <p>{[details.title.runtime, ...details.title.genres].filter(Boolean).join(" · ")}</p>}</div></div>
        {!details && !error && <p role="status" aria-busy="true">Loading title details…</p>}
        {error && <div role="alert"><p>{error}</p><button className="secondaryAction" type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Try again</button></div>}
        {details && <>
          <section><h3>About</h3><p>{details.title.synopsis || "A synopsis hasn’t been added yet."}</p></section>
          {candidate.mediaType === "show" && <EpisodeGuide key={candidate.tmdbId} tmdbId={candidate.tmdbId} showTitle={candidate.title} posterUrl={candidate.posterUrl} year={candidate.year} />}
          {trailerEmbed(details.title.trailerUrl) && <section><h3>Trailer</h3><div className="titleTrailer"><iframe src={trailerEmbed(details.title.trailerUrl)!} title={`${candidate.title} trailer`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div></section>}
          <section><h3>Where to watch <small>{region}</small></h3>{details.title.offers.length ? <div className="togetherPreviewOffers">{details.title.offers.map((offer, index) => {
            const content = <><ProviderLogo name={offer.provider} variant="title" /><span><strong>{offer.provider}</strong><small>{offer.type === "included" ? "Included" : offer.type === "free" ? "Free with ads" : offer.type === "rent" ? "Rent · check price" : "Buy · check price"}</small></span>{offer.url && <span aria-hidden="true">↗</span>}</>;
            return offer.url ? <a href={offer.url} target="_blank" rel="noreferrer" key={index}>{content}</a> : <div key={index}>{content}</div>;
          })}</div> : <p>Streaming availability hasn’t been verified in {region}. Check your streaming services directly.</p>}<p className="togetherPreviewAttribution">Availability by <a href="https://www.justwatch.com/" target="_blank" rel="noreferrer">JustWatch</a> via TMDB. Provider links may open an availability guide.</p></section>
          {details.credits.length > 0 && <section><h3>Cast and creators</h3><div className="togetherPreviewCredits" id="together-preview-credits">{details.credits.slice(0, expanded ? undefined : 6).map((credit) => <div key={`${credit.personId}-${credit.type}-${credit.role}`}><span>{credit.photoUrl ? <Image src={credit.photoUrl} alt="" width={48} height={48} unoptimized loading="lazy" /> : credit.name.slice(0, 1)}</span><div><strong>{credit.name}</strong><small>{credit.role}</small></div></div>)}</div>{details.credits.length > 6 && <button className="titleCreditsExpand" type="button" aria-expanded={expanded} aria-controls="together-preview-credits" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : `View ${details.credits.length - 6} more`}</button>}</section>}
        </>}
      </div>
    </ModalDialog>
  </div>;
}

function trailerEmbed(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const id = host === "youtu.be" ? url.pathname.slice(1) : ["youtube.com", "www.youtube.com"].includes(host) ? url.searchParams.get("v") : null;
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  } catch { return null; }
}
