"use client";

import ModalDialog from "@/components/ModalDialog";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { activityHref, releaseTitleId } from "@/lib/activity-links";
import { parseTitleKey, titlePath, type TitleRouteInput } from "@/lib/title-routes";
import { resolveTitleArtwork, type ArtworkInput } from "@/lib/title-artwork";
import { rememberTitleNavigation } from "@/lib/title-navigation";

type NotificationType = "recommendation" | "friend_request" | "friend_accepted" | "group_invite" | "release_alert" | "availability_included" | "availability_free" | "availability_new" | "availability_price_drop" | "availability_removed";
type ActivityNotification = {
  id: string;
  type: NotificationType;
  heading: string;
  body: string;
  href: string;
  sourceId?: string;
  titleId?: number;
  recommendationId?: string;
  imageUrl?: string;
  actor?: { displayName?: string; photoURL?: string };
  createdAt?: Timestamp;
  readAt?: Timestamp;
  dismissedAt?: Timestamp;
};

type PushPreferences = {
  recommendations: boolean;
  friends: boolean;
  releases: boolean;
  availability: boolean;
};

const defaultPreferences: PushPreferences = { recommendations: true, friends: true, releases: true, availability: true };

export default function NotificationBell({ user }: { user: User | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [legacyArtwork, setLegacyArtwork] = useState<Record<string, string>>({});
  const artworkChecked = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;
    const activityQuery = query(
      collection(firestore, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(activityQuery, (snapshot) => {
      setNotifications(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ActivityNotification)));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void getDoc(doc(firestore, "users", user.uid, "settings", "notifications")).then((snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setPreferences({
        recommendations: data.recommendations !== false,
        friends: data.friends !== false,
        releases: data.releases !== false,
        availability: data.availability !== false,
      });
    });
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  useEffect(() => {
    if (!user) return;
    const openActivity = () => setOpen(true);
    window.addEventListener("streamfind:open-activity", openActivity);
    return () => window.removeEventListener("streamfind:open-activity", openActivity);
  }, [user]);

  const visible = useMemo(() => user ? notifications.filter((item) => !item.dismissedAt) : [], [notifications, user]);
  const unread = visible.filter((item) => !item.readAt).length;

  useEffect(() => {
    if (!user || !open) return;
    const missing = visible.filter((item) => {
      const key = `${user.uid}:${item.id}`;
      if (item.imageUrl || artworkChecked.current.has(key)) return false;
      return activityTitleId(item) !== null || Boolean(item.href.startsWith("/title/")) || (item.type === "recommendation" && Boolean(item.recommendationId));
    });
    if (!missing.length) return;
    missing.forEach((item) => artworkChecked.current.add(`${user.uid}:${item.id}`));
    void Promise.all(missing.map(async (item) => {
      try {
        const titleId = activityTitleId(item);
        const reference = titleId !== null
          ? doc(firestore, "users", user.uid, "watchlist", String(titleId))
          : item.recommendationId ? doc(firestore, "recommendations", item.recommendationId) : null;
        const data = reference ? (await getDoc(reference)).data() : undefined;
        const savedTitle = titleId !== null ? data : data?.title;
        const route = parseTitleKey(item.href.split("?")[0].replace(/^\/title\//, ""));
        const input = savedTitle?.title && ["movie", "show"].includes(savedTitle.mediaType)
          ? savedTitle as ArtworkInput
          : route?.source === "tmdb" ? { title: route.titleHint, mediaType: route.mediaType!, tmdbId: route.sourceId } : null;
        const image = input ? (await resolveTitleArtwork(input)).posterUrl : undefined;
        return [item.id, typeof image === "string" ? image : ""] as const;
      } catch { return [item.id, ""] as const; }
    })).then((found) => {
      setLegacyArtwork((current) => ({ ...current, ...Object.fromEntries(found.map(([id, image]) => [`${user.uid}:${id}`, image])) }));
    });
  }, [open, user, visible]);

  const openBell = () => {
    if (!user) {
      window.location.assign("/?panel=friends");
      return;
    }
    setOpen(true);
  };

  const openNotification = async (item: ActivityNotification) => {
    if (!user) return;
    if (!item.readAt) {
      await updateDoc(doc(firestore, "users", user.uid, "notifications", item.id), { readAt: serverTimestamp() });
    }
    setOpen(false);
    let destination = activityHref(item);
    const titleId = releaseTitleId(item);
    if (destination === "/?view=watchlist" && titleId !== null) {
      try {
        const saved = await getDoc(doc(firestore, "users", user.uid, "watchlist", String(titleId)));
        if (saved.exists()) destination = titlePath(saved.data() as TitleRouteInput) ?? destination;
      } catch { /* Keep the watchlist as a fallback if the saved title is unavailable. */ }
    }
    rememberTitleNavigation(destination);
    router.push(destination);
  };

  const markAllRead = async () => {
    if (!user) return;
    const batch = writeBatch(firestore);
    visible.filter((item) => !item.readAt).forEach((item) => {
      batch.update(doc(firestore, "users", user.uid, "notifications", item.id), { readAt: serverTimestamp() });
    });
    await batch.commit();
  };

  const dismiss = async (item: ActivityNotification) => {
    if (!user) return;
    await updateDoc(doc(firestore, "users", user.uid, "notifications", item.id), {
      dismissedAt: serverTimestamp(),
      readAt: item.readAt ?? serverTimestamp(),
    });
  };

  const clearAll = async () => {
    if (!user || clearing) return;
    setClearing(true);
    setClearError("");
    try {
      // The drawer only subscribes to the most recent items. Include older activity too.
      const snapshot = await getDocs(collection(firestore, "users", user.uid, "notifications"));
      const pending = snapshot.docs.filter((entry) => !entry.data().dismissedAt);
      for (let index = 0; index < pending.length; index += 400) {
        const batch = writeBatch(firestore);
        pending.slice(index, index + 400).forEach((entry) => {
          batch.update(entry.ref, { dismissedAt: serverTimestamp(), readAt: entry.data().readAt ?? serverTimestamp() });
        });
        await batch.commit();
      }
    } catch {
      setClearError("Activity could not be cleared. Please try again.");
    } finally {
      setClearing(false);
    }
  };

  const changePreference = async (key: keyof PushPreferences) => {
    if (!user) return;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    await setDoc(doc(firestore, "users", user.uid, "settings", "notifications"), {
      ...next,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  return <>
    <button className="notificationBell" type="button" onClick={openBell} aria-label={user ? `Activity${unread ? `, ${unread} unread` : ""}` : "Sign in to view activity"} aria-expanded={open}>
      <BellIcon />
      {unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && user && typeof document !== "undefined" && createPortal(<div className="activityOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <ModalDialog className="activityDrawer" role="dialog" aria-modal="true" aria-labelledby="activity-title">
        <header>
          <div><p>Your Stream Find</p><h2 id="activity-title">Activity</h2></div>
          <div className="activityHeaderActions">
            {visible.length > 0 && <button className="activityClearAll" type="button" onClick={() => void clearAll()} disabled={clearing} aria-label="Clear all activity" title="Clear all activity"><SweepIcon /></button>}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close activity">×</button>
          </div>
        </header>
        <div className="activityTools">
          <span>{unread ? `${unread} unread` : "All caught up"}</span>
          {unread > 0 && <button type="button" onClick={() => void markAllRead()} disabled={clearing}>Mark all read</button>}
        </div>
        <div className="activityList">
          {clearError && <p className="activityClearError" role="alert">{clearError}</p>}
          {visible.length ? visible.map((item) => {
            const artwork = item.imageUrl || legacyArtwork[`${user.uid}:${item.id}`];
            return <article className={item.readAt ? "" : "unread"} key={item.id}>
            <button className="activityOpen" type="button" onClick={() => void openNotification(item)}>
              <span className={`activityArtwork ${item.type}`} style={artwork ? { backgroundImage: `url(${JSON.stringify(artwork)})` } : undefined}>
                {!artwork && (item.actor?.photoURL ? <i style={{ backgroundImage: `url(${JSON.stringify(item.actor.photoURL)})` }} /> : activityTitleId(item) !== null ? item.heading.slice(0, 1) : activityMark(item.type))}
              </span>
              <span className="activityCopy"><strong>{item.heading}</strong><span>{item.body}</span><small>{relativeTime(item.createdAt)}</small></span>
            </button>
            <button className="activityDismiss" type="button" onClick={() => void dismiss(item)} aria-label={`Dismiss ${item.heading}`}>×</button>
          </article>;
          }) : <div className="activityEmpty"><span><BellIcon /></span><h3>Nothing new yet</h3><p>Recommendations, friend activity, availability changes, and release updates will appear here.</p></div>}
        </div>
        <footer className="activitySettings">
          <button type="button" onClick={() => setSettingsOpen((current) => !current)} aria-expanded={settingsOpen}><span>Push preferences</span><span>{settingsOpen ? "−" : "+"}</span></button>
          {settingsOpen && <div>
            <Preference label="Recommendations" checked={preferences.recommendations} onChange={() => void changePreference("recommendations")} />
            <Preference label="Friend activity" checked={preferences.friends} onChange={() => void changePreference("friends")} />
            <Preference label="Availability & prices" checked={preferences.availability} onChange={() => void changePreference("availability")} />
            <Preference label="Release alerts" checked={preferences.releases} onChange={() => void changePreference("releases")} />
            <p>Device notifications can be enabled from your Watchlist.</p>
          </div>}
        </footer>
      </ModalDialog>
    </div>, document.body)}
  </>;
}

function Preference({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label><span>{label}</span><input type="checkbox" checked={checked} onChange={onChange} /><i aria-hidden="true" /></label>;
}

function activityMark(type: NotificationType) {
  if (type === "recommendation") return "▶";
  if (type === "group_invite") return "✦";
  if (type === "release_alert") return "◷";
  if (type.startsWith("availability_")) return type === "availability_price_drop" ? "↓" : "↗";
  return "☺";
}

function activityTitleId(item: ActivityNotification) {
  if (item.type === "release_alert") return releaseTitleId(item);
  if (!item.type.startsWith("availability_")) return null;
  if (Number.isSafeInteger(item.titleId)) return item.titleId!;
  const match = /^(-?\d+):/.exec(item.sourceId ?? "");
  return match ? Number(match[1]) : null;
}

function relativeTime(timestamp?: Timestamp) {
  if (!timestamp?.toMillis) return "Just now";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp.toMillis()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(timestamp.toMillis()));
}

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SweepIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21 3-8 8" />
    <path d="m12 9 3 3-3 3-3-3 3-3Z" />
    <path d="M9 12c-1.6 1-3.7 1.5-6 1.5A10.5 10.5 0 0 0 10.5 21L15 15l-3-3" />
    <path d="m5 14.5 4.5 4.5m-2-5 4 4M16 21h5m-3-4h3" />
  </svg>;
}
