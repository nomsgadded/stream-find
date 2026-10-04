import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

let active = false;
let effect;
let mobile = true;
const properties = new Map();
const ref = { current: { style: { setProperty: (key, value) => properties.set(key, value) } } };
const viewportListeners = new Map();
const windowListeners = new Map();
globalThis.window = {
  matchMedia: () => ({ matches: mobile }), innerHeight: 800,
  visualViewport: {
    height: 750, offsetTop: 0,
    addEventListener: (name, callback) => viewportListeners.set(name, callback),
    removeEventListener: (name) => viewportListeners.delete(name),
  },
  addEventListener: (name, callback) => windowListeners.set(name, callback),
  removeEventListener: (name) => windowListeners.delete(name),
};
globalThis.document = { body: { style: { overflow: "auto" } } };
globalThis.mobileSearchHookMocks = {
  useState: () => [active, (value) => { active = value; }],
  useRef: () => ref,
  useEffect: (callback) => { effect = callback; },
};
const source = await readFile(new URL("../components/useMobileSearchFocus.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
  .replace(/import .* from "react";/, "const { useState, useRef, useEffect } = globalThis.mobileSearchHookMocks;");
const { default: simulateFocus } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

let hook = simulateFocus();
assert.equal(effect(), undefined, "Inactive search does not lock scrolling");
mobile = false;
hook.begin();
assert.equal(active, false, "Desktop focus keeps the ordinary layout");
mobile = true;
hook.begin();
assert.equal(active, true);
hook = simulateFocus();
const cleanup = effect();
assert.equal(document.body.style.overflow, "hidden");
assert.equal(properties.get("--search-viewport-height"), "750px");
window.visualViewport.height = 390;
window.visualViewport.offsetTop = 24;
viewportListeners.get("resize")();
assert.equal(properties.get("--search-viewport-height"), "390px", "Keyboard resize limits suggestions to the visible viewport");
assert.equal(properties.get("--search-viewport-top"), "24px", "Browser viewport panning keeps search at the visible top");
mobile = false;
windowListeners.get("resize")();
assert.equal(active, false, "Switching to desktop exits focus mode");
cleanup();
assert.equal(document.body.style.overflow, "auto");
assert.equal(viewportListeners.size, 0);
assert.equal(windowListeners.size, 0);
mobile = true;
hook.begin();
hook.end();
assert.equal(active, false);
delete globalThis.mobileSearchHookMocks;
delete globalThis.window;
delete globalThis.document;
console.log("PASS: mobile focus, keyboard viewport resize/pan, desktop behavior, exit and scroll/listener cleanup");
