import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const encode = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const hooksUrl = encode(`export const state = []; export const effects = []; let index = 0; export function reset() { index = 0; effects.length = 0; } export function useState(initial) { const id = index++; if (!(id in state)) state[id] = initial; return [state[id], value => { state[id] = typeof value === 'function' ? value(state[id]) : value; }]; } export function useEffect(fn) { effects.push(fn); }`);
const hooks = await import(hooksUrl);
const jsxUrl = encode(`export const Fragment = 'fragment'; export function jsx(type, props) { return {type, props}; } export const jsxs = jsx;`);
const stubUrl = encode(`export default function Stub() {}`);
const source = await readFile(new URL("../components/TitlePreviewDialog.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText.replace(/from "([^"]+)"/g, (_all, path) => `from ${JSON.stringify(path === "react" ? hooksUrl : path === "react/jsx-runtime" ? jsxUrl : stubUrl)}`);
const {default: Preview} = await import(encode(compiled));
let closed = 0;
const props = {candidate: {tmdbId: 123, mediaType: "show", title: "Example", year: 2024, posterUrl: ""}, region: "GB", onClose() { closed++; }};
const render = () => { hooks.reset(); return Preview(props); };
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
let tree = render();
assert.ok(nodes(tree).some(node => node.props?.role === "status"));
const close = nodes(tree).find(node => node.props?.["aria-label"] === "Close title details and return to picks");
close.props.onClick(); assert.equal(closed, 1);
tree.props.onMouseDown({target: {}, currentTarget: {}}); assert.equal(closed, 1, "Clicks inside do not dismiss");
const backdrop = {}; tree.props.onMouseDown({target: backdrop, currentTarget: backdrop}); assert.equal(closed, 2);
const dialog = tree.props.children;
dialog.props.onKeyDown({key: "Escape", stopPropagation() {}}); assert.equal(closed, 3);
let signal;
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => { assert.equal(url, "/api/title-details?id=123&type=show&region=GB"); signal = options.signal; return {ok: true, json: async () => ({title: {synopsis: "Story", runtime: "45 min", genres: [], offers: []}, credits: []})}; };
  const cleanup = hooks.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.ok(nodes(tree).some(node => node.props?.children === "Story"));
  cleanup(); assert.equal(signal.aborted, true, "Closing cancels outstanding requests");
  hooks.state[0] = null; hooks.state[1] = "Could not load";
  tree = render();
  const retry = nodes(tree).find(node => node.type === "button" && node.props.children === "Try again");
  retry.props.onClick(); assert.equal(hooks.state[1], ""); assert.equal(hooks.state[2], 1);
} finally { globalThis.fetch = originalFetch; }
const together = await readFile(new URL("../components/TogetherPage.tsx", import.meta.url), "utf8");
assert.doesNotMatch(together, /View details →/);
assert.match(together, /aria-haspopup="dialog"/);
assert.match(together, /!previewOpen.current/);
assert.match(together, /if \(previewOpen.current\) return/);
const modal = await readFile(new URL("../components/ModalDialog.tsx", import.meta.url), "utf8");
assert.match(modal, /trigger.focus\(\{ preventScroll: true \}\)/);
console.log("PASS: loading, close, Escape, backdrop isolation, regional request, details, cancellation, retry, separate card actions and scroll-safe focus restoration");
