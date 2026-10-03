import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const expression = source.match(/disabled=\{(query\.trim\(\)\.length < 3[^}]+)\}/)?.[1];
assert.ok(expression, "Search button has a minimum-length guard");
const disabled = new Function("query", "searchMode", "musicStatus", "liveStatus", `return ${expression}`);
for (const mode of ["screen", "music"]) {
  for (const query of ["", " ", "a", "ab", "  ab  "]) assert.equal(disabled(query, mode, "idle", "idle"), true);
  for (const query of ["abc", " abc ", "Lottery"]) assert.equal(disabled(query, mode, "idle", "idle"), false);
  assert.equal(disabled("abc", mode, "loading", "loading"), true);
}
assert.ok(source.includes('if (query.trim().length < 3 || (searchMode === "music" ? musicStatus : liveStatus) === "loading") return;'), "Enter submission uses the same guard");
assert.ok(source.includes('aria-label="Clear search"'), "Clear control has an accessible label");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(css, /button\[type="submit"\]:not\(:disabled\) \{ background: var\(--amber\)/);
console.log("PASS: empty, whitespace, one/two/three characters, both search modes, loading, Enter guard, clear label and active yellow styling");
