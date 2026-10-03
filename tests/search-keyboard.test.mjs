import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

for (const [path, name, indexName, listName] of [
  ["app/page.tsx", "handleSearchKeyDown", "autocompleteIndex", "autocompleteResults"],
  ["components/GlobalSearch.tsx", "onKeyDown", "activeIndex", "results"],
]) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const handler = source.match(new RegExp(`const ${name} = [\\s\\S]*?\\n  };`))?.[0];
  assert.ok(handler);
  const js = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const titles = [{ id: 1, title: "Lottery" }, { id: 2, title: "Lottery Ticket" }];
  let selected = null;
  let nextIndex = -1;
  const setIndex = (update) => { nextIndex = typeof update === "function" ? update(nextIndex) : update; };
  const make = new Function(indexName, listName, "autocompleteOpen", "setAutocompleteOpen", "setAutocompleteIndex", "setActiveIndex", "setSuggestionStatus", "chooseSuggestion", "openResult", `${js}; return ${name}`);
  const run = (key, index) => {
    selected = null; nextIndex = index;
    const handler = make(index, titles, true, () => {}, setIndex, setIndex, () => {}, (title, id) => { selected = { title, id }; }, (result) => { selected = result; });
    let prevented = false;
    handler({ key, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(run("Enter", -1), false, "Plain Enter allows a full query search");
  assert.equal(selected, null);
  assert.equal(run("ArrowDown", -1), true);
  assert.equal(nextIndex, 0);
  assert.equal(run("Enter", 1), true, "Explicit keyboard selection opens an exact title");
  assert.deepEqual(selected, titles[1]);
  assert.equal(run("ArrowUp", 1), true);
  assert.equal(nextIndex, 0);
}
console.log("PASS: real home/global keyboard handlers preserve full-search Enter and explicit suggestion selection");
