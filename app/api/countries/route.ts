import { regions } from "@/lib/regions";

const WATCHMODE_API = "https://api.watchmode.com/v1";

type WatchmodeSource = {
  regions?: string[] | null;
};

export async function GET() {
  const apiKey = process.env.WATCHMODE_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "Country availability is not configured." }, { status: 503 });
  }

  try {
    const url = new URL(`${WATCHMODE_API}/sources/`);
    url.searchParams.set("apiKey", apiKey);
    const response = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("Watchmode countries unavailable");

    const sources = await response.json() as WatchmodeSource[];
    const availableCodes = new Set(sources.flatMap((source) => source.regions ?? []));
    const countries = regions.filter((region) => availableCodes.has(region.code));

    return Response.json(
      { countries },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ countries: regions.slice(0, 5) });
  }
}
