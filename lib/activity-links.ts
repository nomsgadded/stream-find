import { titlePath, type TitleRouteInput } from "@/lib/title-routes";

type ActivityLink = {
  type: string;
  href?: string;
  sourceId?: string;
  heading?: string;
  titleId?: number;
};

export function releaseTitleId(item: ActivityLink) {
  if (item.type !== "release_alert") return null;
  if (Number.isSafeInteger(item.titleId)) return item.titleId!;
  // Older alerts stored the watchlist ID before the alert kind in sourceId.
  const match = /^(-?\d+)(?=[:-])/.exec(item.sourceId ?? "");
  return match ? Number(match[1]) : null;
}

export function activityHref(item: ActivityLink, savedTitle?: TitleRouteInput) {
  const href = typeof item.href === "string" && item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : "/";
  if (item.type !== "release_alert" || href !== "/?view=watchlist") return href;
  const id = releaseTitleId(item);
  const name = (item.heading ?? "").replace(/: [^:]+$/, "") || savedTitle?.title || "title";
  const path = savedTitle && titlePath(savedTitle);
  if (path) return path;
  return id !== null && id < 0 ? titlePath({ title: name, watchmodeId: -id }) ?? href : href;
}
