"use client";

import Link from "next/link";
import Image from "next/image";
import ProviderLogo, { providerBrand, providerHost } from "@/components/ProviderLogo";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import NotificationBell from "@/components/NotificationBell";
import { HeaderSearchButton } from "@/components/GlobalSearch";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { personPath } from "@/lib/person-routes";
import { parseTitleKey, titlePath } from "@/lib/title-routes";
import { hasInternalTitleOrigin, readTitleNavigationPreview, rememberTitleNavigation } from "@/lib/title-navigation";

type OfferType = "included" | "free" | "rent" | "buy";
type Offer = { provider: string; providerLogoUrl?: string; type: OfferType; price?: number; currency?: string; quality: "HD" | "4K"; url?: string };
type Title = {
  id: number;
  title: string;
  year: number;
  mediaType: "movie" | "show";
  runtime: string;
  score: number;
  rating: string;
  genres: string[];
  synopsis: string;
  art: string;
  backdropUrl?: string;
  posterUrl?: string;
  offers: Offer[];
  live?: boolean;
  networkNames?: string[];
  popularityPercentile?: number;
  reviewSummary?: string;
  similarTitleIds?: number[];
  trailerUrl?: string;
  watchmodeId?: number;
  willYouLikeThis?: string;
  region?: string;
  releaseDate?: string;
  tmdbId?: number;
  status?: string;
};
type Credit = { personId: number; name: string; role: string; type: "cast" | "crew"; photoUrl?: string };
type Season = { seasonNumber: number; episodeCount: number; availableEpisodeCount?: number; name?: string; airDate?: string; posterUrl?: string; providers?: Array<{ provider: string; type: OfferType; episodeCount: number }> };
type SimilarTitle = { watchmodeId?: number; tmdbId?: number; title: string; year: number; mediaType: "movie" | "show"; score: number; posterUrl?: string; backdropUrl?: string };
type FriendProfile = { uid: string; displayName: string; username: string; photoURL?: string };
type TasteSignal = "watched" | "loved" | "not_for_me";
type TasteEntry = { signal: TasteSignal; id: number; title: string; year: number; mediaType: "movie" | "show"; genres: string[]; tmdbId?: number; watchmodeId?: number; updatedAt?: string };
const sectionNames: Record<string, string> = {
  "title-overview": "Overview",
  "about-title": "About",
  "watch-title": "Where to watch",
  "trailer-title": "Trailer",
  "seasons-title": "Episodes",
  "credits-title": "Cast and creators",
  "similar-title": "More like this",
};

export default function TitleDetailPage({ titleKey }: { titleKey: string }) {
  const router = useRouter();
  const route = useMemo(() => parseTitleKey(titleKey), [titleKey]);
  const [title, setTitle] = useState<Title | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [similar, setSimilar] = useState<SimilarTitle[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [creditsExpanded, setCreditsExpanded] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [region, setRegion] = useState("US");
  const [providerDirectory, setProviderDirectory] = useState<Record<string, string>>({});
  const [savedServices, setSavedServices] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [friendNames, setFriendNames] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendRecipients, setRecommendRecipients] = useState<Set<string>>(() => new Set());
  const [recommendMessage, setRecommendMessage] = useState("");
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [tasteSignal, setTasteSignalState] = useState<TasteSignal | null>(null);
  const [toast, setToast] = useState("");
  const sectionsRef = useRef<HTMLDetailsElement>(null);
  const desktopSectionsRef = useRef<HTMLElement>(null);
  const [activeSectionId, setActiveSectionId] = useState("title-overview");
  const [railEdges, setRailEdges] = useState({ left: false, right: false });
  const activeSection = sectionNames[activeSectionId] ?? "Overview";

  useEffect(() => {
    if (status !== "ready") return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        // Use the collapsed row height so opening the menu does not change the active section.
        const dockTop = (window.innerWidth <= 700 ? sectionsRef.current : desktopSectionsRef.current)?.getBoundingClientRect().top ?? 148;
        const dockBottom = dockTop + (window.innerWidth <= 700 ? 42 : 44);
        let current = "title-overview";
        for (const heading of document.querySelectorAll<HTMLElement>(".titlePageBody h2[id]")) {
          if (heading.getBoundingClientRect().top <= dockBottom + 24) current = heading.id;
        }
        setActiveSectionId(current);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [status, titleKey, credits.length, seasons.length, similar.length]);

  useEffect(() => {
    if (status !== "ready") return;
    const rail = desktopSectionsRef.current;
    if (!rail) return;
    const updateEdges = () => setRailEdges({
      left: rail.scrollLeft > 2,
      right: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2,
    });
    const active = Array.from(rail.querySelectorAll<HTMLAnchorElement>("a")).find((link) => link.hash === `#${activeSectionId}`);
    if (active) {
      const railBox = rail.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      rail.scrollTo({
        left: rail.scrollLeft + activeBox.left - railBox.left - (rail.clientWidth - activeBox.width) / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    }
    updateEdges();
    rail.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => { rail.removeEventListener("scroll", updateEdges); observer.disconnect(); };
  }, [status, activeSectionId, credits.length, seasons.length, similar.length]);

  const goBack = () => {
    // A shared title URL may be the first Stream Find page in this tab.
    const cameFromStreamFind = document.referrer && new URL(document.referrer).origin === window.location.origin;
    if (window.history.length > 1 && (cameFromStreamFind || hasInternalTitleOrigin(window.location.pathname))) router.back();
    else router.push("/");
  };

  useEffect(() => onAuthStateChanged(firebaseAuth, setAccountUser), []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const localRegion = window.localStorage.getItem("streamfind.country");
        const services = JSON.parse(window.localStorage.getItem("streamfind.services") ?? "[]") as string[];
        if (localRegion && /^[A-Z]{2}$/.test(localRegion)) setRegion(localRegion);
        setSavedServices(Array.isArray(services) ? services : []);
      } catch {
        setSavedServices([]);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/providers?region=${region}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ providers?: Array<{ name: string; logo?: string }> }> : { providers: [] })
      .then((data) => setProviderDirectory(Object.fromEntries((data.providers ?? []).filter((provider) => provider.logo).map((provider) => [provider.name, provider.logo!]))))
      .catch(() => undefined);
    return () => controller.abort();
  }, [region]);

  useEffect(() => {
    if (!route) return;
    const controller = new AbortController();
    const candidate = route.source === "watchmode" ? readTitleNavigationPreview<Title>(`/title/${titleKey}`) : null;
    const preview = candidate && candidate.watchmodeId === route.sourceId && (candidate.region ?? "US") === region
      && typeof candidate.title === "string" && Array.isArray(candidate.offers) && Array.isArray(candidate.genres) ? candidate : null;
    const frame = window.requestAnimationFrame(() => {
      setTitle(preview);
      setCredits([]);
      setSeasons([]);
      setSimilar([]);
      setStatus(preview ? "ready" : "loading");
      setError("");
    });
    void (async () => {
      if (route.source === "tmdb") {
        const response = await fetch(`/api/title-details?id=${route.sourceId}&type=${route.mediaType}&region=${region}`, { signal: controller.signal });
        const data = await response.json() as { title?: Title; credits?: Credit[]; seasons?: Season[]; similar?: SimilarTitle[]; error?: string };
        if (!response.ok || !data.title) throw new Error(data.error || "That title could not be loaded.");
        setTitle(data.title);
        setCredits(data.credits ?? []);
        setSeasons(data.seasons ?? []);
        setSimilar([]);
        setSelectedSeason(data.seasons?.[0]?.seasonNumber ?? null);
        setStatus("ready");
        void fetch(`/api/title-details?id=${route.sourceId}&type=${route.mediaType}&section=similar`, { signal: controller.signal })
          .then((result) => result.ok ? result.json() as Promise<{ similar?: SimilarTitle[] }> : { similar: [] })
          .then((related) => { if (!controller.signal.aborted) setSimilar(related.similar ?? []); })
          .catch(() => undefined);
      } else {
        const response = await fetch(`/api/search?q=${encodeURIComponent(route.titleHint)}&id=${route.sourceId}&region=${region}`, { signal: controller.signal });
        const data = await response.json() as { titles?: Title[]; error?: string };
        if (!response.ok || !data.titles?.[0]) throw new Error(data.error || "That title is not currently available in this region.");
        const loadedTitle = data.titles[0];
        setTitle(loadedTitle);
        setCredits([]);
        setSeasons([]);
        setSimilar([]);
        setStatus("ready");
        void Promise.allSettled([
          fetch(`/api/cast?id=${route.sourceId}&v=2`, { signal: controller.signal }).then((result) => result.ok ? result.json() as Promise<{ credits?: Credit[] }> : { credits: [] }),
          loadedTitle.mediaType === "show"
            ? fetch(`/api/seasons?id=${route.sourceId}&region=${region}`, { signal: controller.signal }).then((result) => result.ok ? result.json() as Promise<{ seasons?: Season[] }> : { seasons: [] })
            : Promise.resolve({ seasons: [] as Season[] }),
          loadedTitle.similarTitleIds?.length
            ? fetch(`/api/similar?ids=${loadedTitle.similarTitleIds.slice(0, 6).join(",")}`, { signal: controller.signal }).then((result) => result.ok ? result.json() as Promise<{ titles?: SimilarTitle[] }> : { titles: [] })
            : Promise.resolve({ titles: [] as SimilarTitle[] }),
        ]).then(([credits, seasons, similar]) => {
          if (controller.signal.aborted) return;
          if (credits.status === "fulfilled") setCredits(credits.value.credits ?? []);
          if (seasons.status === "fulfilled") {
            setSeasons(seasons.value.seasons ?? []);
            setSelectedSeason(seasons.value.seasons?.[0]?.seasonNumber ?? null);
          }
          if (similar.status === "fulfilled") setSimilar(similar.value.titles ?? []);
        });
      }
    })().catch((caught) => {
      if (controller.signal.aborted) return;
      if (preview) return;
      setError(caught instanceof Error ? caught.message : "That title could not be loaded.");
      setStatus("error");
    });
    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [region, route, titleKey]);

  useEffect(() => {
    if (!title) return;
    document.title = `${title.title} · Stream Find`;
    const frame = window.requestAnimationFrame(() => {
      try {
        const ids = JSON.parse(window.localStorage.getItem("streamfind.watchlist") ?? "[]") as number[];
        setSaved(ids.includes(title.id));
      } catch {
        setSaved(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [title]);

  useEffect(() => {
    if (!title) return;
    let cancelled = false;
    const local = readTasteSignals()[String(title.id)];
    const frame = window.requestAnimationFrame(() => setTasteSignalState(local?.signal ?? null));
    if (!accountUser) return () => window.cancelAnimationFrame(frame);
    void getDoc(doc(firestore, "users", accountUser.uid, "tasteSignals", String(title.id)))
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;
        const entry = snapshot.data() as TasteEntry;
        const signals = readTasteSignals();
        signals[String(title.id)] = entry;
        window.localStorage.setItem("streamfind.tasteSignals", JSON.stringify(signals));
        setTasteSignalState(entry.signal);
      })
      .catch(() => undefined);
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [accountUser, title]);

  useEffect(() => {
    if (!accountUser || !title) {
      const frame = window.requestAnimationFrame(() => {
        setFriendNames([]);
        setFriends([]);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    let cancelled = false;
    void (async () => {
      const friends = await getDocs(collection(firestore, "users", accountUser.uid, "friends"));
      const profiles = friends.docs.map((friend) => ({
        uid: friend.id,
        displayName: String(friend.data().displayName ?? friend.data().username ?? "A friend"),
        username: String(friend.data().username ?? "friend"),
        ...(friend.data().photoURL ? { photoURL: String(friend.data().photoURL) } : {}),
      }));
      const matches = await Promise.all(friends.docs.slice(0, 12).map(async (friend) => {
        const savedTitle = await getDoc(doc(firestore, "users", friend.id, "watchlist", String(title.id)));
        return savedTitle.exists() ? String(friend.data().displayName ?? friend.data().username ?? "A friend") : null;
      }));
      if (!cancelled) {
        setFriends(profiles);
        setFriendNames(matches.filter((name): name is string => Boolean(name)));
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountUser, title]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const toggleWatchlist = async () => {
    if (!title) return;
    let ids: number[] = [];
    let titles: Title[] = [];
    try {
      ids = JSON.parse(window.localStorage.getItem("streamfind.watchlist") ?? "[]") as number[];
      titles = JSON.parse(window.localStorage.getItem("streamfind.savedTitles") ?? "[]") as Title[];
    } catch {
      // Replace invalid local data with a clean watchlist.
    }
    const nextSaved = !saved;
    const nextIds = nextSaved ? [...new Set([...ids, title.id])] : ids.filter((id) => id !== title.id);
    const nextTitles = nextSaved
      ? [...titles.filter((item) => item.id !== title.id), title]
      : titles.filter((item) => item.id !== title.id);
    window.localStorage.setItem("streamfind.watchlist", JSON.stringify(nextIds));
    window.localStorage.setItem("streamfind.savedTitles", JSON.stringify(nextTitles));
    setSaved(nextSaved);
    if (accountUser) {
      const reference = doc(firestore, "users", accountUser.uid, "watchlist", String(title.id));
      if (nextSaved) await setDoc(reference, { ...JSON.parse(JSON.stringify(title)), savedAt: serverTimestamp() });
      else await deleteDoc(reference);
    }
    showToast(nextSaved ? `${title.title} saved to your watchlist` : `${title.title} removed from your watchlist`);
  };

  const shareTitle = async () => {
    if (!title) return;
    const shareData = { title: `${title.title} · Stream Find`, text: `See where ${title.title} is streaming.`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        showToast("Link copied");
      }
    } catch {
      // Closing the native share sheet needs no error message.
    }
  };

  const updateTasteSignal = async (signal: TasteSignal) => {
    if (!title) return;
    const next = tasteSignal === signal ? null : signal;
    const signals = readTasteSignals();
    if (next) {
      signals[String(title.id)] = {
        signal: next,
        id: title.id,
        title: title.title,
        year: title.year,
        mediaType: title.mediaType,
        genres: title.genres,
        ...(title.tmdbId ? { tmdbId: title.tmdbId } : {}),
        ...(title.watchmodeId ? { watchmodeId: title.watchmodeId } : {}),
        updatedAt: new Date().toISOString(),
      };
    } else delete signals[String(title.id)];
    window.localStorage.setItem("streamfind.tasteSignals", JSON.stringify(signals));
    setTasteSignalState(next);
    if (accountUser) {
      const reference = doc(firestore, "users", accountUser.uid, "tasteSignals", String(title.id));
      if (next) await setDoc(reference, { ...signals[String(title.id)], updatedAt: serverTimestamp() });
      else await deleteDoc(reference);
    }
    showToast(next === "loved" ? "Added to your taste profile" : next === "watched" ? "Marked as watched" : next === "not_for_me" ? "We’ll show fewer titles like this" : "Taste signal removed");
  };

  const sendRecommendation = async () => {
    if (!accountUser || !title || !recommendRecipients.size) return;
    setRecommendBusy(true);
    try {
      const profileSnapshot = await getDoc(doc(firestore, "users", accountUser.uid));
      const profileData = profileSnapshot.data();
      const sender = {
        uid: accountUser.uid,
        displayName: String(profileData?.displayName ?? accountUser.displayName ?? "A friend"),
        username: String(profileData?.username ?? "friend"),
        ...(profileData?.photoURL ? { photoURL: String(profileData.photoURL) } : {}),
      };
      const cleanTitle = JSON.parse(JSON.stringify(title)) as Title;
      const batch = writeBatch(firestore);
      [...recommendRecipients].forEach((toUid) => {
        const recommendationRef = doc(collection(firestore, "recommendations"));
        batch.set(recommendationRef, {
          fromUid: accountUser.uid,
          toUid,
          sender,
          title: cleanTitle,
          titlePath: window.location.pathname,
          message: recommendMessage.trim().slice(0, 240),
          status: "sent",
          sentAt: serverTimestamp(),
        });
        batch.set(doc(firestore, "users", toUid, "notifications", `recommendation-${recommendationRef.id}`), {
          type: "recommendation",
          toUid,
          actor: sender,
          recommendationId: recommendationRef.id,
          heading: `${sender.displayName} sent you a recommendation`,
          body: recommendMessage.trim().slice(0, 240) || `Watch ${title.title}`,
          href: window.location.pathname,
          ...(title.posterUrl ? { imageUrl: title.posterUrl } : {}),
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast(`Recommended to ${recommendRecipients.size === 1 ? "1 friend" : `${recommendRecipients.size} friends`}`);
      setRecommendOpen(false);
      setRecommendRecipients(new Set());
      setRecommendMessage("");
    } catch {
      showToast("That recommendation could not be sent");
    } finally {
      setRecommendBusy(false);
    }
  };

  if (status === "loading") return <TitleLoading titleHint={route?.titleHint} />;
  if (status === "error" || !title) return <TitleError message={error} onBack={() => router.push("/")} />;

  const orderedOffers = [...title.offers].sort((a, b) => offerRank(a, savedServices) - offerRank(b, savedServices) || (a.price ?? 0) - (b.price ?? 0));
  const bestOffer = orderedOffers[0];
  const visibleCredits = creditsExpanded ? credits : credits.slice(0, 6);
  const activeSeason = seasons.find((season) => season.seasonNumber === selectedSeason) ?? seasons[0];
  const trailerEmbed = youtubeEmbed(title.trailerUrl);
  const jumpLinks = [
    { id: "title-overview", label: "Overview" },
    { id: "about-title", label: "About" },
    { id: "watch-title", label: "Where to watch" },
    ...(trailerEmbed ? [{ id: "trailer-title", label: "Trailer" }] : []),
    ...(title.mediaType === "show" && seasons.length ? [{ id: "seasons-title", label: "Episodes" }] : []),
    ...(credits.length ? [{ id: "credits-title", label: "Cast and creators" }] : []),
    ...(similar.length ? [{ id: "similar-title", label: "More like this" }] : []),
  ];

  return (
    <main className="titlePage">
      <TitleGlobalHeader accountUser={accountUser} />
      <div className="titleActionBar">
        <button type="button" onClick={goBack} aria-label="Return to the previous page or Discover">← Back</button>
        <strong><span>{title.title}</span><small>{title.mediaType === "movie" ? "Movie" : "Series"} · {title.year}</small></strong>
        <div className="titleBarActions">
          <button className={saved ? "saved" : ""} type="button" aria-pressed={saved} onClick={() => void toggleWatchlist()}>{saved ? "✓ Saved" : "+ Watchlist"}</button>
        </div>
      </div>
      <details className="titleSectionDock" ref={sectionsRef}>
        <summary aria-label={`Current section: ${activeSection}. Open section navigation`}><span>{activeSection}</span><svg className="titleSectionChevron" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="m4.5 7.5 5.5 5 5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
        <nav aria-label="Jump to a title section">{jumpLinks.map((link) => <a href={`#${link.id}`} key={link.id} onClick={() => sectionsRef.current?.removeAttribute("open")}>{link.label}<span aria-hidden="true">→</span></a>)}</nav>
      </details>
      <div className={`titleSectionDesktopNav${railEdges.left ? " hasMoreLeft" : ""}${railEdges.right ? " hasMoreRight" : ""}`}>
        <nav ref={desktopSectionsRef} aria-label="Jump to a title section">
          {jumpLinks.map((link) => <a href={`#${link.id}`} key={link.id} aria-current={activeSectionId === link.id ? "location" : undefined}>{link.label}</a>)}
        </nav>
      </div>

      <section className="titleHero" id="title-overview" style={title.backdropUrl ? { backgroundImage: `url(${JSON.stringify(title.backdropUrl)})` } : undefined}>
        <span className="titleHeroShade" aria-hidden="true" />
        <div className="titleHeroContent">
          {title.posterUrl && <span className="titlePoster" style={{ backgroundImage: `url(${JSON.stringify(title.posterUrl)})` }} aria-hidden="true" />}
          <div>
            <p>{title.mediaType === "movie" ? "Movie" : "Series"} · {title.year} · {title.rating}</p>
            <h1>{title.title}</h1>
            <span className="titleMeta">{[title.score ? `${title.score}% score` : null, title.runtime, ...title.genres.slice(0, 3)].filter(Boolean).join(" · ")}</span>
            {title.networkNames?.length ? <span className="titleNetworks">From {title.networkNames.join(" · ")}</span> : null}
            <div className="titleHeroActions">
              {bestOffer?.url && <a className="primaryTitleAction" href={bestOffer.url} target="_blank" rel="noreferrer">Watch on {bestOffer.provider} ↗</a>}
              {title.trailerUrl && <a href={title.trailerUrl} target="_blank" rel="noreferrer">▶ Trailer</a>}
              <div className="titleSocialActions"><button type="button" onClick={() => setRecommendOpen(true)}>◎ Recommend</button><button type="button" onClick={() => void shareTitle()}>Share</button></div>
            </div>
            <div className="tasteActions" aria-label="Personalize recommendations">
              <span>Shape your recommendations</span>
              <button className={tasteSignal === "watched" ? "active" : ""} type="button" aria-pressed={tasteSignal === "watched"} onClick={() => void updateTasteSignal("watched")}><svg className="tasteIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg><span>Watched</span></button>
              <button className={tasteSignal === "loved" ? "active loved" : ""} type="button" aria-pressed={tasteSignal === "loved"} onClick={() => void updateTasteSignal("loved")}><svg className="tasteIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.3l8.8-8.9a5.5 5.5 0 0 0 0-7.8Z" /></svg><span>Loved</span></button>
              <button className={tasteSignal === "not_for_me" ? "active negative" : ""} type="button" aria-pressed={tasteSignal === "not_for_me"} onClick={() => void updateTasteSignal("not_for_me")}><svg className="tasteIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 14V3H6.4a2 2 0 0 0-1.9 1.4L2 12.1a2 2 0 0 0 1.9 2.6H9l-.8 4.1a2 2 0 0 0 .5 1.8l1 1.1 6.3-7.7H17Z" /><path d="M17 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" /></svg><span>Not for me</span></button>
            </div>
          </div>
        </div>
      </section>

      <div className="titlePageBody">
        <section className="titleStory" aria-labelledby="about-title">
          <div>
            <p className="sectionKicker">The story</p>
            <h2 id="about-title">About {title.title}</h2>
          </div>
          <p>{title.synopsis}</p>
        </section>

        {friendNames.length > 0 && (
          <section className="friendSignal">
            <span aria-hidden="true">◎</span>
            <div><small>Friend activity</small><strong>{friendNames.length === 1 ? `${friendNames[0]} saved this` : `${friendNames.length} friends saved this`}</strong><p>{friendNames.slice(0, 3).join(", ")}</p></div>
          </section>
        )}

        {title.willYouLikeThis || title.reviewSummary ? (
          <section className="titleInsights">
            {title.willYouLikeThis && <article><small>Will you like it?</small><p>{title.willYouLikeThis}</p></article>}
            {title.reviewSummary && <article><small>What reviewers say</small><p>{title.reviewSummary}</p></article>}
          </section>
        ) : null}

        <section className="titlePageSection" aria-labelledby="watch-title">
          <div className="titleSectionHeading"><div><p className="sectionKicker">Live availability</p><h2 id="watch-title">Where to watch</h2></div><span>{region}</span></div>
          {orderedOffers.length ? (
            <div className="titleOfferGrid">
              {orderedOffers.map((offer, index) => {
                const host = providerHost(offer.provider);
                const content = <><ProviderLogo name={offer.provider} source={providerDirectory[offer.provider] ?? offer.providerLogoUrl} variant="title" /><span><strong>{providerBrand(offer.provider)}</strong><small>{host ? `Via ${host} · ` : ""}{offer.quality} · {index === 0 ? "Best option" : accessLabel(offer)}</small></span><b className={`pricePill ${offer.type}`}>{offerLabel(offer)}</b></>;
                return offer.url
                  ? <a href={offer.url} target="_blank" rel="noreferrer" key={`${offer.provider}-${offer.type}-${index}`}>{content}</a>
                  : <div key={`${offer.provider}-${offer.type}-${index}`}>{content}</div>;
              })}
            </div>
          ) : (
            <div className="releaseNotice"><strong>Streaming availability has not been announced yet.</strong><p>{title.releaseDate ? `Expected ${formatDate(title.releaseDate)}. Save it to receive release alerts.` : "Save this title and Stream Find will continue checking."}</p></div>
          )}
        </section>

        {trailerEmbed && (
          <section className="titlePageSection" aria-labelledby="trailer-title">
            <div className="titleSectionHeading"><div><p className="sectionKicker">Preview</p><h2 id="trailer-title">Watch the trailer</h2></div></div>
            <div className="titleTrailer"><iframe src={trailerEmbed} title={`${title.title} trailer`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
          </section>
        )}

        {title.mediaType === "show" && seasons.length > 0 && (
          <section className="titlePageSection" aria-labelledby="seasons-title">
            <div className="titleSectionHeading"><div><p className="sectionKicker">Episode guide</p><h2 id="seasons-title">Season availability</h2></div><span>{seasons.length} seasons</span></div>
            <div className="titleSeasonTabs" role="tablist" aria-label="Seasons">{seasons.map((season) => <button type="button" role="tab" aria-selected={activeSeason?.seasonNumber === season.seasonNumber} className={activeSeason?.seasonNumber === season.seasonNumber ? "active" : ""} onClick={() => setSelectedSeason(season.seasonNumber)} key={season.seasonNumber}>Season {season.seasonNumber}</button>)}</div>
            {activeSeason && <div className="titleSeasonPanel"><div>{activeSeason.posterUrl && <Image src={activeSeason.posterUrl} alt="" width={64} height={96} unoptimized loading="lazy" />}<div><strong>{activeSeason.name || `Season ${activeSeason.seasonNumber}`}</strong><p>{activeSeason.episodeCount} episodes{activeSeason.airDate ? ` · ${formatDate(activeSeason.airDate)}` : ""}</p></div></div>{activeSeason.providers?.length ? <div className="titleSeasonProviders">{activeSeason.providers.slice(0, 5).map((provider) => <span key={`${provider.provider}-${provider.type}`}><strong>{provider.provider}</strong><small>{provider.episodeCount} episodes · {accessLabel(provider)}</small></span>)}</div> : <p>Episode-level providers are not listed for this season yet.</p>}</div>}
          </section>
        )}

        {credits.length > 0 && (
          <section className="titlePageSection" aria-labelledby="credits-title">
            <div className="titleSectionHeading"><div><p className="sectionKicker">People</p><h2 id="credits-title">Cast and creators</h2></div>{credits.length > 6 && <button type="button" onClick={() => setCreditsExpanded((current) => !current)}>{creditsExpanded ? "Show less" : `View ${credits.length - 6} more`}</button>}</div>
            <div className="titleCreditsGrid">{visibleCredits.map((credit) => {
              const path = personPath(credit);
              const content = <><span className={credit.photoUrl ? "hasPhoto" : ""}>{credit.photoUrl ? <Image src={credit.photoUrl} alt="" width={52} height={52} unoptimized loading="lazy" /> : initials(credit.name)}</span><div><strong>{credit.name}</strong><small>{credit.role}</small><em>View profile →</em></div></>;
              return path
                ? <button type="button" onClick={() => router.push(path)} key={`${credit.type}-${credit.personId}-${credit.role}`}>{content}</button>
                : <article key={`${credit.type}-${credit.personId}-${credit.role}`}>{content}</article>;
            })}</div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="titlePageSection" aria-labelledby="similar-title">
            <div className="titleSectionHeading"><div><p className="sectionKicker">Keep exploring</p><h2 id="similar-title">More like this</h2></div></div>
            <div className="titleSimilarGrid">{similar.map((item) => {
              const path = titlePath(item);
              return <button type="button" onClick={() => { if (path) { rememberTitleNavigation(path); router.push(path); } }} disabled={!path} key={`${item.watchmodeId ?? item.tmdbId}-${item.title}`}><span>{(item.posterUrl || item.backdropUrl) && <Image src={item.posterUrl ?? item.backdropUrl!} alt="" width={180} height={270} unoptimized loading="lazy" />}{item.score > 0 && <small>{item.score}%</small>}</span><strong>{item.title}</strong><small>{item.year} · {item.mediaType === "movie" ? "Movie" : "Series"}</small></button>;
            })}</div>
          </section>
        )}
      </div>

      <footer className="titlePageFooter"><Link className="brand" href="/"><span className="brandMark" aria-hidden="true"><span /></span><span>Stream Find</span></Link><p>Availability by Watchmode · Metadata by TMDB</p></footer>
      {recommendOpen && <RecommendDialog
        user={accountUser}
        friends={friends}
        title={title.title}
        selected={recommendRecipients}
        message={recommendMessage}
        busy={recommendBusy}
        onToggle={(uid) => setRecommendRecipients((current) => {
          const next = new Set(current);
          if (next.has(uid)) next.delete(uid); else next.add(uid);
          return next;
        })}
        onMessage={setRecommendMessage}
        onClose={() => setRecommendOpen(false)}
        onSend={() => void sendRecommendation()}
      />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function RecommendDialog({ user, friends, title, selected, message, busy, onToggle, onMessage, onClose, onSend }: {
  user: User | null;
  friends: FriendProfile[];
  title: string;
  selected: Set<string>;
  message: string;
  busy: boolean;
  onToggle: (uid: string) => void;
  onMessage: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  return <div className="modalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modalPanel recommendDialog" role="dialog" aria-modal="true" aria-labelledby="recommend-title">
      <header><div><p className="sectionKicker">Share a good find</p><h2 id="recommend-title">Recommend {title}</h2></div><button type="button" onClick={onClose} aria-label="Close recommendation dialog">×</button></header>
      {!user ? <div className="recommendEmpty"><strong>Sign in to recommend titles</strong><p>Create your Stream Find profile, add friends, and send this directly to their inbox.</p><Link href="/?panel=friends">Sign in or create an account</Link></div>
      : !friends.length ? <div className="recommendEmpty"><strong>Add a friend first</strong><p>Once a friend accepts your request, they will appear here.</p><Link href="/?panel=friends">Open your friends</Link></div>
      : <>
        <div className="recommendFriendList">{friends.map((friend) => <label key={friend.uid} className={selected.has(friend.uid) ? "selected" : ""}><input type="checkbox" checked={selected.has(friend.uid)} onChange={() => onToggle(friend.uid)} /><span>{friend.photoURL ? <Image src={friend.photoURL} alt="" width={40} height={40} /> : initials(friend.displayName)}</span><span><strong>{friend.displayName}</strong><small>@{friend.username}</small></span><i>{selected.has(friend.uid) ? "✓" : "+"}</i></label>)}</div>
        <label className="recommendMessage">Add a note <span>{message.length}/240</span><textarea value={message} onChange={(event) => onMessage(event.target.value.slice(0, 240))} placeholder="Why should they watch it?" rows={3} /></label>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="recommendSend" type="button" onClick={onSend} disabled={!selected.size || busy}>{busy ? "Sending…" : `Send to ${selected.size || "friend"}`}</button></footer>
      </>}
    </section>
  </div>;
}

function TitleLoading({ titleHint }: { titleHint?: string }) {
  return <main className="titlePage titlePageSkeleton" aria-busy="true">
    <TitleGlobalHeader accountUser={null} />
    <p className="srOnly" role="status">Loading {titleHint || "title"} details</p>
    <div className="titleActionBar" aria-hidden="true"><span className="titleSkeletonBlock titleSkeletonBack" /><strong>{titleHint || <span className="titleSkeletonBlock titleSkeletonBar" />}</strong><span className="titleSkeletonBlock titleSkeletonSave" /></div>
    <div className="titleSkeletonNav" aria-hidden="true"><span className="titleSkeletonBlock" /><span className="titleSkeletonBlock" /><span className="titleSkeletonBlock" /></div>
    <section className="titleSkeletonHero" aria-hidden="true">
      <div className="titleSkeletonHeroContent"><span className="titleSkeletonBlock titleSkeletonPoster" /><div className="titleSkeletonCopy"><span className="titleSkeletonBlock titleSkeletonEyebrow" /><span className="titleSkeletonBlock titleSkeletonHeading" /><span className="titleSkeletonBlock titleSkeletonHeading short" /><span className="titleSkeletonBlock titleSkeletonMeta" /><div className="titleSkeletonActions"><span className="titleSkeletonBlock" /><span className="titleSkeletonBlock" /></div></div></div>
    </section>
    <div className="titleSkeletonBody" aria-hidden="true"><span className="titleSkeletonBlock titleSkeletonSectionHeading" /><span className="titleSkeletonBlock titleSkeletonText" /><span className="titleSkeletonBlock titleSkeletonText short" /><span className="titleSkeletonBlock titleSkeletonSectionHeading" /><div className="titleSkeletonOffers"><span className="titleSkeletonBlock" /><span className="titleSkeletonBlock" /></div></div>
  </main>;
}

function TitleError({ message, onBack }: { message: string; onBack: () => void }) {
  return <main className="titlePage"><TitleGlobalHeader accountUser={null} /><section className="titlePageError"><p className="sectionKicker">Title unavailable</p><h1>We couldn’t open this title.</h1><p>{message}</p><button type="button" onClick={onBack}>Return to Stream Find</button></section></main>;
}

function TitleGlobalHeader({ accountUser }: { accountUser: User | null }) {
  const initials = accountUser
    ? (accountUser.displayName || accountUser.email || "SF").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : "SF";
  return <header className="titleGlobalHeader">
    <Link className="brand" href="/"><span className="brandMark" aria-hidden="true"><span /></span><span>Stream Find</span></Link>
    <nav className="desktopNav" aria-label="Primary navigation">
      <Link className="active" href="/">Discover</Link>
      <Link href="/?view=watchlist">Watchlist</Link>
      <Link href="/?panel=services">My services</Link>
      <Link href="/?panel=friends">Friends</Link>
    </nav>
    <div className="headerActions"><NotificationBell user={accountUser} /><HeaderSearchButton href="/?search=1" /><Link className="profileButton" href="/?panel=friends" aria-label={accountUser ? "Open account and friends" : "Sign in to Stream Find"}>{initials}</Link></div>
  </header>;
}

function offerRank(offer: Offer, services: string[]) {
  if (offer.type === "included" && services.includes(offer.provider)) return services.indexOf(offer.provider) / (services.length + 1);
  return offer.type === "included" ? 1 : offer.type === "free" ? 2 : offer.type === "rent" ? 3 : 4;
}

function offerLabel(offer: Pick<Offer, "type" | "price" | "currency">) {
  if (offer.type === "included") return "Included";
  if (offer.type === "free") return "Free with ads";
  if (typeof offer.price !== "number") return offer.type === "rent" ? "Rent" : "Buy";
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: offer.currency ?? "USD" }).format(offer.price);
  return `${offer.type === "rent" ? "Rent" : "Buy"} ${price}`;
}

function accessLabel(offer: { type: OfferType }) {
  return offer.type === "included" ? "Included" : offer.type === "free" ? "Free with ads" : offer.type === "rent" ? "Rent" : "Buy";
}

function youtubeEmbed(url?: string) {
  if (!url) return null;
  try {
    const value = new URL(url);
    const id = value.hostname.includes("youtu.be") ? value.pathname.slice(1) : value.searchParams.get("v");
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function readTasteSignals() {
  try {
    const value = JSON.parse(window.localStorage.getItem("streamfind.tasteSignals") ?? "{}") as Record<string, TasteEntry>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {} as Record<string, TasteEntry>;
  }
}
