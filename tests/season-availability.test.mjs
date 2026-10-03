import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the real route without making paid upstream API requests.
const source = await readFile(new URL("../app/api/seasons/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const originalFetch = globalThis.fetch;
const originalKey = process.env.WATCHMODE_API_KEY;
let upstreamStatus = 200;
let upstreamBody = [];
let captured;
const request = (query) => GET(new Request(`https://example.test/api/seasons?${query}`));

try {
  process.env.WATCHMODE_API_KEY = "test-only-key";
  globalThis.fetch = async (url, options) => {
    captured = { url: new URL(url), options };
    return Response.json(upstreamBody, { status: upstreamStatus });
  };
  for (const query of ["", "id=-1", "id=abc", "tmdbId=0", "id=1&tmdbId=2", "id=abc&tmdbId=2"]) {
    assert.equal((await request(query)).status, 400, query);
  }
  upstreamBody = [
    { season_number: 1, episode_number: 1, sources: [
      { name: "Netflix", region: "US", type: "sub" },
      { name: "Netflix", region: "US", type: "sub" },
      { name: "Netflix", region: "CA", type: "sub" },
    ] },
    { season_number: 1, episode_number: 2, sources: [{ name: "Viki", region: "US", type: "free" }] },
    { season_number: 1, episode_number: 3, sources: [] },
    { season_number: 0, episode_number: 1, sources: [] },
    { season_number: 2, episode_number: 1, sources: [] },
  ];
  const result = await request("tmdbId=1396&region=us");
  assert.equal(result.status, 200);
  assert.equal(captured.url.pathname, "/v1/title/tv-1396/episodes/");
  assert.equal(captured.url.searchParams.get("regions"), "US");
  assert.equal(captured.url.searchParams.has("apiKey"), false);
  assert.equal(captured.options.headers["X-API-Key"], "test-only-key");
  const data = await result.json();
  assert.equal(data.seasons.length, 2);
  assert.equal(data.seasons[0].episodeCount, 3);
  assert.equal(data.seasons[0].availableEpisodeCount, 2);
  assert.deepEqual(data.seasons[0].providers, [
    { provider: "Netflix", type: "included", episodeCount: 1 },
    { provider: "Rakuten Viki", type: "free", episodeCount: 1 },
  ]);
  assert.deepEqual(data.seasons[1].providers, []);
  const ca = await (await request("id=123&region=CA")).json();
  assert.equal(captured.url.pathname, "/v1/title/123/episodes/");
  assert.equal(ca.seasons[0].availableEpisodeCount, 1);
  assert.equal(ca.seasons[0].providers.length, 1);
  upstreamBody = [];
  assert.deepEqual((await (await request("id=123")).json()).seasons, []);
  for (const status of [404, 429, 500]) {
    upstreamStatus = status;
    assert.equal((await request("id=123")).status, status === 500 ? 502 : status);
  }
  upstreamStatus = 200;
  upstreamBody = { invalid: true };
  assert.equal((await request("id=123")).status, 502);
  globalThis.fetch = async () => { throw new Error("Network failure"); };
  assert.equal((await request("id=123")).status, 502);
  delete process.env.WATCHMODE_API_KEY;
  assert.equal((await request("id=123")).status, 503);
  console.log("PASS: identity validation, exact TMDB and Watchmode IDs, country filtering, deduplication, partial coverage, aliases, empty data, errors and missing configuration");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.WATCHMODE_API_KEY;
  else process.env.WATCHMODE_API_KEY = originalKey;
}
