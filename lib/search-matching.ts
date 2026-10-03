export function normalizeSearch(value: string) {
  return value.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLowerCase()
    .replace(/&/g, " and ").replace(/[’']/g, "").replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function searchLookupTerm(value: string) {
  return value.trim().replace(/\s+(?:19|20)\d{2}$/, "").trim();
}

export function parseSearch(value: string) {
  const normalized = normalizeSearch(value);
  const year = normalized.match(/\s((?:19|20)\d{2})$/);
  return year ? { term: normalized.slice(0, -5).trim(), year: Number(year[1]) } : { term: normalized, year: undefined };
}

function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

export function searchMatchScore(title: string, query: string, year?: number) {
  const parsed = parseSearch(query);
  const term = parsed.term;
  const name = normalizeSearch(title);
  const yearPenalty = parsed.year && parsed.year !== year ? 100 : 0;
  let score = 100;
  if (term && name === term) score = 0;
  else if (term && name.startsWith(term)) score = 10;
  else if (term && name.includes(term)) score = 20;
  else if (term && name.replace(/ /g, "").includes(term.replace(/ /g, ""))) score = 25;
  else if (term && term.split(" ").every((word) => name.split(" ").includes(word))) score = 30;
  else if (term.length >= 5) {
    const limit = Math.max(1, Math.min(3, Math.floor(term.length * .18)));
    const compact = term.replace(/ /g, "");
    const words = name.split(" ");
    const phrases = [name.replace(/ /g, ""), ...words.flatMap((_, index) => [words[index], words.slice(index, index + term.split(" ").length).join("")])];
    const edits = Math.min(...phrases.filter((phrase) => Math.abs(phrase.length - compact.length) <= limit).map((phrase) => distance(compact, phrase)), Infinity);
    if (edits <= limit) score = 40 + edits;
  }
  return score + yearPenalty;
}
