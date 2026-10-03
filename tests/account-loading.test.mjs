import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = await readFile(new URL("../components/SocialHub.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dataModule = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const reactUrl = import.meta.resolve("react");
const jsxUrl = import.meta.resolve("react/jsx-runtime");
const firebaseMock = dataModule(`export const firebaseAuth = {}; export const firestore = {}; ${["createUserWithEmailAndPassword", "GoogleAuthProvider", "sendEmailVerification", "sendPasswordResetEmail", "signInWithEmailAndPassword", "signInWithPopup", "signOut", "updateProfile", "collection", "doc", "getDoc", "getDocs", "query", "runTransaction", "serverTimestamp", "setDoc", "updateDoc", "where", "writeBatch"].map((name) => `export function ${name}() { throw new Error('Unexpected Firebase access during render'); }`).join("\n")}`);
const componentMock = dataModule(`import React from ${JSON.stringify(reactUrl)}; export function useRouter() { return {push(){}}; } export function episodePath() { return "/title/example"; } export default function Component({children}) { return React.createElement('div', null, children); }`);

async function renderAccount({ authReady = true, user = { uid: "member-1", displayName: "Shafeen" }, profile, error = false } = {}) {
  const hooks = dataModule(`import * as React from ${JSON.stringify(reactUrl)}; export const {useEffect, useMemo, useCallback} = React; let index = 0; export function useState(initial) { const current = index++; return React.useState(current === 5 ? ${profile === undefined ? "undefined" : JSON.stringify(profile)} : current === 6 ? ${error} : current === 8 ? 'friends' : current === 17 ? 'Your account could not be loaded. Please try again.' : initial); }`);
  const moduleText = compiled.replace(/from "([^"]+)"/g, (_match, path) => `from ${JSON.stringify(path === "react" ? hooks : path === "react/jsx-runtime" ? jsxUrl : path.startsWith("firebase/") || path === "@/lib/firebase" ? firebaseMock : componentMock)}`);
  const { default: SocialHub } = await import(dataModule(moduleText));
  return renderToStaticMarkup(React.createElement(SocialHub, { open: true, entryPoint: "account", authReady, user, watchlistIds: [], onClose() {}, onOpenTitle() {}, onSaveTitle() {} }));
}

for (const options of [{authReady: false, user: null}, {}]) {
  const html = await renderAccount(options);
  assert.match(html, /Loading your account/);
  assert.doesNotMatch(html, /Choose how friends find you|Create profile|Continue with Google/);
}
const failed = await renderAccount({error: true});
assert.match(failed, /Try again/);
assert.doesNotMatch(failed, /Create profile/);
const newMember = await renderAccount({profile: null});
assert.match(newMember, /Choose how friends find you/);
const returningMember = await renderAccount({profile: {uid: "member-1", displayName: "Shafeen", username: "shafeen", usernameLower: "shafeen"}});
assert.match(returningMember, /Your circle/);
assert.doesNotMatch(returningMember, /Create profile|Loading your account/);
const signedOut = await renderAccount({user: null});
assert.match(signedOut, /Continue with Google/);
const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(home, /key=\{`\$\{socialEntryPoint\}-\$\{socialOpen\}`\}/, "Closing the account should retain its loaded profile");
console.log("PASS: auth restoration, pending profile, failed lookup retry, confirmed missing profile, existing account, signed out, reopen retention");
