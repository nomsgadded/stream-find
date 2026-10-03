"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import NotificationBell from "@/components/NotificationBell";
import { HeaderSearchButton } from "@/components/GlobalSearch";
import { titlePath } from "@/lib/title-routes";
import { rememberTitleNavigation } from "@/lib/title-navigation";

type Person = {
  id: number;
  name: string;
  biography: string;
  department: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  profileUrl?: string;
  alsoKnownAs: string[];
  imdbUrl?: string;
  homepage?: string;
};

type PersonCredit = {
  tmdbId: number;
  title: string;
  mediaType: "movie" | "show";
  year?: number;
  role: string;
  score: number;
  posterUrl?: string;
  backdropUrl?: string;
};

type PersonResponse = {
  person?: Person;
  credits?: PersonCredit[];
  stats?: { movies: number; shows: number };
  error?: string;
};

export default function PersonDetailPage({ personId }: { personId: number }) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [credits, setCredits] = useState<PersonCredit[]>([]);
  const [stats, setStats] = useState({ movies: 0, shows: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "movie" | "show">("all");
  const [bioExpanded, setBioExpanded] = useState(false);
  const [accountUser, setAccountUser] = useState<User | null>(null);

  useEffect(() => onAuthStateChanged(firebaseAuth, setAccountUser), []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/person?id=${personId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as PersonResponse;
        if (!response.ok || !data.person) throw new Error(data.error || "This profile could not be loaded.");
        return data;
      })
      .then((data) => {
        setPerson(data.person ?? null);
        setCredits(data.credits ?? []);
        setStats(data.stats ?? { movies: 0, shows: 0 });
        setStatus("ready");
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "This profile could not be loaded.");
        setStatus("error");
      });
    return () => controller.abort();
  }, [personId]);

  useEffect(() => {
    if (person) document.title = `${person.name} · Stream Find`;
  }, [person]);

  const visibleCredits = useMemo(() => credits.filter((credit) => filter === "all" || credit.mediaType === filter), [credits, filter]);
  const initials = accountUser
    ? (accountUser.displayName || accountUser.email || "SF").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : "SF";

  if (status === "loading") return <main className="personPage"><PersonHeader initials={initials} user={accountUser} /><div className="personLoading"><span /><span /><p>Building the filmography…</p></div></main>;
  if (status === "error" || !person) return <main className="personPage"><PersonHeader initials={initials} user={accountUser} /><section className="personError"><p className="sectionKicker">Profile unavailable</p><h1>We couldn’t open this person.</h1><p>{error}</p><button type="button" onClick={() => router.back()}>Go back</button></section></main>;

  const hasLongBio = person.biography.length > 520;
  const biography = !bioExpanded && hasLongBio ? `${person.biography.slice(0, 520).replace(/\s+\S*$/, "")}…` : person.biography;

  return <main className="personPage">
    <PersonHeader initials={initials} user={accountUser} />
    <div className="personActionBar"><button type="button" onClick={() => router.back()}>← Back</button><strong>{person.name}</strong><span>{person.department}</span></div>
    <section className="personHero">
      <div className="personHeroGlow" aria-hidden="true" />
      <div className="personPortrait">{person.profileUrl ? <Image src={person.profileUrl} alt={`Portrait of ${person.name}`} width={480} height={720} priority /> : <span>{person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>}</div>
      <div className="personIntro">
        <p className="sectionKicker">Cast & creator profile</p>
        <h1>{person.name}</h1>
        <p className="personDepartment">{person.department}</p>
        <div className="personFacts">
          {person.birthday && <span><small>Born</small>{formatDate(person.birthday)}{person.placeOfBirth ? ` · ${person.placeOfBirth}` : ""}</span>}
          {person.deathday && <span><small>Died</small>{formatDate(person.deathday)}</span>}
          <span><small>Known credits</small>{stats.movies} movies · {stats.shows} shows</span>
        </div>
        <div className="personLinks">
          {person.imdbUrl && <a href={person.imdbUrl} target="_blank" rel="noreferrer">IMDb ↗</a>}
          {person.homepage && <a href={person.homepage} target="_blank" rel="noreferrer">Official site ↗</a>}
        </div>
      </div>
    </section>

    <div className="personPageBody">
      <section className="personBiography" aria-labelledby="person-about">
        <div><p className="sectionKicker">About</p><h2 id="person-about">The story behind the work</h2></div>
        <div><p>{biography}</p>{hasLongBio && <button type="button" onClick={() => setBioExpanded((current) => !current)}>{bioExpanded ? "Show less" : "Read full biography"}</button>}{person.alsoKnownAs.length > 0 && <small>Also known as {person.alsoKnownAs.join(" · ")}</small>}</div>
      </section>

      <section className="personFilmography" aria-labelledby="filmography-title">
        <div className="personSectionHeading"><div><p className="sectionKicker">Explore their work</p><h2 id="filmography-title">Movies and shows</h2></div><div className="personFilters" role="tablist" aria-label="Filter credits"><button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{credits.length}</span></button><button type="button" role="tab" aria-selected={filter === "movie"} className={filter === "movie" ? "active" : ""} onClick={() => setFilter("movie")}>Movies <span>{stats.movies}</span></button><button type="button" role="tab" aria-selected={filter === "show"} className={filter === "show" ? "active" : ""} onClick={() => setFilter("show")}>Shows <span>{stats.shows}</span></button></div></div>
        <div className="personCreditGrid">{visibleCredits.map((credit) => {
          const path = titlePath({ title: credit.title, mediaType: credit.mediaType, tmdbId: credit.tmdbId });
          return <button type="button" onClick={() => { if (path) { rememberTitleNavigation(path); router.push(path); } }} key={`${credit.mediaType}-${credit.tmdbId}`}>
            <span className="personCreditPoster" style={credit.posterUrl ? { backgroundImage: `url(${JSON.stringify(credit.posterUrl)})` } : undefined}>{credit.score > 0 && <small>{credit.score}%</small>}<i>View title →</i></span>
            <strong>{credit.title}</strong>
            <small>{[credit.year, credit.mediaType === "movie" ? "Movie" : "Series"].filter(Boolean).join(" · ")}</small>
            <em>{credit.role}</em>
          </button>;
        })}</div>
      </section>
    </div>
    <footer className="titlePageFooter"><Link className="brand" href="/"><span className="brandMark" aria-hidden="true"><span /></span><span>Stream Find</span></Link><p>Profile, imagery, and credits by TMDB</p></footer>
  </main>;
}

function PersonHeader({ initials, user }: { initials: string; user: User | null }) {
  return <header className="titleGlobalHeader"><Link className="brand" href="/"><span className="brandMark" aria-hidden="true"><span /></span><span>Stream Find</span></Link><nav className="desktopNav" aria-label="Primary navigation"><Link className="active" href="/">Discover</Link><Link href="/?view=watchlist">Watchlist</Link><Link href="/?panel=services">My services</Link><Link href="/?panel=friends">Friends</Link></nav><div className="headerActions"><NotificationBell user={user} /><HeaderSearchButton href="/?search=1" /><Link className="profileButton" href="/?panel=friends">{initials}</Link></div></header>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}
