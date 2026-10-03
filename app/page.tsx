"use client";

import ModalDialog from "@/components/ModalDialog";

import ProviderLogo, { providerBrand, providerHost } from "@/components/ProviderLogo";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import NotificationBell from "@/components/NotificationBell";
import SocialHub from "@/components/SocialHub";
import MemberHome from "@/components/MemberHome";
import PlatformHighlights from "@/components/PlatformHighlights";
import SearchRouteSync from "@/components/SearchRouteSync";
import { HeaderSearchButton } from "@/components/GlobalSearch";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { bestOffer, compareOffers, offerPriority } from "@/lib/offer-priority";
import { regions } from "@/lib/regions";
import { titlePath } from "@/lib/title-routes";
import { rememberTitleNavigation } from "@/lib/title-navigation";

type OfferType = "included" | "free" | "rent" | "buy";
type MediaType = "movie" | "show";
type AccessFilter = "all" | OfferType;

type Offer = {
  provider: string;
  type: OfferType;
  price?: number;
  currency?: string;
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
  backdropUrl?: string;
  posterUrl?: string;
  offers: Offer[];
  live?: boolean;
  networkNames?: string[];
  popularityPercentile?: number;
  reviewSummary?: string;
  similarTitleIds?: number[];
  trailerThumbnailUrl?: string;
  trailerUrl?: string;
  watchmodeId?: number;
  willYouLikeThis?: string;
  region?: string;
  releaseDate?: string;
  tmdbId?: number;
};

type LiveSearchResponse = {
  error?: string;
  titles?: Title[];
};

type AutocompleteResult = {
  id: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  imageUrl?: string;
};

type AutocompleteResponse = {
  results?: AutocompleteResult[];
};

type Credit = {
  personId: number;
  name: string;
  role: string;
  type: "cast" | "crew";
  photoUrl?: string;
};

type CreditsResponse = {
  credits?: Credit[];
};

type SimilarTitle = {
  watchmodeId: number;
  title: string;
  year: number;
  mediaType: MediaType;
  genres: string[];
  synopsis: string;
  score: number;
  posterUrl?: string;
  backdropUrl?: string;
};

type SimilarTitlesResponse = {
  titles?: SimilarTitle[];
};

type ProviderStyle = {
  id?: number;
  name: string;
  mark: string;
  className: string;
  logo?: string;
  type?: "subscription" | "free" | "tv";
};

type ProviderDirectoryResponse = {
  providers?: Array<{
    id: number;
    name: string;
    logo?: string;
    type: "subscription" | "free" | "tv";
  }>;
};

type SeasonProviderCoverage = {
  provider: string;
  type: OfferType;
  episodeCount: number;
};

type SeasonAvailability = {
  seasonNumber: number;
  episodeCount: number;
  availableEpisodeCount: number;
  providers: SeasonProviderCoverage[];
};

type SeasonsResponse = {
  seasons?: SeasonAvailability[];
};

type DiscoveryTitle = {
  id: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  synopsis: string;
  score?: number;
  genres: string[];
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
  reason?: string;
};

type DiscoverySection = {
  id: "personalized" | "trending" | "upcoming" | "airing" | "included";
  kicker: string;
  title: string;
  titles: DiscoveryTitle[];
};

type DiscoveryResponse = {
  error?: string;
  sections?: DiscoverySection[];
};

type TasteSignal = "watched" | "loved" | "not_for_me";
type TasteEntry = { signal: TasteSignal; id: number; title: string; year: number; mediaType: MediaType; genres: string[]; tmdbId?: number; watchmodeId?: number; updatedAt?: string };
type PersonalizedResponse = { section?: DiscoverySection | null; error?: string };

type CountryOption = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
};

type CountriesResponse = {
  countries?: CountryOption[];
};

type SearchMode = "screen" | "music";
type MusicVideoFilter = "all" | "official" | "live" | "lyrics" | "performance";

type MusicVideo = {
  id: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt?: string;
  thumbnail?: string;
  duration: string;
  viewCount: number;
  category: Exclude<MusicVideoFilter, "all"> | "other";
  official: boolean;
  url: string;
  embedUrl: string;
};

type MusicVideoResponse = {
  error?: string;
  videos?: MusicVideo[];
};

type ReleaseAlert = {
  titleId: number;
  title: string;
  kind: "upcoming_episode" | "recent_episode" | "movie_release" | "recent_release";
  date: string;
  label: string;
  detail: string;
};

type ReleaseAlertsResponse = {
  error?: string;
  alerts?: ReleaseAlert[];
  checked?: number;
};

type PushStatus = "checking" | "unsupported" | "default" | "denied" | "install-required" | "subscribed" | "error";
type AvailabilityTracking = { count: number; lastChecked?: number };

const SearchIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const DiscoverIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="m14.8 9.2-1.7 3.9-3.9 1.7 1.7-3.9 3.9-1.7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
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

const BellIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="M6.5 9.7a5.5 5.5 0 0 1 11 0c0 5 2.2 5.8 2.2 5.8H4.3s2.2-.8 2.2-5.8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.7 18.2a2.5 2.5 0 0 0 4.6 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const featuredProviders: ProviderStyle[] = [
  { name: "Netflix", mark: "N", className: "netflix", logo: "/brands/netflix.svg" },
  { name: "HBO Max", mark: "HBO", className: "max", logo: "/brands/max.svg" },
  { name: "Disney+", mark: "D+", className: "disney", logo: "/brands/disney-plus.svg" },
  { name: "Prime Video", mark: "P", className: "prime", logo: "/brands/prime-video.svg" },
  { name: "Apple TV+", mark: "", className: "apple", logo: "/brands/apple-tv-plus.svg" },
  { name: "Hulu", mark: "h", className: "hulu", logo: "/brands/hulu.svg" },
  { name: "Peacock", mark: "p", className: "peacock", logo: "/brands/peacock.svg" },
  { name: "Tubi", mark: "t", className: "tubi", logo: "/brands/tubi.svg" },
  { name: "Pluto TV", mark: "p", className: "pluto", logo: "/brands/pluto-tv.svg" },
  { name: "Roku Channel", mark: "R", className: "roku", logo: "/brands/roku-channel.svg" },
  { name: "Paramount+", mark: "P+", className: "paramount", logo: "/brands/paramount-plus.svg" },
  { name: "Discovery+", mark: "d+", className: "discovery", logo: "/brands/discovery-plus.svg" },
  { name: "Starz", mark: "S", className: "starz", logo: "/brands/starz.svg" },
  { name: "Crunchyroll", mark: "C", className: "crunchyroll", logo: "/brands/crunchyroll.svg" },
  { name: "Rakuten Viki", mark: "VIKI", className: "viki", logo: "/brands/rakuten-viki.svg" },
  { name: "YouTube TV", mark: "YT", className: "youtubeTv", logo: "/brands/youtube-tv.svg" },
  { name: "Google TV", mark: "G", className: "google", logo: "/brands/google-tv.svg" },
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
      { provider: "HBO Max", type: "included", quality: "4K" },
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


function getProvider(name: string, directory: ProviderStyle[] = featuredProviders) {
  if (name === "Apple TV") {
    return { name, mark: "", className: "apple", logo: "/brands/apple-tv-plus.svg" };
  }
  return directory.find((provider) => provider.name === name) ?? {
    name,
    mark: name.slice(0, 2).toUpperCase(),
    className: "providerGeneric",
  };
}

function artworkStyle(title: Title) {
  const artworkUrl = title.backdropUrl ?? title.posterUrl;
  return artworkUrl
    ? { backgroundImage: `url(${JSON.stringify(artworkUrl)})` }
    : undefined;
}

function ProviderMark({ provider, variant = "service" }: {
  provider: ProviderStyle;
  variant?: "service" | "badge";
}) {
  return <ProviderLogo name={provider.name} source={provider.logo} variant={variant} />;
}

function offerLabel(offer: Offer) {
  if (offer.type === "included") return "Included";
  if (offer.type === "free") return "Free with ads";
  const price = typeof offer.price === "number"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: offer.currency ?? "USD" }).format(offer.price)
    : "";
  return `${offer.type === "rent" ? "Rent" : "Buy"}${price ? ` ${price}` : ""}`;
}

function seasonOfferLabel(type: OfferType) {
  if (type === "included") return "Included";
  if (type === "free") return "Free with ads";
  return type === "rent" ? "Rent" : "Buy";
}

function formatViewCount(value: number) {
  if (!value) return "New";
  return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)} views`;
}

function formatAlertDate(date: string, style: "short" | "long" = "short") {
  const value = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", style === "short"
    ? { month: "short", day: "numeric", timeZone: "UTC" }
    : { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}

const accessOptions: { id: AccessFilter; label: string }[] = [
  { id: "all", label: "All options" },
  { id: "included", label: "Included" },
  { id: "free", label: "Free with ads" },
  { id: "rent", label: "Rent" },
  { id: "buy", label: "Buy" },
];

const defaultServices = ["Netflix", "HBO Max", "Disney+", "Prime Video"];
const onboardingGenreOptions = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "Horror", "Mystery", "Reality", "Romance", "Science fiction", "Thriller"];

function normalizeSavedServices(value: unknown): string[] {
  if (!Array.isArray(value)) return defaultServices;
  return [...new Set(value
    .filter((service): service is string => typeof service === "string")
    .map((service) => service === "Max" ? "HBO Max" : service))];
}

function readTasteSignals() {
  try {
    const value = JSON.parse(window.localStorage.getItem("streamfind.tasteSignals") ?? "{}") as Record<string, TasteEntry>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {} as Record<string, TasteEntry>;
  }
}

const storageKeys = {
  services: "streamfind.services",
  watchlist: "streamfind.watchlist",
  savedTitles: "streamfind.savedTitles",
  country: "streamfind.country",
  releaseAlerts: "streamfind.releaseAlerts",
  tasteSignals: "streamfind.tasteSignals",
  preferredGenres: "streamfind.preferredGenres",
};

const legacyStorageKeys = {
  services: "streamscout.services",
  watchlist: "streamscout.watchlist",
  savedTitles: "streamscout.savedTitles",
};

export default function Home() {
  const router = useRouter();
  const [searchMode, setSearchMode] = useState<SearchMode>("screen");
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
  const [serviceSearch, setServiceSearch] = useState("");
  const [providerDirectory, setProviderDirectory] = useState<ProviderStyle[]>(featuredProviders);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [socialOpen, setSocialOpen] = useState(false);
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteResult[]>([]);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [creditsByTitle, setCreditsByTitle] = useState<Record<number, Credit[]>>({});
  const [creditsLoadingId, setCreditsLoadingId] = useState<number | null>(null);
  const [expandedCreditTitles, setExpandedCreditTitles] = useState<Set<number>>(() => new Set());
  const [similarByTitle, setSimilarByTitle] = useState<Record<number, SimilarTitle[]>>({});
  const [similarLoadingId, setSimilarLoadingId] = useState<number | null>(null);
  const [seasonsByTitle, setSeasonsByTitle] = useState<Record<number, SeasonAvailability[]>>({});
  const [seasonsLoadingId, setSeasonsLoadingId] = useState<number | null>(null);
  const [selectedSeasonByTitle, setSelectedSeasonByTitle] = useState<Record<number, number>>({});
  const [country, setCountry] = useState("US");
  const [countries, setCountries] = useState<CountryOption[]>(regions);
  const [discoverySections, setDiscoverySections] = useState<DiscoverySection[]>([]);
  const [discoveryStatus, setDiscoveryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [discoveryError, setDiscoveryError] = useState("");
  const [tasteSignals, setTasteSignals] = useState<Record<string, TasteEntry>>({});
  const [personalizedSection, setPersonalizedSection] = useState<DiscoverySection | null>(null);
  const [personalizedLoading, setPersonalizedLoading] = useState(false);
  const [musicVideos, setMusicVideos] = useState<MusicVideo[]>([]);
  const [musicStatus, setMusicStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [musicError, setMusicError] = useState("");
  const [musicFilter, setMusicFilter] = useState<MusicVideoFilter>("all");
  const [selectedMusicVideo, setSelectedMusicVideo] = useState<MusicVideo | null>(null);
  const [releaseAlertsEnabled, setReleaseAlertsEnabled] = useState(true);
  const [releaseAlerts, setReleaseAlerts] = useState<ReleaseAlert[]>([]);
  const [releaseAlertsStatus, setReleaseAlertsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [releaseAlertsError, setReleaseAlertsError] = useState("");
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [availabilityTracking, setAvailabilityTracking] = useState<AvailabilityTracking | null>(null);
  const [preferredGenres, setPreferredGenres] = useState<string[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [settingsLoadedUserId, setSettingsLoadedUserId] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const autocompleteController = useRef<AbortController | null>(null);
  const autocompleteCache = useRef(new Map<string, AutocompleteResult[]>());
  const creditsCache = useRef(new Map<number, Credit[]>());
  const similarCache = useRef(new Map<number, SimilarTitle[]>());
  const seasonsCache = useRef(new Map<string, SeasonAvailability[]>());

  useEffect(() => onAuthStateChanged(firebaseAuth, setAccountUser), []);

  useEffect(() => {
    if (!accountUser) return;
    const destination = new URLSearchParams(window.location.search).get("next");
    if (!destination || !/^\/together(?:\/[a-zA-Z0-9]{16,32})?$/.test(destination)) return;
    // A newly invited member may still be creating a username after sign-in.
    // Keep watching until that profile exists so the invitation survives onboarding.
    return onSnapshot(doc(firestore, "users", accountUser.uid), (profile) => {
      if (profile.exists()) router.replace(destination);
    }, () => undefined);
  }, [accountUser, router]);

  useEffect(() => {
    if (!hydrated || !accountUser || settingsLoadedUserId !== accountUser.uid) return;
    const selectedCountry = countries.find((item) => item.code === country) ?? regions.find((item) => item.code === country) ?? regions[0];
    void setDoc(doc(firestore, "users", accountUser.uid, "settings", "app"), {
      region: selectedCountry.code,
      currency: selectedCountry.currency,
      services: savedServices,
      preferredGenres,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }, [accountUser, countries, country, hydrated, preferredGenres, savedServices, settingsLoadedUserId]);

  useEffect(() => {
    if (!hydrated || !accountUser) return;
    let cancelled = false;
    void getDoc(doc(firestore, "users", accountUser.uid, "settings", "app"))
      .then((snapshot) => {
        if (cancelled) return;
        const settings = snapshot.data();
        const cloudGenres = Array.isArray(settings?.preferredGenres) ? settings.preferredGenres.filter((genre): genre is string => typeof genre === "string") : [];
        const cloudServices = Array.isArray(settings?.services) ? normalizeSavedServices(settings.services) : [];
        if (cloudGenres.length) setPreferredGenres(cloudGenres);
        if (cloudServices.length) setSavedServices(cloudServices);
        if (typeof settings?.region === "string" && regions.some((region) => region.code === settings.region)) setCountry(settings.region);
        if (settings?.onboardingComplete !== true && window.sessionStorage.getItem("streamfind.onboardingDeferred") !== accountUser.uid) {
          setOnboardingStep(0);
          setOnboardingOpen(true);
        }
        setSettingsLoadedUserId(accountUser.uid);
      })
      .catch(() => { if (!cancelled) setSettingsLoadedUserId(accountUser.uid); });
    return () => { cancelled = true; };
  }, [accountUser, hydrated]);

  useEffect(() => {
    if (!accountUser) {
      const frame = window.requestAnimationFrame(() => setAvailabilityTracking(null));
      return () => window.cancelAnimationFrame(frame);
    }
    if (!hydrated || activeView !== "watchlist") return;
    let cancelled = false;
    void getDocs(collection(firestore, "users", accountUser.uid, "availabilitySnapshots"))
      .then((snapshot) => {
        if (cancelled) return;
        const checked = snapshot.docs
          .map((entry) => entry.data().checkedAt as { toMillis?: () => number } | undefined)
          .map((timestamp) => timestamp?.toMillis?.() ?? 0)
          .filter(Boolean);
        setAvailabilityTracking({ count: snapshot.size, ...(checked.length ? { lastChecked: Math.max(...checked) } : {}) });
      })
      .catch(() => { if (!cancelled) setAvailabilityTracking({ count: 0 }); });
    return () => { cancelled = true; };
  }, [accountUser, activeView, hydrated]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("view") === "watchlist") setActiveView("watchlist");
      if (params.get("panel") === "services") setServiceModalOpen(true);
      if (params.get("panel") === "friends") setSocialOpen(true);
      if (params.get("search") === "1") {
        window.setTimeout(() => {
          searchInputRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
          searchInputRef.current?.focus();
        }, 100);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      const frame = window.requestAnimationFrame(() => setPushStatus("unsupported"));
      return () => window.cancelAnimationFrame(frame);
    }
    if (Notification.permission === "denied") {
      const frame = window.requestAnimationFrame(() => setPushStatus("denied"));
      return () => window.cancelAnimationFrame(frame);
    }
    let cancelled = false;
    void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setPushStatus(subscription ? "subscribed" : "default");
      })
      .catch(() => {
        if (!cancelled) setPushStatus("error");
      });
    return () => { cancelled = true; };
  }, [accountUser]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/countries")
      .then(async (response) => response.ok ? response.json() as Promise<CountriesResponse> : { countries: regions })
      .then((data) => {
        if (!cancelled && data.countries?.length) setCountries(data.countries);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/discover?region=${country}${accountUser ? `&services=${encodeURIComponent(savedServices.join("|"))}` : ""}`)
      .then(async (response) => {
        const data = await response.json() as DiscoveryResponse;
        if (!response.ok) throw new Error(data.error || "Live discovery is temporarily unavailable.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setDiscoverySections(data.sections ?? []);
        setDiscoveryStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setDiscoveryError(error instanceof Error ? error.message : "Live discovery is temporarily unavailable.");
        setDiscoveryStatus("error");
      });
    return () => { cancelled = true; };
  }, [country, accountUser, savedServices]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/providers?region=${country}`)
      .then(async (response) => response.ok ? response.json() as Promise<ProviderDirectoryResponse> : { providers: [] })
      .then((data) => {
        if (cancelled || !data.providers?.length) return;
        const localByName = new Map(featuredProviders.map((provider) => [provider.name, provider]));
        const directory = data.providers.map((provider) => {
          const local = localByName.get(provider.name);
          return {
            id: provider.id,
            name: provider.name,
            mark: local?.mark ?? provider.name.slice(0, 2).toUpperCase(),
            className: local?.className ?? "providerGeneric",
            logo: provider.logo ?? local?.logo,
            type: provider.type,
          };
        });
        setProviderDirectory(directory);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => { cancelled = true; };
  }, [country]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedServices = window.localStorage.getItem(storageKeys.services)
          ?? window.localStorage.getItem(legacyStorageKeys.services);
        const storedWatchlist = window.localStorage.getItem(storageKeys.watchlist)
          ?? window.localStorage.getItem(legacyStorageKeys.watchlist);
        const storedLiveTitles = window.localStorage.getItem(storageKeys.savedTitles)
          ?? window.localStorage.getItem(legacyStorageKeys.savedTitles);
        const storedCountry = window.localStorage.getItem(storageKeys.country);
        const storedReleaseAlerts = window.localStorage.getItem(storageKeys.releaseAlerts);
        const storedTasteSignals = window.localStorage.getItem(storageKeys.tasteSignals);
        const storedPreferredGenres = window.localStorage.getItem(storageKeys.preferredGenres);
        if (storedServices) setSavedServices(normalizeSavedServices(JSON.parse(storedServices)));
        if (storedWatchlist) setWatchlist(JSON.parse(storedWatchlist));
        if (storedLiveTitles) setSavedLiveTitles(JSON.parse(storedLiveTitles));
        if (storedCountry && regions.some((region) => region.code === storedCountry)) setCountry(storedCountry);
        if (storedReleaseAlerts !== null) setReleaseAlertsEnabled(storedReleaseAlerts === "true");
        if (storedTasteSignals) setTasteSignals(JSON.parse(storedTasteSignals));
        if (storedPreferredGenres) setPreferredGenres(JSON.parse(storedPreferredGenres));
      } catch {
        // Keep safe defaults when local preferences are unavailable.
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKeys.services, JSON.stringify(savedServices));
    window.localStorage.setItem(storageKeys.watchlist, JSON.stringify(watchlist));
    window.localStorage.setItem(storageKeys.savedTitles, JSON.stringify(savedLiveTitles));
    window.localStorage.setItem(storageKeys.country, country);
    window.localStorage.setItem(storageKeys.releaseAlerts, String(releaseAlertsEnabled));
    window.localStorage.setItem(storageKeys.preferredGenres, JSON.stringify(preferredGenres));
  }, [country, hydrated, preferredGenres, releaseAlertsEnabled, savedLiveTitles, savedServices, watchlist]);

  useEffect(() => {
    if (!hydrated || !accountUser) return;
    let cancelled = false;
    void (async () => {
      const local = readTasteSignals();
      const snapshot = await getDocs(collection(firestore, "users", accountUser.uid, "tasteSignals"));
      const cloud = Object.fromEntries(snapshot.docs.map((entry) => [entry.id, entry.data() as TasteEntry]));
      const missing = Object.entries(local).filter(([id]) => !cloud[id]);
      if (missing.length) {
        const batch = writeBatch(firestore);
        for (const [id, entry] of missing) batch.set(doc(firestore, "users", accountUser.uid, "tasteSignals", id), { ...entry, updatedAt: serverTimestamp() });
        await batch.commit();
      }
      if (cancelled) return;
      const combined = { ...local, ...cloud };
      setTasteSignals(combined);
      window.localStorage.setItem(storageKeys.tasteSignals, JSON.stringify(combined));
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountUser, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const signals = Object.values(tasteSignals);
    if (!signals.some((entry) => entry.signal === "loved" || entry.signal === "watched") && preferredGenres.length === 0) {
      const frame = window.requestAnimationFrame(() => setPersonalizedSection(null));
      return () => window.cancelAnimationFrame(frame);
    }
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => setPersonalizedLoading(true));
    void fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals, preferredGenres, services: savedServices, region: country }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as PersonalizedResponse;
        if (!response.ok) throw new Error(data.error || "Personalized recommendations could not load.");
        return data;
      })
      .then((data) => setPersonalizedSection(data.section ?? null))
      .catch(() => { if (!controller.signal.aborted) setPersonalizedSection(null); })
      .finally(() => { if (!controller.signal.aborted) setPersonalizedLoading(false); });
    return () => { window.cancelAnimationFrame(frame); controller.abort(); };
  }, [country, hydrated, preferredGenres, savedServices, tasteSignals]);

  useEffect(() => {
    if (!hydrated || !accountUser) return;
    let cancelled = false;
    void (async () => {
      const storedIds = JSON.parse(window.localStorage.getItem(storageKeys.watchlist) ?? "[]") as number[];
      const storedTitles = JSON.parse(window.localStorage.getItem(storageKeys.savedTitles) ?? "[]") as Title[];
      const localTitles = [...catalog, ...storedTitles].filter((title) => storedIds.includes(title.id));
      const cloudSnapshot = await getDocs(collection(firestore, "users", accountUser.uid, "watchlist"));
      const cloudTitles = cloudSnapshot.docs.map((entry) => entry.data() as Title);
      const cloudIds = new Set(cloudTitles.map((title) => title.id));
      const unsyncedTitles = localTitles.filter((title) => !cloudIds.has(title.id));
      if (unsyncedTitles.length) {
        const batch = writeBatch(firestore);
        for (const title of unsyncedTitles) {
          const safeTitle = JSON.parse(JSON.stringify(title)) as Title;
          batch.set(doc(firestore, "users", accountUser.uid, "watchlist", String(title.id)), { ...safeTitle, savedAt: serverTimestamp() });
        }
        await batch.commit();
      }
      if (cancelled) return;
      const combined = [...new Map([...cloudTitles, ...localTitles].map((title) => [title.id, title])).values()];
      setWatchlist(combined.map((title) => title.id));
      setSavedLiveTitles(combined.filter((title) => title.live));
    })().catch(() => {
      setToast("Your cloud watchlist could not be loaded");
      window.setTimeout(() => setToast(""), 2400);
    });
    return () => { cancelled = true; };
  }, [accountUser, hydrated]);

  useEffect(() => {
    if (!hydrated || activeView !== "watchlist" || !releaseAlertsEnabled || watchlist.length === 0) return;
    const trackedTitles = [...new Map([...catalog, ...savedLiveTitles].map((title) => [title.id, title])).values()]
      .filter((title) => watchlist.includes(title.id) && (title.live || title.tmdbId))
      .slice(0, 12);
    if (!trackedTitles.length) return;

    const controller = new AbortController();
    void Promise.resolve().then(() => {
      setReleaseAlertsStatus("loading");
      setReleaseAlertsError("");
    });
    void fetch("/api/watchlist-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: country,
        titles: trackedTitles.map(({ id, title, year, mediaType, tmdbId }) => ({ id, title, year, mediaType, tmdbId })),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as ReleaseAlertsResponse;
        if (!response.ok) throw new Error(data.error || "Release updates could not load.");
        return data;
      })
      .then((data) => {
        const alerts = data.alerts ?? [];
        setReleaseAlerts(alerts);
        setReleaseAlertsStatus("ready");
        if (accountUser) void syncReleaseNotifications(accountUser.uid, alerts, trackedTitles);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setReleaseAlertsStatus("error");
        setReleaseAlertsError(error instanceof Error ? error.message : "Release updates could not load.");
      });
    return () => controller.abort();
  }, [accountUser, activeView, country, hydrated, releaseAlertsEnabled, savedLiveTitles, watchlist]);

  useEffect(() => {
    const modalOpen = onboardingOpen || serviceModalOpen || socialOpen || Boolean(selectedTitle) || Boolean(selectedMusicVideo);
    if (!modalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setServiceModalOpen(false);
        setSocialOpen(false);
        setSelectedTitle(null);
        setSelectedMusicVideo(null);
        setOnboardingOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onboardingOpen, selectedMusicVideo, serviceModalOpen, socialOpen, selectedTitle]);

  useEffect(() => {
    const normalized = query.trim();

    if (searchMode === "music") {
      autocompleteController.current?.abort();
      return;
    }

    if (normalized.length < 3 || normalized === submittedQuery || liveStatus === "loading") {
      autocompleteController.current?.abort();
      return;
    }

    const cacheKey = normalized.toLowerCase();
    const timer = window.setTimeout(() => {
      const cached = autocompleteCache.current.get(cacheKey);
      if (cached) {
        setAutocompleteResults(cached);
        setAutocompleteOpen(cached.length > 0);
        return;
      }

      autocompleteController.current?.abort();
      const controller = new AbortController();
      autocompleteController.current = controller;

      void fetch(`/api/autocomplete?q=${encodeURIComponent(normalized)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return { results: [] } as AutocompleteResponse;
          return response.json() as Promise<AutocompleteResponse>;
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          const results = data.results ?? [];
          autocompleteCache.current.set(cacheKey, results);
          setAutocompleteResults(results);
          setAutocompleteOpen(results.length > 0);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setAutocompleteResults([]);
            setAutocompleteOpen(false);
          }
        });
    }, autocompleteCache.current.has(cacheKey) ? 0 : 450);

    return () => window.clearTimeout(timer);
  }, [liveStatus, query, searchMode, submittedQuery]);

  useEffect(() => () => {
    searchController.current?.abort();
    autocompleteController.current?.abort();
  }, []);

  const sourceTitles = useMemo(() => {
    if (activeView === "watchlist") {
      return [...new Map([...catalog, ...savedLiveTitles].map((title) => [title.id, title])).values()];
    }
    if (submittedQuery) return liveResults;
    return [];
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
        if (normalized && activeView !== "watchlist") {
          const relevance = (title: string) => {
            const value = title.toLowerCase();
            return value === normalized ? 0 : value.startsWith(normalized) ? 1 : value.includes(normalized) ? 2 : 3;
          };
          const titleDifference = relevance(a.title) - relevance(b.title);
          if (titleDifference) return titleDifference;
        }
        const aOffer = bestOffer(a.offers, savedServices);
        const bOffer = bestOffer(b.offers, savedServices);
        const accessDifference = (aOffer ? offerPriority(aOffer, savedServices) : 9)
          - (bOffer ? offerPriority(bOffer, savedServices) : 9);
        return accessDifference || b.score - a.score || a.title.localeCompare(b.title);
      });
  }, [accessFilter, activeView, mediaFilter, providerFilter, savedServices, sourceTitles, submittedQuery, watchlist]);

  const filteredMusicVideos = useMemo(() => musicVideos.filter((video) => {
    if (musicFilter === "all") return true;
    if (musicFilter === "official") return video.official;
    return video.category === musicFilter;
  }), [musicFilter, musicVideos]);

  const visibleProviders = useMemo(() => {
    const normalized = serviceSearch.trim().toLowerCase();
    if (!normalized) return providerDirectory;
    return providerDirectory.filter((provider) => provider.name.toLowerCase().includes(normalized));
  }, [providerDirectory, serviceSearch]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const toggleDeviceNotifications = async () => {
    if (!accountUser) {
      setSocialOpen(true);
      showToast("Sign in to receive release notifications");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      showToast("This browser does not support notifications");
      return;
    }

    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
    if (isIos && !isStandalone) {
      setPushStatus("install-required");
      showToast("Add Stream Find to your Home Screen first");
      return;
    }

    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      const token = await accountUser.getIdToken();

      if (existing && pushStatus === "subscribed") {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushStatus("default");
        showToast("Device notifications turned off");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "default");
        showToast("Notifications were not enabled");
        return;
      }

      const configResponse = await fetch("/api/push/config");
      const config = await configResponse.json() as { publicKey?: string; error?: string };
      if (!configResponse.ok || !config.publicKey) throw new Error(config.error || "Notifications are not configured.");
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.publicKey),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: subscription.toJSON(), region: country }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Device notifications could not be enabled.");
      setPushStatus("subscribed");
      await registration.showNotification("Stream Find notifications are on", {
        body: "We’ll notify you when saved titles change providers, drop in price, or get release updates.",
        icon: "/favicon.svg",
        tag: "stream-find-notifications-enabled",
      });
    } catch (error) {
      setPushStatus("error");
      showToast(error instanceof Error ? error.message : "Device notifications could not be updated");
    } finally {
      setPushBusy(false);
    }
  };

  const scrollToResults = () => {
    window.setTimeout(() => document.getElementById("discover")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const focusMainSearch = () => {
    const input = searchInputRef.current;
    if (!input) return;
    input.scrollIntoView({ behavior: "auto", block: "center" });
    input.focus();
  };

  const closeAutocomplete = () => {
    autocompleteController.current?.abort();
    setAutocompleteOpen(false);
    setAutocompleteResults([]);
    setAutocompleteIndex(-1);
  };

  const loadTitleExtras = (title: Title) => {
    const watchmodeId = title.watchmodeId;
    if (!title.live || !watchmodeId) return;

    if (!creditsCache.current.has(watchmodeId)) {
      setCreditsLoadingId(watchmodeId);
      void fetch(`/api/cast?id=${watchmodeId}&v=2`)
        .then(async (response) => response.ok ? response.json() as Promise<CreditsResponse> : { credits: [] })
        .then((data) => {
          const credits = data.credits ?? [];
          creditsCache.current.set(watchmodeId, credits);
          setCreditsByTitle((current) => ({ ...current, [watchmodeId]: credits }));
        })
        .catch(() => creditsCache.current.set(watchmodeId, []))
        .finally(() => setCreditsLoadingId((current) => current === watchmodeId ? null : current));
    }

    const similarIds = (title.similarTitleIds ?? []).slice(0, 4);
    if (similarIds.length && !similarCache.current.has(watchmodeId)) {
      setSimilarLoadingId(watchmodeId);
      void fetch(`/api/similar?ids=${similarIds.join(",")}`)
        .then(async (response) => response.ok ? response.json() as Promise<SimilarTitlesResponse> : { titles: [] })
        .then((data) => {
          const titles = data.titles ?? [];
          similarCache.current.set(watchmodeId, titles);
          setSimilarByTitle((current) => ({ ...current, [watchmodeId]: titles }));
        })
        .catch(() => similarCache.current.set(watchmodeId, []))
        .finally(() => setSimilarLoadingId((current) => current === watchmodeId ? null : current));
    }

    const seasonCacheKey = `${watchmodeId}-${country}`;
    if (title.mediaType === "show" && !seasonsCache.current.has(seasonCacheKey)) {
      setSeasonsLoadingId(watchmodeId);
      void fetch(`/api/seasons?id=${watchmodeId}&region=${country}`)
        .then(async (response) => response.ok ? response.json() as Promise<SeasonsResponse> : { seasons: [] })
        .then((data) => {
          const seasons = data.seasons ?? [];
          seasonsCache.current.set(seasonCacheKey, seasons);
          setSeasonsByTitle((current) => ({ ...current, [watchmodeId]: seasons }));
          if (seasons[0]) {
            setSelectedSeasonByTitle((current) => current[watchmodeId]
              ? current
              : { ...current, [watchmodeId]: seasons[0].seasonNumber });
          }
        })
        .catch(() => seasonsCache.current.set(seasonCacheKey, []))
        .finally(() => setSeasonsLoadingId((current) => current === watchmodeId ? null : current));
    }
  };

  const runLiveSearch = async (value: string, watchmodeId?: number, openDirectly = false, fallbackTitle?: Title) => {
    const trimmed = value.trim();
    searchController.current?.abort();
    closeAutocomplete();
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
      const params = new URLSearchParams({ q: trimmed });
      params.set("region", country);
      if (watchmodeId) params.set("id", String(watchmodeId));
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await response.json() as LiveSearchResponse;
      if (!response.ok) throw new Error(data.error || "Live availability is temporarily unavailable.");
      const titles = data.titles ?? [];
      const resolvedTitles = titles.length ? titles : fallbackTitle ? [fallbackTitle] : [];
      setLiveResults(resolvedTitles);
      setLiveStatus("ready");
      if (openDirectly && resolvedTitles[0]) {
        const path = titlePath(resolvedTitles[0]);
        if (path) { rememberTitleNavigation(path, resolvedTitles[0]); router.push(path); }
        else {
          setSelectedTitle(resolvedTitles[0]);
          loadTitleExtras(resolvedTitles[0]);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setLiveStatus("error");
      setLiveError(error instanceof Error ? error.message : "Live availability is temporarily unavailable.");
    } finally {
      if (searchController.current === controller) searchController.current = null;
    }
  };

  const runMusicSearch = async (value: string) => {
    const trimmed = value.trim();
    searchController.current?.abort();
    closeAutocomplete();
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setActiveView("discover");
    setMusicVideos([]);
    setMusicError("");
    setMusicFilter("all");
    scrollToResults();

    if (trimmed.length < 2) {
      setMusicStatus("error");
      setMusicError("Enter at least two characters to search music videos.");
      return;
    }

    const controller = new AbortController();
    searchController.current = controller;
    setMusicStatus("loading");

    try {
      const params = new URLSearchParams({ q: trimmed, region: country });
      const response = await fetch(`/api/music-videos?${params.toString()}`, { signal: controller.signal });
      const data = await response.json() as MusicVideoResponse;
      if (!response.ok) throw new Error(data.error || "Music video search could not finish.");
      setMusicVideos(data.videos ?? []);
      setMusicStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setMusicStatus("error");
      setMusicError(error instanceof Error ? error.message : "Music video search could not finish.");
    } finally {
      if (searchController.current === controller) searchController.current = null;
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.currentTarget.querySelector<HTMLInputElement>('input[type="search"]')?.blur();
    if (searchMode === "music") void runMusicSearch(query);
    else {
      void runLiveSearch(query);
      router.push(`/?q=${encodeURIComponent(query.trim())}`, { scroll: false });
    }
  };

  const chooseSuggestion = (title: string, watchmodeId?: number) => {
    const path = watchmodeId ? titlePath({ title, watchmodeId }) : null;
    if (path) { rememberTitleNavigation(path); router.push(path); }
    else void runLiveSearch(title);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setAutocompleteOpen(false);
      setAutocompleteIndex(-1);
      return;
    }

    if (!autocompleteOpen || !autocompleteResults.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAutocompleteIndex((current) => (current + 1) % autocompleteResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAutocompleteIndex((current) => current <= 0 ? autocompleteResults.length - 1 : current - 1);
    } else if (event.key === "Enter" && autocompleteIndex >= 0) {
      event.preventDefault();
      event.currentTarget.blur();
      const selection = autocompleteResults[autocompleteIndex];
      chooseSuggestion(selection.title, selection.id);
    }
  };

  const openTitle = (title: Title) => {
    if (title.live && (title.region ?? "US") !== country) {
      void runLiveSearch(title.title, title.watchmodeId, true, { ...title, region: country });
      return;
    }
    const path = titlePath(title);
    if (path) { rememberTitleNavigation(path, title); router.push(path); }
    else {
      setSelectedTitle(title);
      loadTitleExtras(title);
    }
  };

  const openDiscoveryTitle = (title: DiscoveryTitle) => {
    const path = titlePath({ title: title.title, mediaType: title.mediaType, tmdbId: title.id });
    if (path) { rememberTitleNavigation(path); router.push(path); }
  };

  const handleSimilarTitleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const title = event.currentTarget.dataset.title;
    const watchmodeId = Number(event.currentTarget.dataset.watchmodeId);
    if (!title || !Number.isSafeInteger(watchmodeId)) return;
    setSelectedTitle(null);
    const path = titlePath({ title, watchmodeId });
    if (path) { rememberTitleNavigation(path); router.push(path); }
  };

  const toggleWatchlist = (title: Title) => {
    const saved = watchlist.includes(title.id);
    setWatchlist((current) => saved ? current.filter((id) => id !== title.id) : [...current, title.id]);
    if (title.live) {
      setSavedLiveTitles((current) => saved
        ? current.filter((item) => item.id !== title.id)
        : [...current.filter((item) => item.id !== title.id), title]);
    }
    if (accountUser) {
      const titleRef = doc(firestore, "users", accountUser.uid, "watchlist", String(title.id));
      if (saved) void deleteDoc(titleRef);
      else {
        const safeTitle = JSON.parse(JSON.stringify(title)) as Title;
        void setDoc(titleRef, { ...safeTitle, savedAt: serverTimestamp() });
      }
    }
    showToast(saved ? `${title.title} removed from watchlist` : `${title.title} saved to watchlist`);
  };

  const toggleService = (service: string) => {
    setSavedServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);
  };

  const moveService = (service: string, direction: -1 | 1) => {
    setSavedServices((current) => {
      const index = current.indexOf(service);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  };

  const togglePreferredGenre = (genre: string) => {
    setPreferredGenres((current) => current.includes(genre)
      ? current.filter((item) => item !== genre)
      : current.length < 6 ? [...current, genre] : current);
  };

  const deferOnboarding = () => {
    if (accountUser) window.sessionStorage.setItem("streamfind.onboardingDeferred", accountUser.uid);
    setOnboardingOpen(false);
  };

  const completeOnboarding = async () => {
    if (!accountUser) return;
    setOnboardingBusy(true);
    try {
      const selectedCountry = countries.find((item) => item.code === country) ?? regions[0];
      await setDoc(doc(firestore, "users", accountUser.uid, "settings", "app"), {
        region: selectedCountry.code,
        currency: selectedCountry.currency,
        services: savedServices,
        preferredGenres,
        onboardingComplete: true,
        onboardingCompletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      window.localStorage.setItem(storageKeys.services, JSON.stringify(savedServices));
      window.localStorage.setItem(storageKeys.preferredGenres, JSON.stringify(preferredGenres));
      window.sessionStorage.removeItem("streamfind.onboardingDeferred");
      setOnboardingOpen(false);
      showToast("Your Stream Find is personalized");
    } catch {
      showToast("Your preferences could not be saved");
    } finally {
      setOnboardingBusy(false);
    }
  };

  const clearFilters = () => {
    searchController.current?.abort();
    closeAutocomplete();
    setQuery("");
    setSubmittedQuery("");
    setLiveResults([]);
    setLiveStatus("idle");
    setLiveError("");
    setMediaFilter("all");
    setAccessFilter("all");
    setProviderFilter(null);
    setActiveView("discover");
    setMusicVideos([]);
    setMusicStatus("idle");
    setMusicError("");
    setMusicFilter("all");
  };

  const changeSearchMode = (mode: SearchMode) => {
    if (mode === searchMode) return;
    searchController.current?.abort();
    closeAutocomplete();
    setSearchMode(mode);
    setQuery("");
    setSubmittedQuery("");
    setLiveResults([]);
    setLiveStatus("idle");
    setLiveError("");
    setMusicVideos([]);
    setMusicStatus("idle");
    setMusicError("");
    setMusicFilter("all");
    setProviderFilter(null);
    setSelectedTitle(null);
    setSelectedMusicVideo(null);
    setActiveView("discover");
  };

  const changeCountry = (nextCountry: string) => {
    if (nextCountry === country) return;
    searchController.current?.abort();
    setDiscoveryStatus("loading");
    setDiscoveryError("");
    setProvidersLoading(true);
    setProviderDirectory([]);
    setCountry(nextCountry);
    setQuery("");
    setSubmittedQuery("");
    setLiveResults([]);
    setLiveStatus("idle");
    setLiveError("");
    setMusicVideos([]);
    setMusicStatus("idle");
    setMusicError("");
    setProviderFilter(null);
    setSelectedTitle(null);
    setSeasonsByTitle({});
    setSelectedSeasonByTitle({});
    seasonsCache.current.clear();
    setActiveView("discover");
    showToast(`Region changed to ${regions.find((region) => region.code === nextCountry)?.name ?? nextCountry}`);
  };

  const openView = (view: "discover" | "watchlist") => {
    searchController.current?.abort();
    closeAutocomplete();
    setActiveView(view);
    setQuery("");
    setSubmittedQuery("");
    setLiveResults([]);
    setLiveStatus("idle");
    setLiveError("");
    setSearchMode("screen");
    setMusicVideos([]);
    setMusicStatus("idle");
    setMusicError("");
    scrollToResults();
  };

  const resultHeading = searchMode === "music"
    ? musicStatus === "loading"
      ? "Searching music videos…"
      : submittedQuery
        ? `Music videos for “${submittedQuery}”`
        : "Search music videos"
    : activeView === "watchlist"
    ? "Your watchlist"
    : liveStatus === "loading"
      ? "Searching across services…"
    : submittedQuery
      ? `Live results for “${submittedQuery}”`
      : "Worth watching right now";

  const resultKicker = searchMode === "music"
    ? submittedQuery ? "YouTube music results" : "Official videos, live sets, and lyrics"
    : activeView === "watchlist"
    ? `${watchlist.length} saved`
    : submittedQuery
      ? `Live ${country} availability`
      : "Curated for tonight";

  const isDiscoveryHome = searchMode === "screen" && activeView === "discover" && !submittedQuery;
  const activeCountry = countries.find((item) => item.code === country)
    ?? regions.find((item) => item.code === country)
    ?? regions[0];

  return (
    <main className={accountUser ? "memberExperience" : undefined}>
      <Suspense fallback={null}><SearchRouteSync onQuery={(value) => {
        if (value) {
          if (submittedQuery !== value || searchMode !== "screen") {
            setSearchMode("screen");
            void runLiveSearch(value);
          }
        } else {
          searchController.current?.abort();
          setQuery("");
          setSubmittedQuery("");
          setActiveView("discover");
        }
      }} /></Suspense>
      <header className="siteHeader">
        <button className="brand brandButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Stream Find home">
          <span className="brandMark" aria-hidden="true"><span /></span>
          <span>Stream Find</span>
        </button>
        <nav className="desktopNav" aria-label="Primary navigation">
          <button className={activeView === "discover" ? "active" : ""} type="button" onClick={() => openView("discover")}>Discover</button>
          <button className={activeView === "watchlist" ? "active" : ""} type="button" onClick={() => openView("watchlist")}>Watchlist <span className="navCount">{watchlist.length}</span></button>
          <button type="button" onClick={() => setServiceModalOpen(true)}>My services</button>
          <button type="button" onClick={() => setSocialOpen(true)}>Friends</button>
        </nav>
        <div className="headerActions">
          <NotificationBell user={accountUser} />
          <HeaderSearchButton onClick={focusMainSearch} />
          <button className="profileButton" type="button" onClick={() => setSocialOpen(true)} aria-label={accountUser ? "Open account and friends" : "Sign in to Stream Find"}>{accountUser ? (accountUser.displayName || accountUser.email || "SF").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() : "SF"}</button>
        </div>
      </header>

      <section className={`hero${accountUser ? " memberHero" : ""}${autocompleteOpen && searchMode === "screen" ? " autocompleteActive" : ""}`} id="top">
        <div className="heroBackdrop" aria-hidden="true" />
        <div className="heroGlow" aria-hidden="true" />
        <div className="heroContent">
          <p className="eyebrow"><span /> {accountUser ? `Welcome back${accountUser.displayName ? `, ${accountUser.displayName.split(" ")[0]}` : ""}` : searchMode === "music" ? "One search. Every sound." : "One search. Every screen."}</p>
          <h1>{accountUser ? (searchMode === "music" ? "What do you want to hear?" : "What do you want to watch?") : searchMode === "music" ? <>Find the song.<br /><em>Watch the moment.</em></> : <>Find the story.<br /><em>Skip the search.</em></>}</h1>
          <p className="heroCopy">
            {accountUser ? (searchMode === "music" ? "Search artists, songs, and performances." : `${savedServices.length ? `Prioritizing your ${savedServices.length} saved service${savedServices.length === 1 ? "" : "s"}` : "Choose your services for included picks"} · ${activeCountry.name}`) : searchMode === "music"
              ? "Find official music videos, live performances, lyric videos, and visualizers from artists around the world."
              : "See where any movie or show is streaming, what is already included, and the cheapest way to watch."}
          </p>
          <div className="searchModeSwitch" role="tablist" aria-label="Search category">
            <button type="button" role="tab" aria-selected={searchMode === "screen"} className={searchMode === "screen" ? "active" : ""} onClick={() => changeSearchMode("screen")}>Movies &amp; TV</button>
            <button type="button" role="tab" aria-selected={searchMode === "music"} className={searchMode === "music" ? "active" : ""} onClick={() => changeSearchMode("music")}><span aria-hidden="true">▶</span> Music videos</button>
          </div>
          <div
            className="searchExperience"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                setAutocompleteOpen(false);
                setAutocompleteIndex(-1);
              }
            }}
          >
            <form className="searchShell" role="search" onSubmit={submitSearch}>
              <SearchIcon />
              <label className="srOnly" htmlFor="title-search">{searchMode === "music" ? "Search for an artist, song, or music video" : "Search for a movie or TV show"}</label>
              <input
                ref={searchInputRef}
                id="title-search"
                data-testid="title-search"
                type="search"
                enterKeyHint="search"
                placeholder={searchMode === "music" ? "Search artist, song, or music video" : "Search movies and shows"}
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  setAutocompleteIndex(-1);
                  if (nextQuery.trim().length < 3) {
                    autocompleteController.current?.abort();
                    setAutocompleteResults([]);
                    setAutocompleteOpen(false);
                  }
                }}
                onFocus={() => setAutocompleteOpen(autocompleteResults.length > 0)}
                onKeyDown={handleSearchKeyDown}
                autoComplete="off"
                role={searchMode === "screen" ? "combobox" : undefined}
                aria-autocomplete={searchMode === "screen" ? "list" : undefined}
                aria-controls={searchMode === "screen" ? "title-search-suggestions" : undefined}
                aria-expanded={searchMode === "screen" ? autocompleteOpen : undefined}
                aria-activedescendant={searchMode === "screen" && autocompleteIndex >= 0 ? `title-suggestion-${autocompleteResults[autocompleteIndex]?.id}` : undefined}
              />
              <button type="submit" disabled={searchMode === "music" ? musicStatus === "loading" : liveStatus === "loading"}>
                <span className="searchButtonLabel">{(searchMode === "music" ? musicStatus : liveStatus) === "loading" ? "Searching" : "Search"}</span>
                <ArrowIcon />
              </button>
            </form>
            {searchMode === "screen" && autocompleteOpen && (
              <div className="autocompletePanel" id="title-search-suggestions" role="listbox" aria-label="Movie and show suggestions">
                {autocompleteResults.map((result, index) => (
                  <button
                    className={`autocompleteOption ${index === autocompleteIndex ? "active" : ""}`}
                    id={`title-suggestion-${result.id}`}
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={index === autocompleteIndex}
                    onMouseEnter={() => setAutocompleteIndex(index)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      chooseSuggestion(result.title, result.id);
                    }}
                    onClick={() => chooseSuggestion(result.title, result.id)}
                  >
                    <span
                      className="autocompleteArtwork"
                      style={result.imageUrl ? { backgroundImage: `url(${result.imageUrl})` } : undefined}
                      aria-hidden="true"
                    >
                      {!result.imageUrl && (result.mediaType === "movie" ? "FILM" : "TV")}
                    </span>
                    <span className="autocompleteCopy">
                      <strong>{result.title}</strong>
                      <span>{[result.year, result.mediaType === "movie" ? "Movie" : "Series"].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ArrowIcon />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="searchHints" aria-label="Popular searches">
            <span>Try</span>
            {(searchMode === "music" ? ["Beyoncé", "The Weeknd", "Bad Bunny"] : ["Dune: Part Two", "Shōgun", "The Bear"]).map((title) => (
              <button type="button" key={title} onClick={() => searchMode === "music" ? void runMusicSearch(title) : chooseSuggestion(title)}>{title}</button>
            ))}
          </div>
        </div>
        <button className="availabilityPreview" type="button" onClick={() => document.getElementById("title-search")?.focus()} aria-label={searchMode === "music" ? "Search YouTube music videos" : `Search live ${activeCountry.name} streaming availability`}>
          <span className="availabilityLabel"><span className="liveDot" /> {searchMode === "music" ? "Music discovery" : "Live availability"}</span>
          <span className="availabilityTitle">
            <strong>{searchMode === "music" ? "Powered by YouTube" : "Watchmode connected"}</strong>
            <small>{searchMode === "music" ? "Official · Live · Lyrics" : `${activeCountry.name} streaming sources`}</small>
          </span>
          <span className="includedPill livePill">{searchMode === "music" ? "Play" : "Live"}</span>
        </button>
      </section>

      {!accountUser && searchMode === "screen" && <section className="serviceStrip" id="services" aria-labelledby="services-title">
        <div>
          <p className="sectionKicker">Your services</p>
          <h2 id="services-title">Search within the services you already have</h2>
        </div>
        <div className="serviceList">
          {savedServices.map((name) => providerDirectory.find((service) => service.name === name)).filter((service): service is ProviderStyle => Boolean(service)).slice(0, 5).map((service) => (
            <button
              className={`serviceChip ${providerFilter === service.name ? "selected" : ""}`}
              type="button"
              aria-pressed={providerFilter === service.name}
              onClick={() => {
                if (!submittedQuery) {
                  showToast(`Search a title to check ${service.name} availability`);
                  document.getElementById("title-search")?.focus();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
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
      </section>}

      {accountUser && isDiscoveryHome && <MemberHome key={accountUser.uid} user={accountUser} watchlistIds={watchlist} watchlistTitles={[...catalog, ...savedLiveTitles]} services={savedServices} region={country} onServices={() => setServiceModalOpen(true)} onFriends={() => setSocialOpen(true)} onWatchlist={() => openView("watchlist")} />}
      {!accountUser && isDiscoveryHome && searchMode === "screen" && <div className="guestPlatform"><PlatformHighlights key={savedServices.join("|")} services={savedServices} region={country} onServices={() => setServiceModalOpen(true)} /></div>}

      <section className="discoverSection" id="discover" aria-labelledby="discover-title">
        {isDiscoveryHome ? (
          <>
            <div className="sectionHeading discoveryIntro">
              <div>
                <p className="sectionKicker liveKicker">{accountUser ? "Your next watch" : "Updated throughout the day"}</p>
                <h2 id="discover-title">{accountUser ? "Picked for your evening" : "Discover what to watch next."}</h2>
              </div>
              <a className="tmdbAttribution" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">Powered by TMDB</a>
            </div>

            {discoveryStatus === "loading" ? (
              <div className="discoveryLoading" aria-label="Loading live recommendations">
                {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
              </div>
            ) : discoveryStatus === "error" ? (
              <div className="emptyState errorState" role="alert">
                <span className="emptyMark" aria-hidden="true"><SearchIcon /></span>
                <h3>Live discovery could not load</h3>
                <p>{discoveryError}</p>
                <button type="button" onClick={() => document.getElementById("title-search")?.focus()}>Search for a title</button>
              </div>
            ) : (
              <div className="discoveryFeeds">
                {personalizedLoading && <section className="discoveryFeed personalizedFeed" aria-label="Building recommendations"><div className="discoveryFeedHeading"><div><p>Learning your taste</p><h3>Building picks for you…</h3></div></div><div className="discoveryLoading compact" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div></section>}
                {[...discoverySections.filter((section) => section.id === "included"), ...(personalizedSection ? [personalizedSection] : []), ...discoverySections.filter((section) => section.id !== "included")].map((section) => (
                  <section className="discoveryFeed" key={section.id} aria-labelledby={`discovery-${section.id}`}>
                    <div className="discoveryFeedHeading">
                      <div>
                        <p>{section.kicker}</p>
                        <h3 id={`discovery-${section.id}`}>{section.title}</h3>
                      </div>
                      <span>{section.titles.length} titles</span>
                    </div>
                    <div className="discoveryRail">
                      {section.titles.map((item) => (
                        <button
                          className="discoveryCard"
                          type="button"
                          key={`${section.id}-${item.mediaType}-${item.id}`}
                          onClick={() => openDiscoveryTitle(item)}
                          aria-label={`Check where to watch ${item.title}`}
                        >
                          <span className="discoveryPoster" style={{ backgroundImage: `url(${JSON.stringify(item.posterUrl)})` }}>
                            {item.score && <span className="discoveryScore" aria-label={`TMDB rating ${item.score} out of 100`}>{item.score}% <small>TMDB</small></span>}
                            <span className="discoveryPosterShade" aria-hidden="true" />
                            <span className="discoveryAction">Check availability <ArrowIcon /></span>
                          </span>
                          <span className="discoveryCardCopy">
                            <strong>{item.title}</strong>
                            <small>{[item.year, item.mediaType === "movie" ? "Movie" : "Series", item.genres[0]].filter(Boolean).join(" · ")}</small>
                            {item.reason && <em>{item.reason}</em>}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="sectionHeading">
              <div>
                <p className={`sectionKicker ${submittedQuery ? "liveKicker" : ""}`}>{resultKicker}</p>
                <h2 id="discover-title">{resultHeading}</h2>
              </div>
              <button className="clearButton" type="button" onClick={clearFilters}>Clear all</button>
            </div>

            {searchMode === "screen" && activeView === "watchlist" && (
              <section className={`releaseAlertsPanel ${releaseAlertsEnabled ? "enabled" : "disabled"}`} aria-labelledby="release-alerts-title">
                <div className="releaseAlertsHeader">
                  <span className="releaseAlertsMark" aria-hidden="true"><BellIcon /></span>
                  <div>
                    <p>Availability, prices & releases</p>
                    <h3 id="release-alerts-title">Watchlist alerts</h3>
                  </div>
                  <button
                    className="releaseAlertToggle"
                    type="button"
                    role="switch"
                    aria-checked={releaseAlertsEnabled}
                    onClick={() => {
                      setReleaseAlertsEnabled((current) => !current);
                      if (releaseAlertsEnabled) {
                        setReleaseAlerts([]);
                        setReleaseAlertsStatus("idle");
                      }
                    }}
                  >
                    <span aria-hidden="true" /> {releaseAlertsEnabled ? "On" : "Off"}
                  </button>
                </div>
                {releaseAlertsEnabled && (
                  <div className="deviceAlertRow">
                    <div>
                      <strong>Device notifications</strong>
                      <span>{pushStatus === "subscribed"
                        ? "Daily availability, price, and release checks are active."
                        : pushStatus === "denied"
                          ? "Allow notifications in your browser settings to continue."
                          : pushStatus === "install-required"
                            ? "On iPhone, add Stream Find to your Home Screen first."
                            : pushStatus === "unsupported"
                              ? "This browser does not support web notifications."
                              : accountUser
                                ? "Get an alert when a saved title becomes easier or cheaper to watch."
                                : "Sign in to connect alerts to your watchlist."}</span>
                    </div>
                    <button
                      className={`deviceAlertButton ${pushStatus === "subscribed" ? "active" : ""}`}
                      type="button"
                      onClick={() => void toggleDeviceNotifications()}
                      disabled={pushBusy || pushStatus === "checking" || pushStatus === "unsupported" || pushStatus === "denied"}
                    >
                      <BellIcon />
                      {pushBusy
                        ? "Updating…"
                        : pushStatus === "subscribed"
                          ? "Turn off"
                          : pushStatus === "denied"
                            ? "Blocked"
                            : pushStatus === "unsupported"
                              ? "Unavailable"
                              : accountUser ? "Notify me" : "Sign in"}
                    </button>
                  </div>
                )}
                {releaseAlertsEnabled && accountUser && (
                  <div className="availabilityTrackingRow">
                    <span aria-hidden="true">↻</span>
                    <div>
                      <strong>{availabilityTracking?.count
                        ? `Monitoring ${availabilityTracking.count} saved ${availabilityTracking.count === 1 ? "title" : "titles"}`
                        : "Daily monitoring is ready"}</strong>
                      <small>{availabilityTracking?.lastChecked
                        ? `Availability last checked ${formatTrackingTime(availabilityTracking.lastChecked)}`
                        : "The first check establishes a baseline; alerts begin when availability or prices change."}</small>
                    </div>
                  </div>
                )}
                {!releaseAlertsEnabled ? (
                  <p className="releaseAlertsEmpty">Turn on alerts to track availability, prices, regional releases, and upcoming episodes.</p>
                ) : watchlist.length === 0 ? (
                  <p className="releaseAlertsEmpty">Save a movie or series to begin tracking availability, prices, and release dates.</p>
                ) : releaseAlertsStatus === "idle" || releaseAlertsStatus === "loading" ? (
                  <div className="releaseAlertLoading" aria-label="Checking watchlist release dates"><span /><span /><span /></div>
                ) : releaseAlertsStatus === "error" ? (
                  <p className="releaseAlertsEmpty error">{releaseAlertsError}</p>
                ) : releaseAlerts.length > 0 ? (
                  <div className="releaseAlertList">
                    {releaseAlerts.map((alert) => {
                      const matchingTitle = sourceTitles.find((title) => title.id === alert.titleId);
                      return (
                        <button type="button" key={`${alert.titleId}-${alert.kind}-${alert.date}`} onClick={() => matchingTitle && openTitle(matchingTitle)} disabled={!matchingTitle}>
                          <time dateTime={alert.date}><strong>{formatAlertDate(alert.date).split(" ")[0]}</strong><span>{formatAlertDate(alert.date).split(" ")[1]}</span></time>
                          <span><small>{alert.label}</small><strong>{alert.title}</strong><em>{alert.detail}</em></span>
                          <ArrowIcon />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="releaseAlertsEmpty">You’re caught up. New episode and regional release dates will appear here.</p>
                )}
              </section>
            )}

            {searchMode === "music" ? (
              <>
                <div className="musicFilterBar" aria-label="Filter music videos">
                  {([
                    ["all", "All videos"],
                    ["official", "Official"],
                    ["live", "Live"],
                    ["lyrics", "Lyrics"],
                    ["performance", "Performances"],
                  ] as const).map(([id, label]) => (
                    <button key={id} type="button" className={musicFilter === id ? "active" : ""} aria-pressed={musicFilter === id} onClick={() => setMusicFilter(id)}>{label}</button>
                  ))}
                </div>

                {submittedQuery && (
                  <a className="liveAttribution youtubeAttribution" href="https://developers.google.com/youtube" target="_blank" rel="noreferrer">
                    <span className="youtubePlay" aria-hidden="true">▶</span> Results from YouTube
                  </a>
                )}

                <p className="resultCount" aria-live="polite">
                  {musicStatus === "loading" ? "Searching YouTube…" : `${filteredMusicVideos.length} ${filteredMusicVideos.length === 1 ? "video" : "videos"}`}
                </p>

                {musicStatus === "error" && <div className="errorBanner" role="alert">{musicError}</div>}

                {musicStatus === "loading" ? (
                  <div className="musicSkeletonGrid" aria-hidden="true">
                    {Array.from({ length: 6 }, (_, index) => <span className="musicSkeleton" key={index}><span /><span /><span /></span>)}
                  </div>
                ) : musicStatus === "error" ? (
                  <div className="emptyState errorState">
                    <span className="emptyMark" aria-hidden="true">▶</span>
                    <h3>Music video search could not finish</h3>
                    <p>{musicError}</p>
                    <button type="button" onClick={() => void runMusicSearch(query)}>Try again</button>
                  </div>
                ) : filteredMusicVideos.length > 0 ? (
                  <div className="musicVideoGrid">
                    {filteredMusicVideos.map((video) => (
                      <button className="musicVideoCard" type="button" key={video.id} onClick={() => setSelectedMusicVideo(video)} aria-label={`Play ${video.title} by ${video.channelTitle}`}>
                        <span className="musicThumbnail" style={video.thumbnail ? { backgroundImage: `url(${JSON.stringify(video.thumbnail)})` } : undefined}>
                          <span className="musicPlay" aria-hidden="true">▶</span>
                          {video.duration && <span className="musicDuration">{video.duration}</span>}
                          {video.official && <span className="officialBadge">Official</span>}
                        </span>
                        <span className="musicVideoCopy">
                          <strong>{video.title}</strong>
                          <span>{video.channelTitle}</span>
                          <small>{formatViewCount(video.viewCount)}{video.publishedAt ? ` · ${new Date(video.publishedAt).getFullYear()}` : ""}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : submittedQuery ? (
                  <div className="emptyState">
                    <span className="emptyMark" aria-hidden="true">▶</span>
                    <h3>No matching music videos found</h3>
                    <p>Try the artist name, song title, or a broader filter.</p>
                    <button type="button" onClick={() => setMusicFilter("all")}>Show all videos</button>
                  </div>
                ) : (
                  <div className="musicSearchStart">
                    <span className="musicStartMark" aria-hidden="true">▶</span>
                    <div><h3>Search beyond movies and shows</h3><p>Enter an artist or song to find official videos, live performances, lyrics, and visualizers.</p></div>
                  </div>
                )}
              </>
            ) : <>
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
                  const provider = offer ? getProvider(offer.provider, providerDirectory) : null;
                  const saved = watchlist.includes(item.id);
                  return (
                    <article className="titleCard" key={item.id}>
                      <div className={`poster ${item.art} ${item.backdropUrl || item.posterUrl ? "liveArtwork" : ""}`} style={artworkStyle(item)}>
                        <span className="score">{item.live ? (item.score ? `${item.score}% score` : "New") : `${item.score}% demo score`}</span>
                        <button className={`saveButton ${saved ? "saved" : ""}`} data-testid={`save-${item.id}`} type="button" aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${item.title} ${saved ? "from" : "to"} watchlist`} onClick={() => toggleWatchlist(item)}><BookmarkIcon filled={saved} /></button>
                        <button className="posterButton" type="button" onClick={() => openTitle(item)} aria-label={`See all watch options for ${item.title}`} />
                        <div className="posterShade" aria-hidden="true" />
                        <div className="posterCopy"><p>{item.year} · {item.mediaType === "movie" ? "Film" : "Series"} · {item.runtime}</p><h3>{item.title}</h3></div>
                      </div>
                      {offer && provider ? (
                        <button className="watchRow" type="button" onClick={() => openTitle(item)} aria-label={`Compare watch options for ${item.title}`}>
                          <ProviderMark provider={provider} variant="badge" />
                          <span className="watchCopy"><small>Best on {providerBrand(offer.provider)}{providerHost(offer.provider) ? ` via ${providerHost(offer.provider)}` : ""}</small><strong className={`offerText ${offer.type}`}>{offerLabel(offer)}</strong></span>
                          <ArrowIcon />
                        </button>
                      ) : (
                        <button className="watchRow releasePendingRow" type="button" onClick={() => openTitle(item)} aria-label={`View release tracking for ${item.title}`}>
                          <span className="releaseBadge" aria-hidden="true"><BellIcon /></span>
                          <span className="watchCopy"><small>Not streaming yet</small><strong>{item.releaseDate ? `Expected ${formatAlertDate(item.releaseDate, "long")}` : "Track release"}</strong></span>
                          <ArrowIcon />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="emptyState">
                <span className="emptyMark" aria-hidden="true"><SearchIcon /></span>
                <h3>{activeView === "watchlist" ? "Your watchlist is ready for its first title" : `No ${activeCountry.name} streaming options found`}</h3>
                <p>{activeView === "watchlist" ? "Save something from Discover and it will stay here on this device." : "Try a more specific title, or search another movie or show."}</p>
                <button type="button" onClick={clearFilters}>{activeView === "watchlist" ? "Explore titles" : "Clear filters"}</button>
              </div>
            )}
            </>}
          </>
        )}
      </section>

      {!accountUser && searchMode === "screen" && <section className="decisionSection" aria-labelledby="decision-title">
        <div>
          <p className="sectionKicker">The answer, not another list</p>
          <h2 id="decision-title">Your cheapest option rises to the top.</h2>
        </div>
        <div className="decisionSteps">
          <article><span>01</span><h3>Check your services</h3><p>Included options are prioritized before anything that costs more.</p></article>
          <article><span>02</span><h3>Compare every price</h3><p>Free with ads, rental, and purchase choices use one clear language.</p></article>
          <article><span>03</span><h3>Choose and watch</h3><p>See the best value now and every alternate option in one place.</p></article>
        </div>
      </section>}

      <footer className="siteFooter">
        <button className="brand brandButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span className="brandMark" aria-hidden="true"><span /></span><span>Stream Find</span></button>
        <p>Find where to watch, without the endless browsing.</p>
        <span className="footerMeta"><a href="https://api.watchmode.com/" target="_blank" rel="noreferrer">Availability by Watchmode</a><span>·</span><a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">Metadata by TMDB</a><span>·</span><a href="https://developers.google.com/youtube" target="_blank" rel="noreferrer">Music videos by YouTube</a><span>·</span><a href="/brand-attribution.txt" target="_blank">Credits</a><span>·</span><span>{activeCountry.name}</span></span>
      </footer>

      <nav className="mobileNav" aria-label="Mobile navigation">
        <button type="button" onClick={focusMainSearch}><SearchIcon /><span>Search</span></button>
        <button type="button" className={activeView === "discover" ? "active" : ""} onClick={() => {
          openView("discover");
          window.setTimeout(() => document.getElementById("discover")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        }}><DiscoverIcon /><span>Discover</span></button>
        <button type="button" className={activeView === "watchlist" ? "active" : ""} onClick={() => openView("watchlist")}><BookmarkIcon filled={activeView === "watchlist"} /><span>Watchlist</span>{watchlist.length > 0 && <small>{watchlist.length}</small>}</button>
      </nav>

      <SocialHub
        open={socialOpen}
        onClose={() => setSocialOpen(false)}
        user={accountUser}
        watchlistIds={watchlist}
        onOpenTitle={(title) => openTitle(title as Title)}
        onSaveTitle={(title) => toggleWatchlist(title as Title)}
      />

      {onboardingOpen && accountUser && (
        <div className="onboardingBackdrop" role="presentation">
          <ModalDialog className="onboardingPanel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <header>
              <LinkLogo />
              <button type="button" onClick={deferOnboarding}>Set up later</button>
            </header>
            <div className="onboardingProgress" aria-label={`Step ${onboardingStep + 1} of 3`}>
              {[0, 1, 2].map((step) => <span className={step <= onboardingStep ? "active" : ""} key={step} />)}
            </div>

            {onboardingStep === 0 && <div className="onboardingStep">
              <p className="sectionKicker">Step 1 · Your region</p>
              <h2 id="onboarding-title">Where do you watch?</h2>
              <p>We’ll show the providers, prices, and release dates available in your country.</p>
              <label className="onboardingCountry">
                <span>Streaming country</span>
                <select value={country} onChange={(event) => changeCountry(event.target.value)}>
                  {countries.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}
                </select>
                <strong>{countries.find((item) => item.code === country)?.name ?? country}</strong>
                <small>{countries.find((item) => item.code === country)?.currency ?? "USD"} pricing</small>
              </label>
            </div>}

            {onboardingStep === 1 && <div className="onboardingStep">
              <p className="sectionKicker">Step 2 · Your services</p>
              <h2 id="onboarding-title">What do you already have?</h2>
              <p>Included options from these services will rise above rentals and purchases.</p>
              <div className="onboardingServices">
                {(providerDirectory.length ? providerDirectory : featuredProviders).filter((provider) => featuredProviders.some((featured) => featured.name === provider.name)).slice(0, 12).map((service) => {
                  const selected = savedServices.includes(service.name);
                  return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleService(service.name)} key={service.name}>
                    <ProviderMark provider={service} />
                    <span>{service.name}</span>
                    <i aria-hidden="true">{selected ? "✓" : "+"}</i>
                  </button>;
                })}
              </div>
              <small className="onboardingSelectionCount">{savedServices.length} selected · You can change these anytime</small>
            </div>}

            {onboardingStep === 2 && <div className="onboardingStep">
              <p className="sectionKicker">Step 3 · Your taste</p>
              <h2 id="onboarding-title">What are you into?</h2>
              <p>Choose up to six. We’ll use them to build your first personalized recommendations.</p>
              <div className="onboardingGenres">
                {onboardingGenreOptions.map((genre) => <button type="button" className={preferredGenres.includes(genre) ? "selected" : ""} aria-pressed={preferredGenres.includes(genre)} onClick={() => togglePreferredGenre(genre)} key={genre}>{genre}<span>{preferredGenres.includes(genre) ? "✓" : "+"}</span></button>)}
              </div>
              <small className="onboardingSelectionCount">{preferredGenres.length}/6 selected</small>
            </div>}

            <footer>
              <button type="button" onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))} disabled={onboardingStep === 0}>Back</button>
              {onboardingStep < 2
                ? <button className="onboardingPrimary" type="button" onClick={() => setOnboardingStep((step) => Math.min(2, step + 1))}>Continue</button>
                : <button className="onboardingPrimary" type="button" onClick={() => void completeOnboarding()} disabled={onboardingBusy}>{onboardingBusy ? "Saving…" : "Start discovering"}</button>}
            </footer>
          </ModalDialog>
        </div>
      )}

      {selectedMusicVideo && (
        <div className="modalBackdrop musicModalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedMusicVideo(null)}>
          <ModalDialog className="modalPanel musicPlayerModal" role="dialog" aria-modal="true" aria-labelledby="music-video-title">
            <button className="closeButton floating" type="button" onClick={() => setSelectedMusicVideo(null)} aria-label="Close music video"><CloseIcon /></button>
            <div className="musicPlayerFrame">
              <iframe
                src={selectedMusicVideo.embedUrl}
                title={selectedMusicVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <div className="musicPlayerDetails">
              <div>
                <p>{selectedMusicVideo.official ? "Official source" : "Music video"} · {formatViewCount(selectedMusicVideo.viewCount)}</p>
                <h2 id="music-video-title">{selectedMusicVideo.title}</h2>
                <span>{selectedMusicVideo.channelTitle}</span>
              </div>
              <a href={selectedMusicVideo.url} target="_blank" rel="noreferrer">Open on YouTube <ArrowIcon /></a>
            </div>
          </ModalDialog>
        </div>
      )}

      {serviceModalOpen && (
        <div className="modalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setServiceModalOpen(false)}>
          <ModalDialog className="modalPanel serviceModal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
            <div className="modalHeader">
              <div><p className="sectionKicker">Your streaming setup</p><h2 id="service-modal-title">Services and region</h2></div>
              <button className="closeButton" type="button" onClick={() => setServiceModalOpen(false)} aria-label="Close services"><CloseIcon /></button>
            </div>
            <p className="modalIntro">Choose where you watch and the services you already have. We’ll prioritize included options available in your region.</p>
            <label className="streamingRegionSetting">
              <span><strong>Streaming region</strong><small>Controls providers, prices, and release dates</small></span>
              <select value={country} onChange={(event) => changeCountry(event.target.value)} aria-label="Streaming region">
                {countries.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}
              </select>
            </label>
            <section className="servicePriority" aria-labelledby="service-priority-title">
              <div className="servicePriorityHeading"><h3 id="service-priority-title">Your services</h3><p>Move your most watched service to the top. This order is used across Stream Find.</p></div>
              {savedServices.length ? <ol className="servicePriorityList">
                {savedServices.map((name, index) => <li key={name}>
                  <span className="servicePriorityNumber">{index + 1}</span>
                  <ProviderLogo name={name} />
                  <span className="servicePriorityName">{name}</span>
                  <div className="servicePriorityActions">
                    <button type="button" onClick={() => moveService(name, -1)} disabled={index === 0} aria-label={`Move ${name} up`}>↑</button>
                    <button type="button" onClick={() => moveService(name, 1)} disabled={index === savedServices.length - 1} aria-label={`Move ${name} down`}>↓</button>
                    <button type="button" onClick={() => toggleService(name)} aria-label={`Remove ${name}`}>Remove</button>
                  </div>
                </li>)}
              </ol> : <p className="servicePriorityEmpty">Choose a service below to add it here.</p>}
            </section>
            <div className="providerSearch">
              <SearchIcon />
              <label className="srOnly" htmlFor="provider-search">Find more streaming services</label>
              <input
                id="provider-search"
                type="search"
                placeholder="Add a streaming service"
                value={serviceSearch}
                onChange={(event) => setServiceSearch(event.target.value)}
              />
              <span>{providerDirectory.length}</span>
            </div>
            <div className="providerPicker">
              {visibleProviders.filter((service) => !savedServices.includes(service.name)).map((service) => (
                  <button key={service.name} type="button" onClick={() => toggleService(service.name)} aria-label={`Add ${service.name}`}>
                    <ProviderMark provider={service} />
                    <span>{service.name}</span>
                    <span className="providerAdd" aria-hidden="true">+</span>
                  </button>
              ))}
              {!providersLoading && visibleProviders.filter((service) => !savedServices.includes(service.name)).length === 0 && <p className="providerEmpty">{serviceSearch ? "No other services match that search." : "All available services are selected."}</p>}
            </div>
            <div className="modalFooter"><span>{savedServices.length} selected · {providersLoading ? "Updating directory…" : `${providerDirectory.length} ${country} services`}</span><button type="button" onClick={() => setServiceModalOpen(false)}>Save services</button></div>
          </ModalDialog>
        </div>
      )}

      {selectedTitle && (() => {
        const offer = bestOffer(selectedTitle.offers, savedServices);
        const saved = watchlist.includes(selectedTitle.id);
        const orderedOffers = [...selectedTitle.offers].sort((a, b) => compareOffers(a, b, savedServices));
        const credits = selectedTitle.watchmodeId ? creditsByTitle[selectedTitle.watchmodeId] ?? [] : [];
        const cast = credits.filter((credit) => credit.type === "cast");
        const crew = credits.filter((credit) => credit.type === "crew");
        const orderedCredits = [...cast.slice(0, 4), ...crew.slice(0, 2), ...cast.slice(4), ...crew.slice(2)];
        const creditsExpanded = selectedTitle.watchmodeId ? expandedCreditTitles.has(selectedTitle.watchmodeId) : false;
        const visibleCredits = creditsExpanded ? orderedCredits : orderedCredits.slice(0, 6);
        const similarTitles = selectedTitle.watchmodeId ? similarByTitle[selectedTitle.watchmodeId] ?? [] : [];
        const hasSimilarTitles = (selectedTitle.similarTitleIds?.length ?? 0) > 0;
        const seasons = selectedTitle.watchmodeId ? seasonsByTitle[selectedTitle.watchmodeId] ?? [] : [];
        const selectedSeasonNumber = selectedTitle.watchmodeId
          ? selectedSeasonByTitle[selectedTitle.watchmodeId] ?? seasons[0]?.seasonNumber
          : undefined;
        const selectedSeason = seasons.find((season) => season.seasonNumber === selectedSeasonNumber) ?? seasons[0];
        return (
          <div className="modalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTitle(null)}>
            <ModalDialog className="modalPanel titleModal" role="dialog" aria-modal="true" aria-labelledby="title-modal-title">
              <div
                className={`detailArt ${selectedTitle.art} ${selectedTitle.backdropUrl || selectedTitle.posterUrl ? "liveArtwork" : ""}`}
                style={artworkStyle(selectedTitle)}
              >
                <div className="detailShade" />
                <button className="closeButton floating" type="button" onClick={() => setSelectedTitle(null)} aria-label="Close title details"><CloseIcon /></button>
                {selectedTitle.trailerUrl && (
                  <a className="trailerButton" href={selectedTitle.trailerUrl} target="_blank" rel="noreferrer">
                    <span aria-hidden="true">▶</span> Watch trailer
                  </a>
                )}
                <div className="detailHeroCopy">
                  <p>{selectedTitle.live ? (selectedTitle.score ? `${selectedTitle.score}% score` : selectedTitle.offers.length ? "Live availability" : "Release tracking") : `${selectedTitle.score}% demo score`} · {selectedTitle.year} · {selectedTitle.rating}</p>
                  <h2 id="title-modal-title">{selectedTitle.title}</h2>
                  <span>{selectedTitle.genres.join(" · ")} · {selectedTitle.runtime}</span>
                  {selectedTitle.networkNames && selectedTitle.networkNames.length > 0 && <span className="networkLine">From {selectedTitle.networkNames.join(" · ")}</span>}
                </div>
              </div>
              <div className="detailBody">
                <p className="synopsis">{selectedTitle.synopsis}</p>
                {(selectedTitle.willYouLikeThis || selectedTitle.reviewSummary) && (
                  <div className="insightGrid">
                    {selectedTitle.willYouLikeThis && (
                      <article>
                        <span>Will you like it?</span>
                        <p>{selectedTitle.willYouLikeThis}</p>
                      </article>
                    )}
                    {selectedTitle.reviewSummary && (
                      <article>
                        <span>What reviewers say</span>
                        <p>{selectedTitle.reviewSummary}</p>
                      </article>
                    )}
                  </div>
                )}
                {selectedTitle.live && selectedTitle.mediaType === "show" && selectedTitle.watchmodeId && (
                  <div className="seasonSection">
                    <div className="detailSectionHeading">
                      <h3>Season availability</h3>
                      <span>{activeCountry.name}</span>
                    </div>
                    {seasonsLoadingId === selectedTitle.watchmodeId ? (
                      <div className="seasonLoading" aria-label="Loading season availability"><span /><span /><span /></div>
                    ) : seasons.length > 0 ? (
                      <>
                        <div className="seasonTabs" role="tablist" aria-label="Seasons">
                          {seasons.map((season) => (
                            <button
                              key={season.seasonNumber}
                              type="button"
                              role="tab"
                              aria-selected={selectedSeason?.seasonNumber === season.seasonNumber}
                              className={selectedSeason?.seasonNumber === season.seasonNumber ? "active" : ""}
                              onClick={() => setSelectedSeasonByTitle((current) => ({ ...current, [selectedTitle.watchmodeId as number]: season.seasonNumber }))}
                            >
                              Season {season.seasonNumber}
                            </button>
                          ))}
                        </div>
                        {selectedSeason && (
                          <div className="seasonPanel" role="tabpanel">
                            <div className="seasonSummary">
                              <strong>Season {selectedSeason.seasonNumber}</strong>
                              <span>{selectedSeason.episodeCount} episodes · {selectedSeason.availableEpisodeCount} with {country} availability</span>
                            </div>
                            {selectedSeason.providers.length > 0 ? (
                              <div className="seasonProviders">
                                {selectedSeason.providers.map((coverage) => {
                                  const provider = getProvider(coverage.provider, providerDirectory);
                                  const matchingOffer = selectedTitle.offers.find((item) => item.provider === coverage.provider && item.type === coverage.type)
                                    ?? selectedTitle.offers.find((item) => item.provider === coverage.provider);
                                  const content = <>
                                    <ProviderMark provider={provider} variant="badge" />
                                    <span><strong>{providerBrand(coverage.provider)}</strong><small>{providerHost(coverage.provider) ? `Via ${providerHost(coverage.provider)} · ` : ""}{coverage.episodeCount === selectedSeason.episodeCount ? `All ${coverage.episodeCount} episodes` : `${coverage.episodeCount} of ${selectedSeason.episodeCount} episodes`}</small></span>
                                    <b className={`pricePill ${coverage.type}`}>{seasonOfferLabel(coverage.type)}</b>
                                  </>;
                                  return matchingOffer?.url ? (
                                    <a className="seasonProvider" href={matchingOffer.url} target="_blank" rel="noreferrer" key={`${coverage.provider}-${coverage.type}`}>{content}</a>
                                  ) : (
                                    <div className="seasonProvider" key={`${coverage.provider}-${coverage.type}`}>{content}</div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="creditsUnavailable">No {activeCountry.name} streaming coverage is listed for this season.</p>
                            )}
                            <p className="seasonNote">Availability is grouped by episode. Episode-specific watch links require a paid Watchmode plan.</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="creditsUnavailable">Season-level availability is not listed for this series.</p>
                    )}
                  </div>
                )}
                {selectedTitle.live && selectedTitle.watchmodeId && (
                  <div className="creditsSection">
                    <div className="detailSectionHeading">
                      <h3>Cast and creators</h3>
                      {typeof selectedTitle.popularityPercentile === "number" && (
                        <span>Top {Math.max(1, 100 - selectedTitle.popularityPercentile)}% in popularity</span>
                      )}
                    </div>
                    {creditsLoadingId === selectedTitle.watchmodeId ? (
                      <div className="creditsLoading" aria-label="Loading cast and creators"><span /><span /><span /></div>
                    ) : credits.length > 0 ? (
                      <div className="creditList">
                        {visibleCredits.map((credit) => (
                          <span className="creditPill" key={`${credit.type}-${credit.personId}-${credit.role}`}>
                            <span
                              className={`creditPhoto ${credit.photoUrl ? "hasPhoto" : ""}`}
                              style={credit.photoUrl ? { backgroundImage: `url(${credit.photoUrl})` } : undefined}
                              aria-hidden="true"
                            >
                              {!credit.photoUrl && credit.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                            </span>
                            <span className="creditCopy"><strong>{credit.name}</strong><small>{credit.role}</small></span>
                          </span>
                        ))}
                        {orderedCredits.length > 6 && selectedTitle.watchmodeId && (
                          <button
                            className="creditsToggle"
                            type="button"
                            aria-expanded={creditsExpanded}
                            onClick={() => {
                              const titleId = selectedTitle.watchmodeId as number;
                              setExpandedCreditTitles((current) => {
                                const next = new Set(current);
                                if (next.has(titleId)) next.delete(titleId);
                                else next.add(titleId);
                                return next;
                              });
                            }}
                          >
                            {creditsExpanded ? "Show less" : `View ${orderedCredits.length - 6} more`}
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="creditsUnavailable">Cast details are not available for this title.</p>
                    )}
                  </div>
                )}
                {selectedTitle.live && selectedTitle.watchmodeId && hasSimilarTitles && (similarLoadingId === selectedTitle.watchmodeId || similarTitles.length > 0) && (
                  <div className="similarSection">
                    <div className="detailSectionHeading">
                      <h3>More like this</h3>
                      <span>Picked from related titles</span>
                    </div>
                    {similarLoadingId === selectedTitle.watchmodeId ? (
                      <div className="similarLoading" aria-label="Loading similar titles">
                        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
                      </div>
                    ) : (
                      <div className="similarGrid">
                        {similarTitles.map((item) => {
                          const artwork = item.posterUrl ?? item.backdropUrl;
                          return (
                            <button
                              type="button"
                              className="similarCard"
                              onClick={handleSimilarTitleClick}
                              data-title={item.title}
                              data-watchmode-id={item.watchmodeId}
                              key={item.watchmodeId}
                              aria-label={`Find where to watch ${item.title}`}
                            >
                              <span className="similarPoster" style={artwork ? { backgroundImage: `url(${artwork})` } : undefined}>
                                {item.score > 0 && <small>{item.score}%</small>}
                              </span>
                              <span className="similarCopy">
                                <strong>{item.title}</strong>
                                <small>{item.year} · {item.mediaType === "movie" ? "Movie" : "Series"}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {offer ? (
                  <>
                    <div className={`bestBanner ${offer.type}`}>
                      <span>Best option for you</span>
                      <strong>{offerLabel(offer)} on {offer.provider}</strong>
                    </div>
                    <div className="offerHeading"><h3>Every way to watch</h3><span>{activeCountry.name}</span></div>
                    <div className="offerList">
                      {orderedOffers.map((item, index) => {
                        const provider = getProvider(item.provider, providerDirectory);
                        const contents = (
                          <>
                            <ProviderMark provider={provider} />
                            <span className="offerProvider"><strong>{providerBrand(item.provider)}</strong><small>{providerHost(item.provider) ? `Via ${providerHost(item.provider)} · ` : ""}{item.quality} · {index === 0 ? "Best value" : "Alternate option"}</small></span>
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
                  </>
                ) : (
                  <div className="releaseTrackingCard">
                    <span className="releaseTrackingIcon" aria-hidden="true"><BellIcon /></span>
                    <div>
                      <span>Release tracking</span>
                      <strong>{selectedTitle.releaseDate ? `Expected ${formatAlertDate(selectedTitle.releaseDate, "long")}` : "Streaming date not announced"}</strong>
                      <p>Save this title and Stream Find will check TMDB for regional releases and upcoming episodes.</p>
                    </div>
                  </div>
                )}
                <button className={`detailSave ${saved ? "saved" : ""}`} type="button" aria-pressed={saved} onClick={() => toggleWatchlist(selectedTitle)}><BookmarkIcon filled={saved} /> {saved ? "Saved to watchlist" : "Save to watchlist"}</button>
              </div>
            </ModalDialog>
          </div>
        );
      })()}

      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite"><CheckIcon /> {toast}</div>
    </main>
  );
}

async function syncReleaseNotifications(userId: string, alerts: ReleaseAlert[], titles: Title[]) {
  await Promise.all(alerts.map(async (alert) => {
    const safeKey = `${alert.titleId}-${alert.kind}-${alert.date}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const reference = doc(firestore, "users", userId, "notifications", `release-${safeKey}`);
    if ((await getDoc(reference)).exists()) return;
    await setDoc(reference, {
      type: "release_alert",
      toUid: userId,
      sourceId: safeKey,
      heading: `${alert.title}: ${alert.label}`,
      body: alert.detail,
      href: titlePath(titles.find((title) => title.id === alert.titleId) ?? { title: alert.title }) ?? "/?view=watchlist",
      titleId: alert.titleId,
      createdAt: serverTimestamp(),
    });
  }));
}

function formatTrackingTime(timestamp: number) {
  const value = new Date(timestamp);
  const today = new Date();
  const sameDay = value.getFullYear() === today.getFullYear()
    && value.getMonth() === today.getMonth()
    && value.getDate() === today.getDate();
  return new Intl.DateTimeFormat("en-US", sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(value);
}

function LinkLogo() {
  return <span className="brand"><span className="brandMark" aria-hidden="true"><span /></span><span>Stream Find</span></span>;
}
