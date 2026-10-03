"use client";

import ModalDialog from "@/components/ModalDialog";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
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
import { titlePath, type TitleRouteInput } from "@/lib/title-routes";
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

  useEffect(() => {
    if (!user) return;
    const activityQuery = query(
      collection(firestore, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(40),
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

  const visible = useMemo(() => user ? notifications.filter((item) => !item.dismissedAt) : [], [notifications, user]);
  const unread = visible.filter((item) => !item.readAt).length;

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
          <button type="button" onClick={() => setOpen(false)} aria-label="Close activity">×</button>
        </header>
        <div className="activityTools">
          <span>{unread ? `${unread} unread` : "All caught up"}</span>
          {unread > 0 && <button type="button" onClick={() => void markAllRead()}>Mark all read</button>}
        </div>
        <div className="activityList">
          {visible.length ? visible.map((item) => <article className={item.readAt ? "" : "unread"} key={item.id}>
            <button className="activityOpen" type="button" onClick={() => void openNotification(item)}>
              <span className={`activityArtwork ${item.type}`} style={item.imageUrl ? { backgroundImage: `url(${JSON.stringify(item.imageUrl)})` } : undefined}>
                {!item.imageUrl && (item.actor?.photoURL ? <i style={{ backgroundImage: `url(${JSON.stringify(item.actor.photoURL)})` }} /> : activityMark(item.type))}
              </span>
              <span className="activityCopy"><strong>{item.heading}</strong><span>{item.body}</span><small>{relativeTime(item.createdAt)}</small></span>
            </button>
            <button className="activityDismiss" type="button" onClick={() => void dismiss(item)} aria-label={`Dismiss ${item.heading}`}>×</button>
          </article>) : <div className="activityEmpty"><span><BellIcon /></span><h3>Nothing new yet</h3><p>Recommendations, friend activity, availability changes, and release updates will appear here.</p></div>}
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
