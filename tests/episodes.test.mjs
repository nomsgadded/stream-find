import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const encode = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const source = await readFile(new URL("../app/api/episodes/route.ts", import.meta.url), "utf8");
const {GET} = await import(encode(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText));
const oldFetch = globalThis.fetch;
const oldToken = process.env.TMDB_ACCESS_TOKEN;
let upstream = { seasons: [{season_number: 2, name: "Season 2", episode_count: 8}, {season_number: 0, name: "Specials", episode_count: 1}, {season_number: 1, episode_count: 10}] };
let status = 200;
let calls = [];
const get = (query) => GET(new Request(`https://streamfind.test/api/episodes?${query}`));
try {
  process.env.TMDB_ACCESS_TOKEN = "test-token";
  globalThis.fetch = async (url, options) => { calls.push(url); assert.equal(options.headers.Authorization, "Bearer test-token"); assert.equal(options.next.revalidate, 3600); return new Response(JSON.stringify(upstream), {status}); };
  for (const query of ["", "id=-1", "id=1&season=-1", "id=1&season=1.5", "id=1&season=", "id=1&season=1001"]) assert.equal((await get(query)).status, 400);
  assert.equal(calls.length, 0);
  let response = await get("id=123");
  assert.deepEqual((await response.json()).seasons.map(item => item.seasonNumber), [0,1,2]);
  assert.equal(calls.at(-1), "https://api.themoviedb.org/3/tv/123?language=en-US");
  upstream = {episodes: [
    {episode_number: 3, name: "Third", vote_average: 10, vote_count: 0, still_path: "/good.jpg"},
    {episode_number: 1, name: "First", vote_average: 8.75, vote_count: 123, runtime: 43, overview: "Spoiler", air_date: "2026-01-01"},
    {episode_number: 2, vote_average: 20, vote_count: 2, still_path: "//unsafe", runtime: -1},
    {episode_number: null},
  ]};
  response = await get("id=123&season=0");
  const data = await response.json();
  assert.equal(data.source, "TMDB");
  assert.equal(data.seasonNumber, 0);
  assert.deepEqual(data.episodes.map(item => item.episodeNumber), [1,2,3]);
  assert.equal(data.episodes[0].rating, 8.75);
  assert.equal(data.episodes[0].voteCount, 123);
  assert.equal(data.episodes[1].rating, null);
  assert.equal(data.episodes[1].stillUrl, null);
  assert.equal(data.episodes[1].runtime, null);
  assert.equal(data.episodes[2].rating, null, "Zero votes never becomes a zero score");
  assert.equal(data.episodes[2].stillUrl, "https://image.tmdb.org/t/p/w500/good.jpg");
  status = 404; assert.equal((await get("id=123&season=2")).status, 404);
  status = 429; assert.equal((await get("id=123&season=2")).status, 502);
  status = 200; upstream = {}; assert.equal((await get("id=123&season=2")).status, 502);
  globalThis.fetch = async () => { throw new Error("timeout"); }; assert.equal((await get("id=123")).status, 502);
  delete process.env.TMDB_ACCESS_TOKEN; assert.equal((await get("id=123")).status, 503);
} finally { globalThis.fetch = oldFetch; if (oldToken === undefined) delete process.env.TMDB_ACCESS_TOKEN; else process.env.TMDB_ACCESS_TOKEN = oldToken; }

const hooksUrl = encode(`export const state=[]; let index=0; export function reset() { index=0; } export function useState(initial) { const id=index++; return [id in state ? state[id] : initial, value => state[id] = typeof value === 'function' ? value(state[id]) : value]; } export function useEffect() {}`);
const hooks = await import(hooksUrl);
const jsxUrl = encode(`export const Fragment='fragment'; export function jsx(type,props) {return {type,props};} export const jsxs=jsx;`);
const stubUrl = encode(`export function useEpisodeFavorites(){return {error:"",favorites:[],watched:[],user:null,ready:false};} export function readEpisodeTarget(){return null;} export function seasonProgress(){return {count:0,total:0,next:null,complete:false};} export default function Image(){}`);
const uiSource = await readFile(new URL("../components/EpisodeGuide.tsx", import.meta.url), "utf8");
const uiCompiled = ts.transpileModule(uiSource, {compilerOptions: {module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace("function SeasonEpisodes(", "export function SeasonEpisodes(").replace(/from "([^"]+)"/g, (_all,path)=>`from ${JSON.stringify(path === "react" ? hooksUrl : path === "react/jsx-runtime" ? jsxUrl : stubUrl)}`);
const {default: Guide, SeasonEpisodes} = await import(encode(uiCompiled));
function nodes(node) { return !node || typeof node !== 'object' ? [] : [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
hooks.state[0] = [{seasonNumber:1,name:"Season 1",episodeCount:2},{seasonNumber:2,name:"Season 2",episodeCount:3}];
hooks.state[1] = 1; hooks.state[2] = "";
let chosen; hooks.reset(); let tree = Guide({tmdbId:123,seasonNumber:2,onSeasonChange(value){chosen=value;}});
const select = nodes(tree).find(node=>node.type === 'select');
assert.equal(select.props.value, 2, "Availability and guide use same selected season");
select.props.onChange({target:{value:"1"}}); assert.equal(chosen,1);
hooks.state[0] = [{episodeNumber:1,name:"Episode One",rating:8.7,voteCount:3,overview:"Spoiler",airDate:null,runtime:40,stillUrl:null},{episodeNumber:2,name:"Episode Two",rating:null,voteCount:0,overview:"",airDate:null,runtime:null,stillUrl:null}];
hooks.state[1] = ""; hooks.reset(); tree = SeasonEpisodes({tmdbId:123,season:1,showTitle:"Example",favorites:{watched:[],user:null,ready:false}});
const all = nodes(tree);
assert.ok(all.filter(node=>node.type === 'details').every(node=>!node.props.open), "Spoilers start collapsed");
assert.ok(all.some(node=>node.props?.className === 'fewVotes'));
assert.ok(all.some(node=>node.props?.className === 'unrated'));
assert.ok(all.some(node=>node.props?.children === 'Not rated'));
console.log("PASS: episode validation, season order and specials, ratings/vote counts, missing scores, image paths, errors, timeout, selected season synchronization and collapsed spoilers");
