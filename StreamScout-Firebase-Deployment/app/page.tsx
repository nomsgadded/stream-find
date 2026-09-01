"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type OfferType = "included" | "free" | "rent" | "buy";
type MediaType = "movie" | "show";
type AccessFilter = "all" | OfferType;

type Offer = {
  provider: string;
  type: OfferType;
  price?: number;
  quality: "HD" | "4K";
  url?: string;
};

type Title = {
  id: number;
  title: string;
  year: number;
  mediaType: MediaType;
  runtime: string;
  score: number;
  rating: string;
  genres: string[];
  synopsis: string;
  art: string;
  offers: Offer[];
  live?: boolean;
  watchmodeId?: number;
};

type LiveSearchResponse = {
  error?: string;
  titles?: Title[];
};

type ProviderStyle = {
  name: string;
  mark: string;
  className: string;
  logo?: string;
};

const SearchIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const BookmarkIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75V21l-5-3.2L7 21V4.75Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="m5.5 12.5 4 4L18.5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SlidersIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M4 7h10m4 0h2M4 17h3m4 0h9M14 4v6M7 14v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const providers: ProviderStyle[] = [
  { name: "Netflix", mark: "N", className: "netflix" },
  { name: "Max", mark: "m", className: "max" },
  { name: "Disney+", mark: "D+", className: "disney" },
  { name: "Prime Video", mark: "P", className: "prime" },
  { name: "Apple TV+", mark: "", className: "apple" },
  { name: "Hulu", mark: "h", className: "hulu" },
  { name: "Peacock", mark: "p", className: "peacock" },
  { name: "Tubi", mark: "t", className: "tubi" },
  { name: "Pluto TV", mark: "p", className: "pluto" },
  { name: "Roku Channel", mark: "R", className: "roku" },
  { name: "Paramount+", mark: "P+", className: "paramount" },
  { name: "Discovery+", mark: "d+", className: "discovery" },
  { name: "Starz", mark: "S", className: "starz" },
  { name: "Crunchyroll", mark: "C", className: "crunchyroll" },
  { name: "Rakuten Viki", mark: "VIKI", className: "viki", logo: "/brands/rakuten-viki.svg" },
  { name: "Google TV", mark: "G", className: "google" },
];

const catalog: Title[] = [
  {
    id: 1,
    title: "The Last Horizon",
    year: 2025,
    mediaType: "movie",
    runtime: "2h 11m",
    score: 94,
    rating: "PG-13",
    genres: ["Science fiction", "Drama"],
    synopsis: "A cartographer crosses an uncharted desert to decode a signal that may be humanity's final invitation beyond Earth.",
    art: "posterDesert",
    offers: [
      { provider: "Max", type: "included", quality: "4K" },
      { provider: "Prime Video", type: "rent", price: 5.99, quality: "4K" },
      { provider: "Apple TV+", type: "buy", price: 19.99, quality: "4K" },
    ],
  },
  {
    id: 2,
    title: "Harbor No. 7",
    year: 2026,
    mediaType: "show",
    runtime: "8 episodes",
    score: 91,
    rating: "TV-MA",
    genres: ["Mystery", "Thriller"],
    synopsis: "A night-ferry captain discovers that one passenger appears on every manifest, even on nights the harbor is closed.",
    art: "posterHarbor",
    offers: [
      { provider: "Netflix", type: "included", quality: "4K" },
      { provider: "Peacock", type: "included", quality: "HD" },
    ],
  },
  {
    id: 3,
    title: "Afterlight",
    year: 2024,
    mediaType: "movie",
    runtime: "1h 48m",
    score: 88,
    rating: "R",
    genres: ["Drama", "Romance"],
    synopsis: "Two strangers retrace the path of a vanished comet and find a second chance in the towns it briefly illuminated.",
    art: "posterAfterlight",
    offers: [
      { provider: "Tubi", type: "free", quality: "HD" },
      { provider: "Roku Channel", type: "free", quality: "HD" },
      { provider: "Prime Video", type: "rent", price: 3.99, quality: "4K" },
      { provider: "Apple TV+", type: "buy", price: 14.99, quality: "4K" },
    ],
  },
  {
    id: 4,
    title: "Glass Rooms",
    year: 2025,
    mediaType: "show",
    runtime: "10 episodes",
    score: 90,
    rating: "TV-14",
    genres: ["Thriller", "Technology"],
    synopsis: "Employees at a flawless new headquarters begin receiving messages from rooms that do not exist on the building plans.",
    art: "posterGlass",
    offers: [
      { provider: "Prime Video", type: "included", quality: "4K" },
      { provider: "Apple TV+", type: "buy", price: 24.99, quality: "4K" },
    ],
  },
  {
    id: 5,
    title: "Northbound",
    year: 2023,
    mediaType: "movie",
    runtime: "2h 02m",
    score: 86,
    rating: "PG",
    genres: ["Adventure", "Family"],
    synopsis: "A family follows an impossible compass through winter country in search of a place erased from every modern map.",
    art: "posterNorth",
    offers: [
      { provider: "Disney+", type: "included", quality: "4K" },
      { provider: "Hulu", type: "included", quality: "HD" },
      { provider: "Prime Video", type: "rent", price: 4.99, quality: "4K" },
    ],
  },
  {
    id: 6,
    title: "Small Hours",
    year: 2026,
    mediaType: "movie",
    runtime: "1h 39m",
    score: 84,
    rating: "PG-13",
    genres: ["Comedy", "Drama"],
    synopsis: "Four overnight workers keep a fading neighborhood awake while trying to solve each other's lives before sunrise.",
    art: "posterHours",
    offers: [
      { provider: "Hulu", type: "included", quality: "4K" },
      { provider: "Tubi", type: "free", quality: "HD" },
      { provider: "Prime Video", type: "rent", price: 2.99, quality: "HD" },
    ],
  },
  {
    id: 7,
    title: "Signal Lost",
    year: 2025,
    mediaType: "show",
    runtime: "7 episodes",
    score: 93,
    rating: "TV-14",
    genres: ["Science fiction", "Mystery"],
    synopsis: "A radio astronomer starts receiving tomorrow's emergency broadcasts and has one night to change what they predict.",
    art: "posterSignal",
    offers: [
      { provider: "Apple TV+", type: "included", quality: "4K" },
      { provider: "Prime Video", type: "buy", price: 18.99, quality: "4K" },
    ],
  },
  {
    id: 8,
    title: "Paper Kingdom",
    year: 2024,
    mediaType: "movie",
    runtime: "1h 44m",
    score: 87,
    rating: "PG",
    genres: ["Animation", "Fantasy"],
    synopsis: "A young illustrator folds a doorway into her sketchbook and must restore a kingdom before the last page disappears.",
    art: "posterPaper",
    offers: [
      { provider: "Pluto TV", type: "free", quality: "HD" },
      { provider: "Roku Channel", type: "free", quality: "HD" },
      { provider: "Apple TV+", type: "buy", price: 12.99, quality: "4K" },
    ],
  },
  {
    id: 9,
    title: "Marlowe's",
    year: 2025,
    mediaType: "show",
    runtime: "12 episodes",
    score: 82,
    rating: "TV-14",
    genres: ["Comedy", "Food"],
    synopsis: "A closed restaurant's former staff reunite every Sunday and accidentally become the city's most unusual advice club.",
    art: "posterMarlowe",
    offers: [
      { provider: "Peacock", type: "included", quality: "HD" },
      { provider: "Prime Video", type: "buy", price: 19.99, quality: "HD" },
    ],
  },
];

const offerOrder: Record<OfferType, number> = { included: 0, free: 1, rent: 2, buy: 3 };

function getProvider(name: string) {
  if (name === "Apple TV") {
    return { name, mark: "", className: "apple" };
  }
  return providers.find((provider) => provider.name === name) ?? {
    name,
    mark: name.slice(0, 2).toUpperCase(),
    className: "providerGeneric",
  };
}

function ProviderMark({ provider, variant = "service" }: {
  provider: ProviderStyle;
  variant?: "service" | "badge";
}) {
  return (
    <span className={`${variant === "service" ? "serviceMark" : "providerBadge"} ${provider.className}`} aria-hidden="true">
      {provider.logo
        ? <Image className="providerLogo" src={provider.logo} alt="" width={28} height={14} />
        : provider.mark}
    </span>
  );
}

function offerLabel(offer: Offer) {
  if (offer.type === "included") return "Included";
  if (offer.type === "free") return "Free with ads";
  return `${offer.type === "rent" ? "Rent" : "Buy"} $${offer.price?.toFixed(2)}`;
}

function bestOffer(offers: Offer[], savedServices: string[]) {
  const valueRank = (offer: Offer) => {
    if (offer.type === "included" && savedServices.includes(offer.provider)) return 0;
    if (offer.type === "free") return 1;
    if (offer.type === "rent") return 2;
    if (offer.type === "buy") return 3;
    return 4;
  };
  return [...offers].sort((a, b) => {
    const rank = valueRank(a) - valueRank(b);
    return rank || (a.price ?? 0) - (b.price ?? 0);
  })[0];
}

const accessOptions: { id: AccessFilter; label: string }[] = [
  { id: "all", label: "All options" },
  { id: "included", label: "Included" },
  { id: "free", label: "Free with ads" },
  { id: "rent", label: "Rent" },
  { id: "buy", label: "Buy" },
];

const defaultServices = ["Netflix", "Max", "Disney+", "Prime Video"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | MediaType>("all");
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"discover" | "watchlist">("discover");
  const [savedServices, setSavedServices] = useState<string[]>(defaultServices);
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [savedLiveTitles, setSavedLiveTitles] = useState<Title[]>([]);
  const [liveResults, setLiveResults] = useState<Title[]>([]);
  const [liveStatus, setLiveStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [liveError, setLiveError] = useState("");
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const searchController = useRef<AbortController | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedServices = window.localStorage.getItem("streamscout.services");
        const storedWatchlist = window.localStorage.getItem("streamscout.watchlist");
        const storedLiveTitles = window.localStorage.getItem("streamscout.savedTitles");
        if (storedServices) setSavedServices(JSON.parse(storedServices));
        if (storedWatchlist) setWatchlist(JSON.parse(storedWatchlist));
        if (storedLiveTitles) setSavedLiveTitles(JSON.parse(storedLiveTitles));
      } catch {
        // Keep safe defaults when local preferences are unavailable.
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("streamscout.services", JSON.stringify(savedServices));
    window.localStorage.setItem("streamscout.watchlist", JSON.stringify(watchlist));
    window.localStorage.setItem("streamscout.savedTitles", JSON.stringify(savedLiveTitles));
  }, [hydrated, savedLiveTitles, savedServices, watchlist]);

  useEffect(() => {
    const modalOpen = serviceModalOpen || Boolean(selectedTitle);
    if (!modalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setServiceModalOpen(false);
        setSelectedTitle(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [serviceModalOpen, selectedTitle]);

  useEffect(() => () => searchController.current?.abort(), []);

  const sourceTitles = useMemo(() => {
    if (activeView === "watchlist") {
      return [...new Map([...catalog, ...savedLiveTitles].map((title) => [title.id, title])).values()];
    }
    if (submittedQuery) return liveResults;
    return catalog;
  }, [activeView, liveResults, savedLiveTitles, submittedQuery]);

  const filteredTitles = useMemo(() => {
    const normalized = submittedQuery.trim().toLowerCase();
    return sourceTitles
      .filter((title) => {
        if (activeView === "watchlist" && !watchlist.includes(title.id)) return false;
        if (mediaFilter !== "all" && title.mediaType !== mediaFilter) return false;
        if (accessFilter !== "all" && !title.offers.some((offer) => offer.type === accessFilter)) return false;
        if (providerFilter && !title.offers.some((offer) => offer.provider === providerFilter)) return false;
        if (!normalized || title.live) return true;
        const haystack = `${title.title} ${title.year} ${title.genres.join(" ")} ${title.mediaType}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .sort((a, b) => {
        const aOffer = bestOffer(a.offers, savedServices);
        const bOffer = bestOffer(b.offers, savedServices);
        const accessDifference = offerOrder[aOffer.type] - offerOrder[bOffer.type];
        return accessDifference || b.score - a.score;
      });
  }, [accessFilter, activeView, mediaFilter, providerFilter, savedServices, sourceTitles, submittedQuery, watchlist]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const scrollToResults = () => {
    window.setTimeout(() => document.getElementById("discover")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const runLiveSearch = async (value: string) => {
    const trimmed = value.trim();
    searchController.current?.abort();
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setActiveView("discover");
    setProviderFilter(null);
    setLiveResults([]);
    setLiveError("");
    scrollToResults();

    if (trimmed.length < 2) {
      setLiveStatus("error");
      setLiveError("Enter at least two characters to search live availability.");
      return;
    }

    const controller = new AbortController();
    searchController.current = controller;
    setLiveStatus("loading");

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const data = await response.json() as LiveSearchResponse;
      if (!response.ok) throw new Error(data.error || "Live availability is temporarily unavailable.");
      setLiveResults(data.titles ?? []);
      setLiveStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setLiveStatus("error");
      setLiveError(error instanceof Error ? error.message : "Live availability is temporarily unavailable.");
    } finally {
      if (searchController.current === controller) searchController.current = null;
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runLiveSearch(query);
  };

  const chooseSuggestion = (title: string) => {
    void runLiveSearch(title);
  };

  const toggleWatchlist = (title: Title) => {
    const saved = watchlist.includes(title.id);
    setWatchlist((current) => saved ? current.filter((id) => id !== title.id) : [...current, title.id]);
    if (title.live) {
      setSavedLiveTitles((current) => saved
        ? current.filter((item) => item.id !== title.id)
        : [...current.filter((item) => item.id !== title.id), title]);
    }
    showToast(saved ? `${title.title} removed from watchlist` : `${title.title} saved to watchlist`);
  };

  const toggleService = (service: string) => {
    setSavedServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);
  };

  const clearFilters = () => {
    searchController.current?.abort();
    setQuery("");
    setSubmittedQuery("");
    setLiveResults([]);
    setLiveStatus("idle");
    setLiveError("");
    setMediaFilter("all");
    setAccessFilter("all");
    setProviderFilter(null);
    setActiveView("discover");
  };

  const openView = (view: "discover" | "watchlist") => {
    searchController.current?.abort();
    setActiveView(view);
    setQuery("");
    setSubmittedQuery("");
    setLiveResults([]);
    setLiveStatus("idle");
    setLiveError("");
    scrollToResults();
  };

  const resultHeading = activeView === "watchlist"
    ? "Your watchlist"
    : liveStatus === "loading"
      ? "Searching across services…"
    : submittedQuery
      ? `Live results for “${submittedQuery}”`
      : "Worth watching right now";

  const resultKicker = activeView === "watchlist"
    ? `${watchlist.length} saved`
    : submittedQuery
      ? "Live U.S. availability"
      : "Curated for tonight";

  return (
    <main>
      <header className="siteHeader">
        <button className="brand brandButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="StreamScout home">
          <span className="brandMark" aria-hidden="true"><span /></span>
          <span>StreamScout</span>
        </button>
        <nav className="desktopNav" aria-label="Primary navigation">
          <button className={activeView === "discover" ? "active" : ""} type="button" onClick={() => openView("discover")}>Discover</button>
          <button className={activeView === "watchlist" ? "active" : ""} type="button" onClick={() => openView("watchlist")}>Watchlist <span className="navCount">{watchlist.length}</span></button>
          <button type="button" onClick={() => setServiceModalOpen(true)}>My services</button>
        </nav>
        <button className="profileButton" type="button" onClick={() => setServiceModalOpen(true)} aria-label="Open profile and services">SA</button>
      </header>

      <section className="hero" id="top">
        <div className="heroBackdrop" aria-hidden="true" />
        <div className="heroGlow" aria-hidden="true" />
        <div className="heroContent">
          <p className="eyebrow"><span /> One search. Every screen.</p>
          <h1>Find the story.<br /><em>Skip the search.</em></h1>
          <p className="heroCopy">
            See where any movie or show is streaming, what is already included,
            and the cheapest way to watch.
          </p>
          <form className="searchShell" role="search" onSubmit={submitSearch}>
            <SearchIcon />
            <label className="srOnly" htmlFor="title-search">Search for a movie or TV show</label>
            <input
              id="title-search"
              data-testid="title-search"
              type="search"
              placeholder="Search movies and shows"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            <button type="submit" disabled={liveStatus === "loading"}>{liveStatus === "loading" ? "Searching" : "Search"} <ArrowIcon /></button>
          </form>
          <div className="searchHints" aria-label="Popular searches">
            <span>Try</span>
            {["Dune: Part Two", "Shōgun", "The Bear"].map((title) => (
              <button type="button" key={title} onClick={() => chooseSuggestion(title)}>{title}</button>
            ))}
          </div>
        </div>
        <button className="availabilityPreview" type="button" onClick={() => document.getElementById("title-search")?.focus()} aria-label="Search live United States streaming availability">
          <span className="availabilityLabel"><span className="liveDot" /> Live availability</span>
          <span className="availabilityTitle">
            <strong>Watchmode connected</strong>
            <small>U.S. streaming sources</small>
          </span>
          <span className="includedPill livePill">Live</span>
        </button>
      </section>

      <section className="serviceStrip" id="services" aria-labelledby="services-title">
        <div>
          <p className="sectionKicker">Your services</p>
          <h2 id="services-title">Search what you already pay for first.</h2>
        </div>
        <div className="serviceList">
          {providers.filter((service) => savedServices.includes(service.name)).slice(0, 5).map((service) => (
            <button
              className={`serviceChip ${providerFilter === service.name ? "selected" : ""}`}
              type="button"
              aria-pressed={providerFilter === service.name}
              onClick={() => {
                setProviderFilter((current) => current === service.name ? null : service.name);
                setActiveView("discover");
                scrollToResults();
              }}
              key={service.name}
            >
              <ProviderMark provider={service} />
              {service.name}
              <span className="check" aria-hidden="true"><CheckIcon /></span>
            </button>
          ))}
          <button className="editServices" type="button" onClick={() => setServiceModalOpen(true)}><SlidersIcon /> Edit services</button>
        </div>
      </section>

      <section className="discoverSection" id="discover" aria-labelledby="discover-title">
        <div className="sectionHeading">
          <div>
            <p className={`sectionKicker ${submittedQuery ? "liveKicker" : ""}`}>{resultKicker}</p>
            <h2 id="discover-title">{resultHeading}</h2>
          </div>
          {(submittedQuery || providerFilter || accessFilter !== "all" || mediaFilter !== "all" || activeView === "watchlist") && (
            <button className="clearButton" type="button" onClick={clearFilters}>Clear all</button>
          )}
        </div>

        <div className="filterBar" aria-label="Filter titles">
          <div className="mediaFilters" aria-label="Media type">
            {(["all", "movie", "show"] as const).map((type) => (
              <button key={type} type="button" className={mediaFilter === type ? "active" : ""} aria-pressed={mediaFilter === type} onClick={() => setMediaFilter(type)}>
                {type === "all" ? "All titles" : type === "movie" ? "Movies" : "TV shows"}
              </button>
            ))}
          </div>
          <div className="accessFilters" aria-label="Availability type">
            {accessOptions.map((option) => (
              <button key={option.id} type="button" className={accessFilter === option.id ? `active ${option.id}` : ""} aria-pressed={accessFilter === option.id} onClick={() => setAccessFilter(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {providerFilter && (
          <div className="activeFilter" role="status">
            Showing titles on <strong>{providerFilter}</strong>
            <button type="button" onClick={() => setProviderFilter(null)} aria-label={`Remove ${providerFilter} filter`}><CloseIcon /></button>
          </div>
        )}

        {submittedQuery && (
          <a className="liveAttribution" href="https://api.watchmode.com/" target="_blank" rel="noreferrer">
            <span className="liveDot" /> Availability data by Watchmode
          </a>
        )}

        <p className="resultCount" aria-live="polite">
          {liveStatus === "loading" ? "Searching live sources…" : `${filteredTitles.length} ${filteredTitles.length === 1 ? "title" : "titles"}`}
        </p>

        {liveStatus === "error" && <div className="errorBanner" role="alert">{liveError}</div>}

        {liveStatus === "loading" ? (
          <div className="skeletonGrid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <span className="skeletonCard" key={index}><span /><span /><span /></span>)}
          </div>
        ) : liveStatus === "error" ? (
          <div className="emptyState errorState">
            <span className="emptyMark" aria-hidden="true"><SearchIcon /></span>
            <h3>Live search could not finish</h3>
            <p>Check the title and try again in a moment.</p>
            <button type="button" onClick={() => void runLiveSearch(query)}>Try again</button>
          </div>
        ) : filteredTitles.length > 0 ? (
          <div className="titleGrid">
            {filteredTitles.map((item) => {
              const offer = bestOffer(item.offers, savedServices);
              const provider = getProvider(offer.provider);
              const saved = watchlist.includes(item.id);
              return (
                <article className="titleCard" key={item.id}>
                  <div className={`poster ${item.art}`}>
                    <span className="score">{item.live ? (item.score ? `${item.score}%` : "New") : `${item.score}% match`}</span>
                    <button
                      className={`saveButton ${saved ? "saved" : ""}`}
                      data-testid={`save-${item.id}`}
                      type="button"
                      aria-pressed={saved}
                      aria-label={`${saved ? "Remove" : "Save"} ${item.title} ${saved ? "from" : "to"} watchlist`}
                      onClick={() => toggleWatchlist(item)}
                    ><BookmarkIcon filled={saved} /></button>
                    <button className="posterButton" type="button" onClick={() => setSelectedTitle(item)} aria-label={`See all watch options for ${item.title}`} />
                    <div className="posterShade" aria-hidden="true" />
                    <div className="posterCopy">
                      <p>{item.year} · {item.mediaType === "movie" ? "Film" : "Series"} · {item.runtime}</p>
                      <h3>{item.title}</h3>
                    </div>
                  </div>
                  <button className="watchRow" type="button" onClick={() => setSelectedTitle(item)} aria-label={`Compare watch options for ${item.title}`}>
                    <ProviderMark provider={provider} variant="badge" />
                    <span className="watchCopy"><small>Best on {offer.provider}</small><strong className={`offerText ${offer.type}`}>{offerLabel(offer)}</strong></span>
                    <ArrowIcon />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="emptyState">
            <span className="emptyMark" aria-hidden="true"><SearchIcon /></span>
            <h3>{activeView === "watchlist" ? "Your watchlist is ready for its first title" : submittedQuery ? "No U.S. streaming options found" : "No titles match those filters"}</h3>
            <p>{activeView === "watchlist" ? "Save something from Discover and it will stay here on this device." : submittedQuery ? "Try a more specific title, or search another movie or show." : "Try another title or broaden your availability choices."}</p>
            <button type="button" onClick={clearFilters}>{activeView === "watchlist" ? "Explore titles" : "Clear filters"}</button>
          </div>
        )}
      </section>

      <section className="decisionSection" aria-labelledby="decision-title">
        <div>
          <p className="sectionKicker">The answer, not another list</p>
          <h2 id="decision-title">Your cheapest option rises to the top.</h2>
        </div>
        <div className="decisionSteps">
          <article><span>01</span><h3>Check your services</h3><p>Included options are prioritized before anything that costs more.</p></article>
          <article><span>02</span><h3>Compare every price</h3><p>Free with ads, rental, and purchase choices use one clear language.</p></article>
          <article><span>03</span><h3>Choose and watch</h3><p>See the best value now and every alternate option in one place.</p></article>
        </div>
      </section>

      <footer>
        <button className="brand brandButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span className="brandMark" aria-hidden="true"><span /></span><span>StreamScout</span></button>
        <p>Find where to watch, without the endless browsing.</p>
        <span className="footerMeta"><a href="https://api.watchmode.com/" target="_blank" rel="noreferrer">Availability data by Watchmode</a><span>·</span><span>United States</span></span>
      </footer>

      <nav className="mobileNav" aria-label="Mobile navigation">
        <button type="button" className={activeView === "discover" ? "active" : ""} onClick={() => openView("discover")}><SearchIcon /><span>Discover</span></button>
        <button type="button" className={activeView === "watchlist" ? "active" : ""} onClick={() => openView("watchlist")}><BookmarkIcon filled={activeView === "watchlist"} /><span>Watchlist</span>{watchlist.length > 0 && <small>{watchlist.length}</small>}</button>
        <button type="button" onClick={() => setServiceModalOpen(true)}><SlidersIcon /><span>Services</span></button>
      </nav>

      {serviceModalOpen && (
        <div className="modalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setServiceModalOpen(false)}>
          <section className="modalPanel serviceModal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
            <div className="modalHeader">
              <div><p className="sectionKicker">Personalize results</p><h2 id="service-modal-title">Which services do you have?</h2></div>
              <button className="closeButton" type="button" onClick={() => setServiceModalOpen(false)} aria-label="Close services"><CloseIcon /></button>
            </div>
            <p className="modalIntro">We will surface included options from these services first. Your choices stay on this device.</p>
            <div className="providerPicker">
              {providers.map((service) => {
                const selected = savedServices.includes(service.name);
                return (
                  <button key={service.name} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleService(service.name)}>
                    <ProviderMark provider={service} />
                    <span>{service.name}</span>
                    <span className="providerCheck" aria-hidden="true">{selected && <CheckIcon />}</span>
                  </button>
                );
              })}
            </div>
            <div className="modalFooter"><span>{savedServices.length} selected</span><button type="button" onClick={() => setServiceModalOpen(false)}>Save services</button></div>
          </section>
        </div>
      )}

      {selectedTitle && (() => {
        const offer = bestOffer(selectedTitle.offers, savedServices);
        const saved = watchlist.includes(selectedTitle.id);
        const orderedOffers = [offer, ...selectedTitle.offers.filter((item) => item !== offer).sort((a, b) => offerOrder[a.type] - offerOrder[b.type])];
        return (
          <div className="modalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTitle(null)}>
            <section className="modalPanel titleModal" role="dialog" aria-modal="true" aria-labelledby="title-modal-title">
              <div className={`detailArt ${selectedTitle.art}`}>
                <div className="detailShade" />
                <button className="closeButton floating" type="button" onClick={() => setSelectedTitle(null)} aria-label="Close title details"><CloseIcon /></button>
                <div className="detailHeroCopy">
                  <p>{selectedTitle.live ? (selectedTitle.score ? `${selectedTitle.score}% score` : "Live availability") : `${selectedTitle.score}% match`} · {selectedTitle.year} · {selectedTitle.rating}</p>
                  <h2 id="title-modal-title">{selectedTitle.title}</h2>
                  <span>{selectedTitle.genres.join(" · ")} · {selectedTitle.runtime}</span>
                </div>
              </div>
              <div className="detailBody">
                <p className="synopsis">{selectedTitle.synopsis}</p>
                <div className={`bestBanner ${offer.type}`}>
                  <span>Best option for you</span>
                  <strong>{offerLabel(offer)} on {offer.provider}</strong>
                </div>
                <div className="offerHeading"><h3>Every way to watch</h3><span>United States</span></div>
                <div className="offerList">
                  {orderedOffers.map((item, index) => {
                    const provider = getProvider(item.provider);
                    const contents = (
                      <>
                        <ProviderMark provider={provider} />
                        <span className="offerProvider"><strong>{item.provider}</strong><small>{item.quality} · {index === 0 ? "Best value" : "Alternate option"}</small></span>
                        <span className="offerAction">
                          <span className={`pricePill ${item.type}`}>{offerLabel(item)}</span>
                          {item.url && <span className="openProvider">Open <ArrowIcon /></span>}
                        </span>
                      </>
                    );
                    return item.url ? (
                      <a className="offerRow" href={item.url} target="_blank" rel="noreferrer" key={`${item.provider}-${item.type}-${item.price ?? ""}-${index}`}>
                        {contents}
                      </a>
                    ) : (
                      <div className="offerRow" key={`${item.provider}-${item.type}-${item.price ?? ""}-${index}`}>
                        {contents}
                      </div>
                    );
                  })}
                </div>
                {selectedTitle.live && <a className="modalAttribution" href="https://api.watchmode.com/" target="_blank" rel="noreferrer"><span className="liveDot" /> Availability data by Watchmode</a>}
                <button className={`detailSave ${saved ? "saved" : ""}`} type="button" aria-pressed={saved} onClick={() => toggleWatchlist(selectedTitle)}><BookmarkIcon filled={saved} /> {saved ? "Saved to watchlist" : "Save to watchlist"}</button>
              </div>
            </section>
          </div>
        );
      })()}

      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite"><CheckIcon /> {toast}</div>
    </main>
  );
}
