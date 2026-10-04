import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const modules = new Map();
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path);
  let source = await readFile(new URL(`../${path}.ts`, import.meta.url), "utf8");
  for (const match of source.matchAll(/from "@\/([^"\n]+)"/g)) {
    source = source.replace(`"@/${match[1]}"`, JSON.stringify(await moduleUrl(match[1])));
  }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(path, url);
  return url;
}
const { GET: search } = await import(await moduleUrl("app/api/search/route"));
const { GET: autocomplete } = await import(await moduleUrl("app/api/autocomplete/route"));
const oldFetch = globalThis.fetch;
const oldKey = process.env.WATCHMODE_API_KEY;
const oldToken = process.env.TMDB_ACCESS_TOKEN;
delete process.env.TMDB_ACCESS_TOKEN;
let catalogResults = [];
let mappedMatches = [];
let providerResults = {};
let matches = [];
let suggestions = [];
let failedSearch = false;
let failedDetails = false;
const calls = [];
const request = (route, query) => route(new Request(`https://example.test/api/search?${query}`));
try {
  process.env.WATCHMODE_API_KEY = "test-key";
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    if (url.hostname === "api.themoviedb.org") {
      assert.equal(options.headers.Authorization, "Bearer test-token");
      if (url.pathname.endsWith("/watch/providers")) return Response.json({ results: providerResults });
      return Response.json({ results: catalogResults });
    }
    assert.equal(url.searchParams.has("apiKey"), false);
    assert.equal(options.headers["X-API-Key"], "test-key");
    assert.ok(options.signal);
    if (url.pathname.endsWith("/search/")) return Response.json({ title_results: url.searchParams.get("search_field")?.startsWith("tmdb_") ? mappedMatches : matches }, { status: failedSearch ? 429 : 200 });
    if (url.pathname.endsWith("/autocomplete-search/")) return Response.json({ results: suggestions }, { status: failedSearch ? 429 : 200 });
    const id = Number(url.pathname.match(/title\/(\d+)\//)?.[1]);
    const item = [...matches, ...suggestions, ...mappedMatches].find((candidate) => candidate.id === id);
    return Response.json({ id, title: item?.name, type: item?.type, year: item?.year, tmdb_id: item?.tmdb_id, poster: "https://example.test/poster.jpg", plot_overview: "A real synopsis.", sources: [] }, { status: failedDetails ? 502 : 200 });
  };
  matches = [
    { id: 1, name: "The Lottery Ticket", year: 2010, type: "movie", tmdb_id: 1 },
    { id: 2, name: "Lottery", year: 2024, type: "movie", tmdb_id: 2 },
    { id: 3, name: "Lottery", year: 2024, type: "movie", tmdb_id: 2 },
    { id: 4, name: "Lottery", year: 1999, type: "movie", tmdb_id: 4 },
  ];
  suggestions = [{ id: 5, name: "Lottery Actor", result_type: "person" }];
  const data = await (await request(search, "q=Lottery&region=CA")).json();
  assert.equal(data.region, "CA");
  assert.equal(data.titles.length, 3, "Aliases merge; remakes stay distinct; people excluded");
  assert.equal(data.titles[0].title, "Lottery");
  assert.ok(data.titles.some((item) => item.title === "The Lottery Ticket"));
  assert.equal((await request(search, "q=M&id=1&region=CA")).status, 200, "Exact catalog links support short titles");
  assert.ok(calls.filter((url) => url.pathname.includes("/details/")).every((url) => url.searchParams.get("regions") === "CA"));
  suggestions = matches.map((item) => ({ ...item, result_type: "title", image_url: "https://example.test/poster.jpg" }));
  const suggested = await (await request(autocomplete, "q=Lottery%201999&region=CA")).json();
  assert.equal(suggested.results[0].year, 1999);
  assert.equal(suggested.results.length, 3);
  assert.ok(calls.at(-1).searchParams.get("search_value") === "lottery", "Year used for ranking, not title lookup");
  failedDetails = true;
  assert.equal((await request(search, "q=Lottery")).status, 502, "Upstream failure is not a false empty result");
  failedDetails = false;
  failedSearch = true;
  assert.equal((await request(search, "q=Lottery")).status, 429);
  assert.equal((await request(autocomplete, "q=Lottery")).status, 429);
  failedSearch = false;
  matches = []; suggestions = [];
  const empty = await request(search, "q=Unknown");
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).titles, []);
  const before = calls.length;
  assert.deepEqual(await (await request(autocomplete, "q=ab")).json(), { results: [] });
  assert.equal(calls.length, before, "Short input avoids catalog requests");
  assert.equal((await request(autocomplete, `q=${"a".repeat(81)}`)).status, 400);
  assert.equal((await request(search, "q=Lottery&page=-1")).status, 400);
  matches = Array.from({ length: 14 }, (_, index) => ({ id: index + 100, name: `Lottery ${index}`, year: 2000 + index, type: "movie", tmdb_id: index + 100 }));
  const first = await (await request(search, "q=Lottery")).json();
  const second = await (await request(search, "q=Lottery&page=2")).json();
  assert.equal(first.titles.length, 12);
  assert.equal(first.nextPage, 2);
  assert.equal(first.remainingCount, 2, "Remaining count uses distinct matching titles after grouping aliases");
  assert.equal(second.titles.length, 2);
  assert.equal(second.nextPage, null);
  assert.equal(second.remainingCount, 0);
  assert.equal(new Set([...first.titles, ...second.titles].map((item) => item.id)).size, 14);
  process.env.TMDB_ACCESS_TOKEN = "test-token";
  matches = []; suggestions = [];
  catalogResults = [{ id: 21, name: "Guardian", original_name: "도깨비", media_type: "tv", first_air_date: "2016-12-02", overview: "An immortal guardian.", poster_path: "/guardian.jpg" }];
  const alternate = await (await request(search, `q=${encodeURIComponent("도깨비")}`)).json();
  assert.equal(alternate.titles[0].tmdbId, 21);
  assert.equal(alternate.titles[0].availabilityKnown, false);
  assert.equal(alternate.titles[0].mediaType, "show");
  assert.equal(alternate.titles[0].watchmodeId, undefined);
  assert.equal(alternate.titles[0].id, -1_000_000_021, "Fallback keeps the existing title-page/watchlist identity");
  const suggestion = await (await request(autocomplete, `q=${encodeURIComponent("도깨비")}`)).json();
  assert.equal(suggestion.results[0].id, -2_000_000_021);
  assert.equal(suggestion.results[0].tmdbId, 21);
  mappedMatches = [{ id: 701, name: "Guardian", year: 2016, type: "tv_series", tmdb_id: 21 }];
  const resolved = await (await request(search, "q=Guardian%20alternate")).json();
  assert.equal(resolved.titles[0].watchmodeId, 701, "Alternate title maps to exact Watchmode identity");
  matches = mappedMatches;
  const beforeMerge = calls.length;
  const merged = await (await request(search, "q=Guardian%20another")).json();
  assert.equal(merged.titles.length, 1);
  assert.equal(calls.slice(beforeMerge).some((url) => url.searchParams.get("search_field")?.startsWith("tmdb_")), false, "Known identity avoids an extra paid mapping request");
  matches = [{ id: 702, name: "Viki Drama", year: 2024, type: "tv_series", tmdb_id: 22 }];
  catalogResults = [{ id: 22, name: "Viki Drama", media_type: "tv", first_air_date: "2024-01-01" }];
  providerResults = { US: { flatrate: [{ provider_name: "Rakuten Viki" }] } };
  const viki = await (await request(search, "q=Viki%20Drama")).json();
  assert.equal(viki.titles[0].offers[0].provider, "Rakuten Viki");
  assert.ok((viki.titles[0].watchmodeIds ?? []).every((id) => id > 0), "Hint caching does not alter catalog identity arrays");
} finally {
  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.WATCHMODE_API_KEY; else process.env.WATCHMODE_API_KEY = oldKey;
  if (oldToken === undefined) delete process.env.TMDB_ACCESS_TOKEN; else process.env.TMDB_ACCESS_TOKEN = oldToken;
}
console.log("PASS: real search routes—partial matches, identities/remakes, country, year ranking, errors, empty results, short input and pagination");
