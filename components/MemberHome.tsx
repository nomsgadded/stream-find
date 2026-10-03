"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { activityHref, releaseTitleId } from "@/lib/activity-links";
import { titlePath, type TitleRouteInput } from "@/lib/title-routes";
import { rememberTitleNavigation } from "@/lib/title-navigation";
import PlatformHighlights from "@/components/PlatformHighlights";

type Activity = { id: string; type: string; heading: string; body: string; href: string; sourceId?: string; titleId?: number; imageUrl?: string; dismissedAt?: unknown };
type FriendTitle = TitleRouteInput & { id: number; posterUrl?: string; year?: number };
type Pick = { title: FriendTitle; reason: string };

export default function MemberHome({ user, watchlistIds, watchlistTitles, services, region, onServices, onFriends, onWatchlist }: {
  user: User; watchlistIds: number[]; watchlistTitles: Array<TitleRouteInput & { id: number }>; services: string[]; region: string;
  onServices: () => void; onFriends: () => void; onWatchlist: () => void;
}) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [direct, setDirect] = useState<Pick[]>([]);
  const [friendPicks, setFriendPicks] = useState<Pick[]>([]);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    return onSnapshot(query(collection(firestore, "users", user.uid, "notifications"), orderBy("createdAt", "desc"), limit(30)), (snapshot) => {
      setActivity(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Activity)));
    }, () => setError(true));
  }, [user.uid]);

  useEffect(() => {
    return onSnapshot(query(collection(firestore, "recommendations"), where("toUid", "==", user.uid)), (snapshot) => {
      setDirect(snapshot.docs.filter((entry) => entry.data().status === "sent").map((entry) => {
        const data = entry.data();
        return { title: data.title as FriendTitle, reason: `${data.fromDisplayName || data.sender?.displayName || "A friend"} recommended this` };
      }).filter((item) => item.title));
    }, () => setError(true));
  }, [user.uid]);

  useEffect(() => {
    let subscriptions: Array<() => void> = [];
    const byFriend = new Map<string, Pick[]>();
    const stop = onSnapshot(collection(firestore, "users", user.uid, "friends"), (snapshot) => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions = [];
      byFriend.clear();
      setFriendPicks([]);
      setFriendCount(snapshot.size);
      for (const friend of snapshot.docs.slice(0, 12)) {
        subscriptions.push(onSnapshot(query(collection(firestore, "users", friend.id, "watchlist"), orderBy("savedAt", "desc"), limit(6)), (titles) => {
          byFriend.set(friend.id, titles.docs.map((entry) => ({ title: entry.data() as FriendTitle, reason: `${friend.data().displayName || "A friend"} saved this` })));
          setFriendPicks([...byFriend.values()].flat());
        }, () => { byFriend.delete(friend.id); setFriendPicks([...byFriend.values()].flat()); }));
      }
    }, () => setError(true));
    return () => { stop(); subscriptions.forEach((unsubscribe) => unsubscribe()); };
  }, [user.uid]);

  const updates = activity.filter((item) => !item.dismissedAt && (item.type.startsWith("availability_") || item.type === "release_alert") && item.href.startsWith("/") && !item.href.startsWith("//")).slice(0, 4);
  const seen = new Set<number>();
  const picks = [...direct, ...friendPicks].filter((item) => {
    if (watchlistIds.includes(item.title.id) || seen.has(item.title.id) || !titlePath(item.title)) return false;
    seen.add(item.title.id); return true;
  }).slice(0, 10);
  const needsServices = services.length === 0;
  const needsTitle = watchlistIds.length === 0;
  const needsFriends = friendCount === 0;

  return <div className="memberHome">
    {updates.length > 0 && <section aria-labelledby="member-updates"><div className="memberHeading"><h2 id="member-updates">Your watchlist updates</h2><button onClick={onWatchlist}>View watchlist →</button></div><div className="memberUpdates">{updates.map((item) => { const href = activityHref(item, watchlistTitles.find((title) => title.id === releaseTitleId(item))); return <a href={href} onClick={() => rememberTitleNavigation(href)} key={item.id}>{item.imageUrl && <span className="memberUpdateArt" style={{ backgroundImage: `url(${JSON.stringify(item.imageUrl)})` }} />}<span><strong>{item.heading}</strong><small>{item.body}</small></span><span aria-hidden="true">→</span></a>; })}</div></section>}
    <section className="togetherTeaser" aria-labelledby="together-title"><div><p className="sectionKicker">Decide together</p><h2 id="together-title">Find tonight’s pick with your circle.</h2><p>Set the mood and time, invite friends, then vote on picks available through your services.</p></div><Link href="/together">Start a movie night <span aria-hidden="true">→</span></Link></section>
    {picks.length > 0 && <section aria-labelledby="member-friends"><div className="memberHeading"><h2 id="member-friends">From your friends</h2><button onClick={onFriends}>Your circle →</button></div><div className="discoveryRail">{picks.map((item) => { const href = titlePath(item.title)!; return <a className="discoveryCard" href={href} onClick={() => rememberTitleNavigation(href)} key={item.title.id}><span className="discoveryPoster" style={item.title.posterUrl ? { backgroundImage: `url(${JSON.stringify(item.title.posterUrl)})` } : undefined}><span className="discoveryPosterShade" /></span><span className="discoveryCardCopy"><strong>{item.title.title}</strong><small>{item.reason}</small></span></a>; })}</div></section>}
    <PlatformHighlights key={services.join("|")} services={services} region={region} onServices={onServices} />
    {friendCount !== null && (needsServices || needsTitle || needsFriends) && <section className="memberSetup" aria-label="Personalize your home"><div><strong>Make this your home</strong><p>{needsTitle ? "Save a title to start your watchlist." : needsFriends ? "Find friends to see what they’re watching." : "Choose your services to find included picks."}</p></div><div>{needsServices && <button onClick={onServices}>Choose services</button>}{needsTitle && <button onClick={() => document.getElementById("title-search")?.focus()}>Find a title</button>}{needsFriends && <button onClick={onFriends}>Find friends</button>}</div></section>}
    {error && <p className="memberDataNotice" role="status">Some account updates couldn’t load. Your watchlist and friends are still available from navigation.</p>}
  </div>;
}
