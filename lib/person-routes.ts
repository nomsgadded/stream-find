import { slugifyTitle } from "@/lib/title-routes";

export function personPath(person: { personId: number; name: string }) {
  if (!Number.isSafeInteger(person.personId) || person.personId <= 0) return null;
  return `/person/${person.personId}-${slugifyTitle(person.name)}`;
}

export function parsePersonKey(key: string) {
  const match = /^(\d+)-(.+)$/.exec(key);
  if (!match) return null;
  const personId = Number(match[1]);
  if (!Number.isSafeInteger(personId) || personId <= 0) return null;
  return { personId, nameHint: match[2].split("-").filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ") };
}
