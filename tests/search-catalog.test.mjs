import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(path) {
  let source = await readFile(new URL(`../${path}.ts`, import.meta.url), "utf8");
  for (const match of source.matchAll(/from "@\/([^"\n]+)"/g)) source = source.replace(`"@/${match[1]}"`, JSON.stringify(await moduleUrl(match[1])));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const { searchCatalog, typoRetrievalQueries } = await import(await moduleUrl("lib/search-catalog"));
const oldFetch = globalThis.fetch;
const oldToken = process.env.TMDB_ACCESS_TOKEN;
const queries = [];
let fail = false;
const movie = { id: 1, title: "Lottery", original_title: "Lottery", media_type: "movie", release_date: "2024-01-01", poster_path: "/lottery.jpg" };
try {
  process.env.TMDB_ACCESS_TOKEN = "test-token";
  globalThis.fetch = async (input, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-token");
    const url = new URL(input);
    assert.equal(url.searchParams.get("include_adult"), "false");
    const query = url.searchParams.get("query").toLowerCase(); queries.push(query);
    if (fail) return Response.json({}, { status: 503 });
    const results = query === "lot" ? [movie, { ...movie, id: 2, title: "Lost", original_title: "Lost" }, { ...movie, id: 3, media_type: "person" }]
      : query === "into you" ? [{ ...movie, id: 4, media_type: "tv", name: "Dive Into You", title: undefined, original_title: undefined, original_name: "Dive Into You" }]
      : query === "도깨비" ? [{ ...movie, id: 5, title: "Guardian: The Lonely and Great God", original_title: "도깨비" }]
      : [];
    return Response.json({ results });
  };
  assert.ok(typoRetrievalQueries("lotery").includes("lot"));
  assert.deepEqual(typoRetrievalQueries("도깨비"), [], "Do not guess romanized Korean corrections");
  assert.deepEqual(typoRetrievalQueries("It"), []);
  const corrected = await searchCatalog("Lotery");
  assert.equal(corrected.length, 1);
  assert.equal(corrected[0].title, "Lottery");
  assert.equal(corrected[0].corrected, true);
  const count = queries.length;
  await searchCatalog("Lotery");
  assert.equal(queries.length, count, "Repeat retrieval is cached");
  const phrase = await searchCatalog("Dvie into you");
  assert.equal(phrase[0].title, "Dive Into You");
  assert.equal(phrase[0].mediaType, "show");
  const translated = await searchCatalog("도깨비");
  assert.equal(translated[0].originalTitle, "도깨비");
  assert.equal(translated[0].corrected, undefined, "Alternate names are not labeled as spelling errors");
  fail = true;
  await assert.rejects(() => searchCatalog("Unique unavailable title"));
  fail = false;
  const before = queries.length;
  await searchCatalog("Unique unavailable title");
  assert.ok(queries.length > before, "Failures are not cached as empty searches");
  delete process.env.TMDB_ACCESS_TOKEN;
  assert.deepEqual(await searchCatalog("No token"), []);
} finally {
  globalThis.fetch = oldFetch;
  if (oldToken === undefined) delete process.env.TMDB_ACCESS_TOKEN; else process.env.TMDB_ACCESS_TOKEN = oldToken;
}
console.log("PASS: actual typo retrieval, alternate names, bounded retries, conservative candidates, caching, failures and optional configuration");
