const WATCHMODE_API = "https://api.watchmode.com/v1";

type WatchmodeSource = {
  id?: number;
  name?: string | null;
  type?: string | null;
  logo_100px?: string | null;
  regions?: string[] | null;
};

type Provider = {
  id: number;
  name: string;
  logo?: string;
  type: "subscription" | "free" | "tv";
};

const featuredOrder = [
  "Netflix",
  "HBO Max",
  "Disney+",
  "Prime Video",
  "Apple TV+",
  "Hulu",
  "Peacock",
  "Paramount+",
  "Tubi",
  "Pluto TV",
  "Roku Channel",
  "Crunchyroll",
  "Rakuten Viki",
  "YouTube TV",
];

export async function GET(request: Request) {
  const region = normalizeRegion(new URL(request.url).searchParams.get("region"));
  const apiKey = process.env.WATCHMODE_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "Streaming services are not configured." }, { status: 503 });
  }

  try {
    const url = new URL(`${WATCHMODE_API}/sources/`);
    url.searchParams.set("apiKey", apiKey);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return Response.json({ error: "Streaming services are temporarily unavailable." }, { status: 502 });
    }

    const sources = await response.json() as WatchmodeSource[];
    const providers = new Map<string, Provider>();

    for (const source of sources) {
      const id = source.id;
      const name = normalizeProvider(source.name);
      const type = normalizeType(source.type);
      if (!id || !name || !type || !source.regions?.includes(region)) continue;

      const logo = safeUrl(source.logo_100px);
      const existing = providers.get(name);
      if (!existing || (!existing.logo && logo)) {
        providers.set(name, { id, name, type, ...(logo ? { logo } : {}) });
      }
    }

    const featuredIndex = new Map(featuredOrder.map((name, index) => [name, index]));
    const ordered = [...providers.values()].sort((a, b) => {
      const aIndex = featuredIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = featuredIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex || a.name.localeCompare(b.name);
    });

    return Response.json(
      { providers: ordered, region },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ error: "Streaming services are temporarily unavailable." }, { status: 502 });
  }
}

function normalizeRegion(value: string | null) {
  return value && /^[A-Z]{2}$/i.test(value) ? value.toUpperCase() : "US";
}

function normalizeType(type?: string | null): Provider["type"] | null {
  if (type === "sub") return "subscription";
  if (type === "free") return "free";
  if (type === "tve") return "tv";
  return null;
}

function normalizeProvider(name?: string | null) {
  if (!name) return null;
  const normalized = name.trim();
  const aliases: Record<string, string> = {
    "Amazon Prime": "Prime Video",
    "Amazon Prime Video": "Prime Video",
    "AppleTV+": "Apple TV+",
    "HBO MAX": "HBO Max",
    "Max": "HBO Max",
    "Paramount Plus": "Paramount+",
    "Tubi TV": "Tubi",
    "The Roku Channel": "Roku Channel",
    "Viki": "Rakuten Viki",
    "Viki Pass": "Rakuten Viki",
    "Youtube TV": "YouTube TV",
    "YouTubeTV": "YouTube TV",
  };
  return aliases[normalized] ?? normalized;
}

function safeUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
