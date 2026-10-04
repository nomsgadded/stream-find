import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const declaration = source.match(/const resultHeading = [\s\S]*?;\n/)[0];
const heading = new Function("searchMode", "activeView", "submittedQuery", "liveStatus", "musicStatus", "filteredTitles", "filteredMusicVideos", `${declaration} return resultHeading;`);
const screen = (count, status = "ready", view = "search") => heading("screen", view, "Dive", status, "idle", Array(count), []);
assert.equal(screen(12), "12 live results for “Dive”");
assert.equal(screen(1), "1 live result for “Dive”");
assert.equal(screen(0), "0 live results for “Dive”");
assert.equal(screen(12, "loading"), "Searching across services…");
assert.equal(screen(0, "error"), "Live results for “Dive”", "Failed searches do not claim zero matching titles");
assert.equal(screen(12, "ready", "watchlist"), "Your watchlist");
assert.equal(heading("music", "search", "Dive", "idle", "ready", [], Array(1)), "1 music video for “Dive”");
assert.equal(heading("music", "search", "Dive", "idle", "ready", [], Array(5)), "5 music videos for “Dive”");
assert.ok(source.includes('const isSearchResults = Boolean(submittedQuery) && activeView !== "watchlist";'));
assert.equal((source.match(/!isSearchResults && <p className="resultCount"/g) ?? []).length, 2, "Search count is consolidated in the heading in both modes");
console.log("PASS: filtered search counts, singular/plural, loading/error headings, music and watchlist separation");
