"use client";

import { useEffect, useState } from "react";
import { personPath } from "@/lib/person-routes";
import { titlePath } from "@/lib/title-routes";
import { rememberTitleNavigation } from "@/lib/title-navigation";
import ProviderLogo from "@/components/ProviderLogo";

type Kind = "show" | "movie" | "person";
type Genre = "all" | "k-drama" | "anime" | "comedy" | "crime" | "documentary";
const genreLabels: Record<Genre, string> = { all: "All", "k-drama": "K-dramas", anime: "Anime", comedy: "Comedy", crime: "Crime", documentary: "Documentaries" };
const genreLabel = (value: Genre, kind: Kind) => value === "k-drama" && kind === "movie" ? "Korean dramas" : genreLabels[value];
type Title = { id: number; title: string; mediaType: "show" | "movie"; tmdbId: number; year?: number; posterUrl?: string };
type Person = { id: number; name: string; photoUrl: string };
type ResponseData = { titles?: Title[]; people?: Person[]; source?: string; error?: string };

export default function PlatformHighlights({ services, region, onServices }: { services: string[]; region: string; onServices: () => void }) {
  const [kind, setKind] = useState<Kind>("show");
  const [genre, setGenre] = useState<Genre>("all");
  const [service, setService] = useState(services[0] ?? "");
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedService = services.includes(service) ? service : services[0] ?? "";

  useEffect(() => {
    if (!selectedService) return;
    const controller = new AbortController();
    let disposed = false;
    const frame = window.requestAnimationFrame(() => { setLoading(true); setData(null); });
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const params = new URLSearchParams({ kind, region });
    params.set("service", selectedService);
    if (kind !== "person") params.set("genre", genre);
    void fetch(`/api/platform-highlights?${params}`, { signal: controller.signal })
      .then(async (response) => { const result = await response.json() as ResponseData; if (!response.ok) throw new Error(result.error); return result; })
      .then(setData)
      .catch(() => { if (!disposed) setData({ error: "These picks could not load right now." }); })
      .finally(() => { window.clearTimeout(timeout); if (!disposed) setLoading(false); });
    return () => { disposed = true; window.cancelAnimationFrame(frame); window.clearTimeout(timeout); controller.abort(); };
  }, [kind, genre, region, selectedService]);

  const genres: Genre[] = ["all", "k-drama", "anime", "comedy", "crime", "documentary"];

  return <section className="platformHighlights" aria-labelledby="platform-picks-title">
    <div className="memberHeading"><div><p className="sectionKicker">When you’re choosing solo</p><h2 id="platform-picks-title">Popular on your services</h2></div><button type="button" onClick={onServices}>Edit services →</button></div>
    {services.length > 0 && <div className="platformServiceTabs" role="group" aria-label="Choose a streaming service">
      {services.map((name) => <button type="button" key={name} className={name === selectedService ? "active" : ""} aria-pressed={name === selectedService} aria-label={name} title={name} onClick={() => { if (name !== selectedService) { setData(null); setLoading(true); setService(name); } }}><ProviderLogo name={name} /><span>{name}</span></button>)}
    </div>}
    <div className="platformControls">
      <div className="platformTabs" role="group" aria-label="Browse popular titles or people">
        {([ ["show", "Shows"], ["movie", "Movies"], ["person", "People"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} className={kind === value ? "active" : ""} onClick={() => { if (value !== kind) { setData(null); setLoading(true); setKind(value); setGenre("all"); } }}>{label}</button>)}
      </div>
    </div>
    {services.length > 0 && kind !== "person" && <div className="platformGenres" role="group" aria-label={`Browse ${kind === "show" ? "show" : "movie"} genres on ${selectedService}`}>
      <span>Genres</span>{genres.map((value) => <button type="button" key={value} aria-pressed={genre === value} className={genre === value ? "active" : ""} onClick={() => { if (value !== genre) { setData(null); setLoading(true); setGenre(value); } }}>{genreLabel(value, kind)}</button>)}
    </div>}
    {!services.length ? <div className="platformEmpty"><p>Choose the services you have to see popular shows, movies, and people on them.</p><button type="button" onClick={onServices}>Choose services</button></div> : <>
      <p className="platformSource">{kind === "person" ? `Cast from popular shows and movies listed on ${selectedService} in ${region} · TMDB popularity` : `${genre === "all" ? `Popular ${kind === "show" ? "shows" : "movies"}` : `Popular ${genreLabel(genre, kind).toLowerCase()}`} listed as included on ${selectedService} in ${region} · Ranked by TMDB popularity, not ${selectedService}’s official chart`}</p>
      {loading ? <div className="platformEmpty" role="status">Finding picks…</div> : data?.error ? <div className="platformEmpty" role="status">{data.error}</div> : kind === "person" ?
        data?.people?.length ? <div className="discoveryRail">{data.people.map((person) => { const href = personPath({ personId: person.id, name: person.name }); return href && <a className="discoveryCard" href={href} key={person.id}><span className="discoveryPoster platformPortrait" style={{ backgroundImage: `url(${JSON.stringify(person.photoUrl)})` }} /><span className="discoveryCardCopy"><strong>{person.name}</strong><small>Explore filmography →</small></span></a>; })}</div> : <div className="platformEmpty">No cast to show on this service right now. Try another service.</div> :
        data?.titles?.length ? <div className="discoveryRail">{data.titles.map((title, index) => { const href = titlePath(title); return href && <a className="discoveryCard" href={href} onClick={() => rememberTitleNavigation(href)} key={`${title.mediaType}-${title.id}`}><span className="discoveryPoster" style={{ backgroundImage: `url(${JSON.stringify(title.posterUrl)})` }}><span className="platformRank" aria-label={`TMDB popularity position ${index + 1}`}>{index + 1}</span></span><span className="discoveryCardCopy"><strong>{title.title}</strong><small>{title.year} · Included on {selectedService}</small></span></a>; })}</div> : <div className="platformEmpty">No {genre === "all" ? "matching titles" : genreLabel(genre, kind).toLowerCase()} included on this service right now. Try another genre or service.</div>}
    </>}
  </section>;
}
