import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../lib/recent-searches.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseRecentSearches: parse, rememberSearch, removeRecentSearch, clearRecentSearches, recentSearchSnapshot, subscribeRecentSearches } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const previousWindow = globalThis.window;
const target = new EventTarget();
let stored = "[]";
globalThis.window = {
  localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } },
  addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target),
};
try {
  assert.deepEqual(parse("broken"), []);
  assert.deepEqual(parse('{}'), []);
  assert.deepEqual(parse(JSON.stringify([null, { query: 2, mode: "screen" }, { query: "abc", mode: "invalid" }, { query: " ", mode: "screen" }])), []);
  let updates = 0;
  const unsubscribe = subscribeRecentSearches(() => updates++);
  rememberSearch("  Lottery  ", "screen");
  rememberSearch("lottery", "screen");
  assert.deepEqual(parse(stored), [{ query: "lottery", mode: "screen" }]);
  rememberSearch("Lottery", "music");
  assert.equal(parse(stored).length, 2);
  removeRecentSearch("lottery", "screen");
  assert.deepEqual(parse(stored), [{ query: "Lottery", mode: "music" }]);
  rememberSearch("Dune", "screen");
  clearRecentSearches("screen");
  assert.deepEqual(parse(stored), [{ query: "Lottery", mode: "music" }]);
  for (let i = 0; i < 10; i++) rememberSearch(`Title ${i}`, "screen");
  assert.equal(parse(stored).length, 8);
  assert.equal(parse(stored)[0].query, "Title 9");
  assert.ok(updates > 0);
  unsubscribe();
  const count = updates;
  rememberSearch("Another", "screen");
  assert.equal(updates, count);
  window.localStorage.getItem = () => { throw new Error("Blocked"); };
  window.localStorage.setItem = () => { throw new Error("Blocked"); };
  assert.equal(recentSearchSnapshot(), "[]");
  assert.doesNotThrow(() => rememberSearch("Dune", "screen"));
} finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
console.log("PASS: recent searches validation, mode separation, deduplication, ordering, removal, clear, limit, updates and blocked storage");
