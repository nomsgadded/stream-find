import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function moduleUrl(name) {
  let source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  for (const match of source.matchAll(/from "@\/lib\/([^"\n]+)"/g)) source = source.replace(`"@/lib/${match[1]}"`, JSON.stringify(await moduleUrl(match[1])));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
async function load(name) { return import(await moduleUrl(name)); }
const { normalizeSearch, parseSearch, searchLookupTerm, searchMatchScore: score } = await load("search-matching");
assert.equal(searchLookupTerm("도깨비 2016"), "도깨비");
assert.equal(searchLookupTerm("1917"), "1917");
assert.equal(normalizeSearch("도깨비"), "도깨비");
assert.equal(normalizeSearch("कहानी"), "कहानी");
const { includedServiceIndex } = await load("offer-priority");
assert.equal(includedServiceIndex("HBO Max", ["Max"]), 0);
assert.equal(includedServiceIndex("Amazon Prime Video", ["Prime Video"]), 0);
assert.equal(includedServiceIndex("Netflix", ["Max"]), -1);
assert.equal(normalizeSearch("Shōgun"), "shogun");
assert.equal(score("Shōgun", "shogun"), 0);
assert.equal(score("Schindler’s List", "Schindlers List"), 0);
assert.equal(score("Spider-Man", "spiderman"), 25);
assert.deepEqual(parseSearch("The Innocent Man 2012"), { term: "the innocent man", year: 2012 });
assert.deepEqual(parseSearch("1917"), { term: "1917", year: undefined });
assert.ok(score("The Innocent Man", "The Innocent Man 2012", 2012) < score("The Innocent Man", "The Innocent Man 2012", 2018));
assert.ok(score("Lottery", "Lottery") < score("The Lottery Ticket", "Lottery"));
assert.ok(score("The Lottery Ticket", "Lottery") < 100);
assert.ok(score("Lottery", "Lotery") < 100);
assert.equal(score("Dune", "Dun"), 10);
assert.equal(score("Dune", "Dunx"), 100);
assert.equal(score("Dive Into You", "you dive into"), 30);
const { rememberSearchAvailability, searchAvailability } = await load("search-availability");
const { suggestionAvailabilityLabel } = await load("search-suggestion-label");
assert.equal(suggestionAvailabilityLabel([{ provider: "Netflix", type: "included" }, { provider: "HBO Max", type: "included" }], ["Max"]), "Included on your HBO Max");
assert.equal(suggestionAvailabilityLabel([{ provider: "Viki", type: "included" }], ["Rakuten Viki"]), "Included on your Viki");
assert.equal(suggestionAvailabilityLabel([{ provider: "Netflix", type: "rent" }], ["Netflix"]), "Rent on Netflix", "Rentals are not labeled included on your service");
const now = Date.now;
try {
  let clock = 1000;
  Date.now = () => clock;
  rememberSearchAvailability([1, 2], "US", [{ provider: "Viki", type: "included" }]);
  assert.equal(suggestionAvailabilityLabel(searchAvailability(2, "US")), "Included on Viki");
  assert.equal(searchAvailability(1, "CA"), undefined);
  assert.equal(suggestionAvailabilityLabel(undefined), undefined);
  assert.equal(suggestionAvailabilityLabel([]), undefined);
  clock += 300_001;
  assert.equal(searchAvailability(1, "US"), undefined);
  for (let id = 10; id < 511; id++) rememberSearchAvailability([id], "US", []);
  assert.equal(searchAvailability(10, "US"), undefined);
  assert.deepEqual(searchAvailability(510, "US"), []);
} finally { Date.now = now; }
console.log("PASS: normalization, title/year ranking, partial/typo matches, regional hints, expiry and bounded cache");
