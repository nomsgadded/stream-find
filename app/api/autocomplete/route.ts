import { groupTitleRecords } from "@/lib/title-records";
import { parseSearch, searchMatchScore } from "@/lib/search-matching";
import { searchAvailability } from "@/lib/search-availability";
import { searchCatalog } from "@/lib/search-catalog";

const WATCHMODE_API = "https://api.watchmode.com/v1";
const MAX_RESULTS = 6;

type WatchmodeAutocompleteResult = {
  id?: number;
  image_url?: string | null;
  name?: string | null;
  result_type?: string | null;
  type?: string | null;
  year?: number | null;
  tmdb_id?: number;
  imdb_id?: string;
};

type WatchmodeAutocompleteResponse = {
  results?: WatchmodeAutocompleteResult[];
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  const regionValue = requestUrl.searchParams.get("region") ?? "US";
  const region = /^[a-z]{2}$/i.test(regionValue) ? regionValue.toUpperCase() : "US";

  if (query.length < 3) return Response.json({ results: [] });

  if (query.length > 80) {
    return Response.json({ error: "Enter no more than 80 characters." }, { status: 400 });
  }

  const apiKey = process.env.WATCHMODE_API_KEY;
  if (typeof apiKey !== "string" || !apiKey) {
    return Response.json({ error: "Live title suggestions are not configured." }, { status: 503 });
  }

  try {
    const autocompleteUrl = new URL(`${WATCHMODE_API}/autocomplete-search/`);
    autocompleteUrl.searchParams.set("search_value", parseSearch(query).term || query);
    autocompleteUrl.searchParams.set("search_type", "2");

    const [watchmode, catalog] = await Promise.allSettled([
      fetch(autocompleteUrl, { headers: { Accept: "application/json", "X-API-Key": apiKey }, signal: AbortSignal.timeout(6000) }),
      searchCatalog(query),
    ]);
    const extra = catalog.status === "fulfilled" ? catalog.value : [];
    const response = watchmode.status === "fulfilled" ? watchmode.value : null;
    if ((!response || !response.ok) && !extra.length) {
      return Response.json(
        { error: response?.status === 429 ? "Title suggestions are busy. Try again shortly." : "Title suggestions are temporarily unavailable." },
        { status: response?.status === 429 ? 429 : 502 },
      );
    }

    const data = response?.ok ? await response.json() as WatchmodeAutocompleteResponse : { results: [] };
    const candidates = (data.results ?? [])
      .filter((result) => result.result_type === "title" || (!result.result_type && result.type !== "person" && typeof result.id === "number"))
      .flatMap((result) => {
        const id = result.id;
        const title = result.name?.trim();
        if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || !title) return [];

        const imageUrl = safeUrl(result.image_url);
        return [{
          id,
          title,
          ...(typeof result.year === "number" ? { year: result.year } : {}),
          mediaType: result.type?.includes("movie") ? "movie" as const : "show" as const,
          ...(imageUrl ? { imageUrl } : {}),
          ...(result.tmdb_id ? { tmdbId: result.tmdb_id } : {}),
          ...(result.imdb_id ? { imdbId: result.imdb_id } : {}),
        }];
      });
    const results = groupTitleRecords([...candidates, ...extra]).map((group) => {
      const preferred = group.find((item) => item.id > 0 && item.imageUrl) ?? group.find((item) => item.id > 0) ?? group[0];
      const image = group.find((item) => item.imageUrl)?.imageUrl;
      return { ...preferred, ...(image ? { imageUrl: image } : {}) };
    })
      .sort((a, b) => searchMatchScore(a.title, query, a.year) - searchMatchScore(b.title, query, b.year))
      .slice(0, MAX_RESULTS).map((item) => ({ ...item, ...(searchAvailability(item.id, region) ? { availability: searchAvailability(item.id, region) } : {}) }));

    return Response.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
    );
  } catch {
    return Response.json({ error: "Title suggestions are temporarily unavailable." }, { status: 502 });
  }
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
