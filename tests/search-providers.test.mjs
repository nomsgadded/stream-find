import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(path) {
  let source = await readFile(new URL(`../${path}.ts`, import.meta.url), "utf8");
  for (const match of source.matchAll(/from "@\/([^"\n]+)"/g)) source = source.replace(`"@/${match[1]}"`, JSON.stringify(await moduleUrl(match[1])));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const { catalogProviderOffers, mergeProviderOffers } = await import(await moduleUrl("lib/search-providers"));
const oldFetch = globalThis.fetch, oldToken = process.env.TMDB_ACCESS_TOKEN;
let count = 0, failed = false;
try {
  process.env.TMDB_ACCESS_TOKEN = "test-token";
  globalThis.fetch = async () => {
    count++;
    return Response.json({ results: { US: { link: "https://example.test/watch", flatrate: [{ provider_name: "Rakuten Viki" }, { provider_name: "Max" }] }, CA: { flatrate: [{ provider_name: "Netflix" }] } } }, { status: failed ? 503 : 200 });
  };
  const us = await catalogProviderOffers(1, "show", "US");
  assert.equal(us[0].provider, "Rakuten Viki");
  const previous = count;
  await catalogProviderOffers(1, "show", "US");
  assert.equal(count, previous);
  assert.equal((await catalogProviderOffers(1, "show", "CA"))[0].provider, "Netflix");
  assert.equal(await catalogProviderOffers(1, "show", "GB"), undefined, "Missing country is unknown, never US availability");
  const priced = { provider: "HBO Max", type: "rent", price: 3.99, currency: "USD", quality: "4K", url: "https://example.test/direct" };
  const primary = [priced, { provider: "Viki", type: "included", quality: "HD" }];
  const merged = mergeProviderOffers(primary, [...us, { provider: "Max", type: "rent", quality: "HD" }]);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged[0], priced, "Primary prices and direct links survive reconciliation");
  assert.equal(primary.length, 2, "Inputs are not mutated");
  failed = true;
  assert.equal(await catalogProviderOffers(2, "show", "US"), undefined);
  failed = false;
  assert.equal((await catalogProviderOffers(2, "show", "US"))[0].provider, "Rakuten Viki", "A failed lookup remains retryable");
} finally { globalThis.fetch = oldFetch; if (oldToken === undefined) delete process.env.TMDB_ACCESS_TOKEN; else process.env.TMDB_ACCESS_TOKEN = oldToken; }
console.log("PASS: country-specific providers, Viki, aliases, prices, caching, non-mutation and retryable failures");
