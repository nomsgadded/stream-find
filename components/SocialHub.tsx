"use client";

import FavoriteEpisodes from "@/components/FavoriteEpisodes";
import { episodePath, type FavoriteEpisode } from "@/lib/episode-links";
import { useRouter } from "next/navigation";
import TitleArtwork from "@/components/TitleArtwork";
import ModalDialog from "@/components/ModalDialog";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";

type SocialTitle = {
  id: number;
  title: string;
  year: number;
  mediaType: "movie" | "show";
  runtime: string;
  score: number;
  rating: string;
  genres: string[];
  synopsis: string;
  art: string;
  backdropUrl?: string;
  posterUrl?: string;
  offers: unknown[];
  live?: boolean;
  watchmodeId?: number;
};

type Profile = {
  uid: string;
  displayName: string;
  username: string;
  usernameLower: string;
  photoURL?: string;
};

type Friend = Profile & { addedAt?: unknown };
type FriendRequest = { id: string; fromUid: string; toUid: string; status: string };
type Recommendation = { title: SocialTitle; friends: Profile[] };
type DirectRecommendation = {
  episode?: FavoriteEpisode;
  id: string;
  fromUid: string;
  toUid: string;
  sender: Profile;
  title: SocialTitle;
  titlePath?: string;
  message?: string;
  status: "sent" | "opened" | "saved" | "dismissed";
  sentAt?: { toMillis?: () => number };
};

type SocialHubProps = {
  open: boolean;
  entryPoint: "account" | "friends";
  onClose: () => void;
  user: User | null;
  authReady: boolean;
  watchlistIds: number[];
  onOpenTitle: (title: SocialTitle) => void;
  onSaveTitle: (title: SocialTitle) => void;
};

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.39 13.93A6.01 6.01 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z" />
    <path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function cleanUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

function profileFromDoc(data: DocumentData): Profile {
  return {
    uid: String(data.uid ?? ""),
    displayName: String(data.displayName ?? data.username ?? "Stream Find member"),
    username: String(data.username ?? "member"),
    usernameLower: String(data.usernameLower ?? "member"),
    ...(data.photoURL ? { photoURL: String(data.photoURL) } : {}),
  };
}

function authMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential")) return "That email or password does not match.";
  if (code.includes("email-already-in-use")) return "An account already uses that email.";
  if (code.includes("weak-password")) return "Use a password with at least six characters.";
  if (code.includes("popup-closed")) return "Google sign-in was closed before it finished.";
  if (code.includes("popup-blocked")) return "Allow pop-ups to continue with Google.";
  return "Something went wrong. Please try again.";
}

export default function SocialHub({ open, entryPoint, onClose, user, authReady, watchlistIds, onOpenTitle, onSaveTitle }: SocialHubProps) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  // Undefined means not checked; null means the account needs profile setup.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "inbox" | "recommendations">("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Array<FriendRequest & { sender: Profile }>>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [directRecommendations, setDirectRecommendations] = useState<DirectRecommendation[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [friendWatchlist, setFriendWatchlist] = useState<SocialTitle[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSocialData = useCallback(async (currentUser: User, currentProfile: Profile, isCurrent: () => boolean = () => true) => {
    const friendSnapshot = await getDocs(collection(firestore, "users", currentUser.uid, "friends"));
    if (!isCurrent()) return;
    const loadedFriends = friendSnapshot.docs.map((entry) => profileFromDoc(entry.data()));
    setFriends(loadedFriends);

    const requestSnapshot = await getDocs(query(
      collection(firestore, "friendRequests"),
      where("toUid", "==", currentUser.uid),
      where("status", "==", "pending"),
    ));
    const loadedRequests = await Promise.all(requestSnapshot.docs.map(async (entry) => {
      const request = { id: entry.id, ...entry.data() } as FriendRequest;
      const senderSnapshot = await getDoc(doc(firestore, "users", request.fromUid));
      return senderSnapshot.exists() ? { ...request, sender: profileFromDoc(senderSnapshot.data()) } : null;
    }));
    if (!isCurrent()) return;
    setRequests(loadedRequests.filter((item): item is FriendRequest & { sender: Profile } => Boolean(item)));

    const inboxSnapshot = await getDocs(query(
      collection(firestore, "recommendations"),
      where("toUid", "==", currentUser.uid),
    ));
    const inbox = inboxSnapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() } as DirectRecommendation))
      .filter((item) => item.status !== "dismissed")
      .sort((a, b) => (b.sentAt?.toMillis?.() ?? 0) - (a.sentAt?.toMillis?.() ?? 0));
    if (!isCurrent()) return;
    setDirectRecommendations(inbox);

    const friendWatchlists = await Promise.all(loadedFriends.slice(0, 12).map(async (friend) => {
      const snapshot = await getDocs(collection(firestore, "users", friend.uid, "watchlist"));
      return snapshot.docs.map((entry) => ({ title: entry.data() as SocialTitle, friend }));
    }));
    const grouped = new Map<number, Recommendation>();
    for (const item of friendWatchlists.flat()) {
      if (watchlistIds.includes(item.title.id)) continue;
      const existing = grouped.get(item.title.id);
      if (existing) existing.friends.push(item.friend);
      else grouped.set(item.title.id, { title: item.title, friends: [item.friend] });
    }
    if (!isCurrent()) return;
    setRecommendations([...grouped.values()].sort((a, b) => b.friends.length - a.friends.length || b.title.score - a.title.score));
    setProfile(currentProfile);
  }, [watchlistIds]);

  useEffect(() => {
    if (!user || !open) return;
    let cancelled = false;
    void (async () => {
      const snapshot = await getDoc(doc(firestore, "users", user.uid));
      if (cancelled) return;
      if (!snapshot.exists()) {
        setProfile(null);
        setProfileError(false);
        setStatus("");
        setDisplayName(user.displayName ?? "");
        setUsername(cleanUsername(user.email?.split("@")[0] ?? ""));
        return;
      }
      const loadedProfile = profileFromDoc(snapshot.data());
      setProfile(loadedProfile);
      setProfileError(false);
      setStatus("");
      if (!snapshot.data().displayNameLower) {
        await setDoc(doc(firestore, "users", user.uid), { displayNameLower: loadedProfile.displayName.trim().toLowerCase() }, { merge: true });
      }
      await loadSocialData(user, loadedProfile, () => !cancelled);
    })().catch(() => {
      if (cancelled) return;
      setProfileError(true);
      setStatus("Your account could not be loaded. Please try again.");
    });
    return () => { cancelled = true; };
  }, [loadSocialData, open, user, profileRetry]);

  const requestCount = requests.length;
  const recommendationCount = recommendations.length;
  const inboxCount = directRecommendations.filter((item) => item.status === "sent").length;
  const initials = useMemo(() => {
    const name = profile?.displayName || user?.displayName || user?.email || "SF";
    return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }, [profile, user]);

  if (!open) return null;

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      if (authMode === "signup") {
        const result = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        if (displayName.trim()) await updateProfile(result.user, { displayName: displayName.trim() });
        await sendEmailVerification(result.user);
        setStatus("Account created. Check your email to verify it, then choose your username.");
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (error) {
      setStatus(authMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    setStatus("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(firebaseAuth, provider);
    } catch (error) {
      setStatus(authMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setStatus("Enter your email first, then select reset password.");
      return;
    }
    await sendPasswordResetEmail(firebaseAuth, email.trim());
    setStatus("Password reset email sent.");
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const usernameLower = cleanUsername(username);
    const cleanName = displayName.trim();
    if (usernameLower.length < 3 || cleanName.length < 2) {
      setStatus("Use a display name and a username with at least three characters.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const nextProfile: Profile = {
        uid: user.uid,
        displayName: cleanName,
        username: usernameLower,
        usernameLower,
        ...(user.photoURL ? { photoURL: user.photoURL } : {}),
      };
      await runTransaction(firestore, async (transaction) => {
        const usernameRef = doc(firestore, "usernames", usernameLower);
        const usernameSnapshot = await transaction.get(usernameRef);
        if (usernameSnapshot.exists() && usernameSnapshot.data().uid !== user.uid) throw new Error("username-taken");
        transaction.set(usernameRef, { uid: user.uid, createdAt: serverTimestamp() });
        transaction.set(doc(firestore, "users", user.uid), { ...nextProfile, displayNameLower: cleanName.toLowerCase(), createdAt: serverTimestamp() });
      });
      await updateProfile(user, { displayName: cleanName });
      setProfile(nextProfile);
      await loadSocialData(user, nextProfile);
    } catch (error) {
      setStatus(error instanceof Error && error.message === "username-taken" ? "That username is already taken." : "Your profile could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const searchFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const searchTerm = friendSearch.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (searchTerm.replace(/^@/, "").length < 2) {
      setStatus("Enter at least two characters to search.");
      return;
    }
    setBusy(true);
    setStatus("");
    setSearchResults([]);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/friends/search?q=${encodeURIComponent(searchTerm)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json() as { results?: Profile[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Friend search is temporarily unavailable.");
      const existingFriendIds = new Set(friends.map((friend) => friend.uid));
      const results = (data.results ?? [])
        .filter((person) => !existingFriendIds.has(person.uid))
        .slice(0, 8);
      setSearchResults(results);
      if (!results.length) setStatus("No matching Stream Find members found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Friend search is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  };

  const sendFriendRequest = async (target: Profile) => {
    if (!user || !profile) return;
    const requestId = `${user.uid}_${target.uid}`;
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "friendRequests", requestId), {
      fromUid: user.uid,
      toUid: target.uid,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    batch.set(doc(firestore, "users", target.uid, "notifications", `friend-request-${requestId}`), {
      type: "friend_request",
      toUid: target.uid,
      actor: profile,
      requestId,
      heading: `${profile.displayName} sent you a friend request`,
      body: `@${profile.username} would like to connect on Stream Find.`,
      href: "/?panel=friends",
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    setSearchResults((current) => current.filter((person) => person.uid !== target.uid));
    setStatus(`Friend request sent to @${target.username}.`);
  };

  const respondToRequest = async (request: FriendRequest & { sender: Profile }, accept: boolean) => {
    if (!user || !profile) return;
    if (!accept) {
      await updateDoc(doc(firestore, "friendRequests", request.id), { status: "declined", respondedAt: serverTimestamp() });
    } else {
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, "users", user.uid, "friends", request.sender.uid), { ...request.sender, addedAt: serverTimestamp() });
      batch.set(doc(firestore, "users", request.sender.uid, "friends", user.uid), { ...profile, addedAt: serverTimestamp() });
      batch.update(doc(firestore, "friendRequests", request.id), { status: "accepted", respondedAt: serverTimestamp() });
      batch.set(doc(firestore, "users", request.sender.uid, "notifications", `friend-accepted-${request.id}`), {
        type: "friend_accepted",
        toUid: request.sender.uid,
        actor: profile,
        requestId: request.id,
        heading: `${profile.displayName} accepted your friend request`,
        body: "You can now see each other’s watchlists and send recommendations.",
        href: "/?panel=friends",
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setFriends((current) => [...current, request.sender]);
    }
    setRequests((current) => current.filter((item) => item.id !== request.id));
  };

  const removeFriend = async (friend: Friend) => {
    if (!user) return;
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, "users", user.uid, "friends", friend.uid));
    batch.delete(doc(firestore, "users", friend.uid, "friends", user.uid));
    await batch.commit();
    setFriends((current) => current.filter((item) => item.uid !== friend.uid));
  };

  const openFriendWatchlist = async (friend: Friend) => {
    setBusy(true);
    setStatus("");
    try {
      const snapshot = await getDocs(collection(firestore, "users", friend.uid, "watchlist"));
      setFriendWatchlist(snapshot.docs.map((entry) => entry.data() as SocialTitle).sort((a, b) => b.score - a.score));
      setSelectedFriend(friend);
    } catch {
      setStatus(`${friend.displayName}’s watchlist could not be loaded.`);
    } finally {
      setBusy(false);
    }
  };

  const updateRecommendation = async (item: DirectRecommendation, status: "opened" | "saved" | "dismissed") => {
    const timestampField = status === "opened" ? "openedAt" : status === "saved" ? "savedAt" : "dismissedAt";
    await updateDoc(doc(firestore, "recommendations", item.id), { status, [timestampField]: serverTimestamp() });
    if (status === "dismissed") setDirectRecommendations((current) => current.filter((entry) => entry.id !== item.id));
    else setDirectRecommendations((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
  };

  const openRecommendation = async (item: DirectRecommendation) => {
    if (item.status === "sent") await updateRecommendation(item, "opened");
    if (item.episode) router.push(episodePath(item.episode));
    else onOpenTitle(item.title);
    onClose();
  };

  const saveRecommendation = async (item: DirectRecommendation) => {
    if (!watchlistIds.includes(item.title.id)) onSaveTitle(item.title);
    await updateRecommendation(item, "saved");
  };

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <ModalDialog className="modalPanel socialPanel" role="dialog" aria-modal="true" aria-labelledby="social-title">
        <div className="modalHeader socialHeader">
          <div>
            <p className="sectionKicker">{entryPoint === "account" ? "Your Stream Find" : "Stream Find together"}</p>
            <h2 id="social-title">{!authReady || user ? entryPoint === "account" ? "Your account" : "Your circle" : "Sign in to Stream Find"}</h2>
          </div>
          <button className="closeButton" type="button" onClick={onClose} aria-label="Close account panel"><CloseIcon /></button>
        </div>

        {!authReady || (user && profile === undefined) ? (
          <div className="socialBody" aria-busy={!profileError}>
            <p className="formStatus" role="status">{profileError ? status : "Loading your account…"}</p>
            {profileError && <button className="secondaryAction" type="button" onClick={() => { setProfileError(false); setProfileRetry((value) => value + 1); }}>Try again</button>}
          </div>
        ) : !user ? (
          <div className="authBody">
            <p className="modalIntro authIntro">Save your watchlist across devices, connect with friends, and see what your circle is watching.</p>
            <button className="googleButton" type="button" onClick={() => void signInWithGoogle()} disabled={busy}><GoogleIcon />Continue with Google</button>
            <div className="authDivider"><span>or use email</span></div>
            <div className="authTabs" role="tablist" aria-label="Account options">
              <button type="button" className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>Sign in</button>
              <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Create account</button>
            </div>
            <form className="authForm" onSubmit={submitAuth}>
              {authMode === "signup" && <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required /></label>}
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
              <button className="primaryAction" type="submit" disabled={busy}>{busy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</button>
              {authMode === "signin" && <button className="textButton" type="button" onClick={() => void resetPassword()}>Reset password</button>}
            </form>
            {status && <p className="formStatus" role="status">{status}</p>}
          </div>
        ) : !profile ? (
          <form className="profileSetup" onSubmit={saveProfile}>
            <div className="profileSetupIntro"><span className="avatarLarge">{initials}</span><div><h3>Choose how friends find you</h3><p>Your watchlist stays visible only to friends you approve.</p></div></div>
            <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required /></label>
            <label>Username<div className="usernameField"><span>@</span><input value={username} onChange={(event) => setUsername(cleanUsername(event.target.value))} autoComplete="username" minLength={3} required /></div></label>
            <button className="primaryAction" type="submit" disabled={busy}>{busy ? "Saving…" : "Create profile"}</button>
            {status && <p className="formStatus" role="status">{status}</p>}
          </form>
        ) : (
          <div className="socialBody">
            <div className="accountSummary">
              {profile.photoURL ? <Image src={profile.photoURL} alt="" width={48} height={48} className="accountPhoto" /> : <span className="avatarLarge compact">{initials}</span>}
              <div><strong>{profile.displayName}</strong><span>@{profile.username}</span></div>
              <button className="textButton signOutButton" type="button" onClick={() => void signOut(firebaseAuth)}>Sign out</button>
            </div>
            {entryPoint === "account" && <FavoriteEpisodes />}
            {entryPoint === "account" && <div className="circleSectionHeading"><h3 id="your-circle-title">Your circle</h3><p>Friends, recommendations, and what you’re watching together.</p></div>}
            <div className="socialTabs" role="tablist" aria-labelledby={entryPoint === "account" ? "your-circle-title" : "social-title"}>
              <button type="button" className={activeTab === "friends" ? "active" : ""} onClick={() => setActiveTab("friends")}>Friends <span>{friends.length}</span></button>
              <button type="button" className={activeTab === "requests" ? "active" : ""} onClick={() => setActiveTab("requests")}>Requests {requestCount > 0 && <span>{requestCount}</span>}</button>
              <button type="button" className={activeTab === "inbox" ? "active" : ""} onClick={() => setActiveTab("inbox")}>Inbox {inboxCount > 0 && <span>{inboxCount}</span>}</button>
              <button type="button" className={activeTab === "recommendations" ? "active" : ""} onClick={() => setActiveTab("recommendations")}>For you {recommendationCount > 0 && <span>{recommendationCount}</span>}</button>
            </div>

            {activeTab === "friends" && <div className="socialPane">
              {selectedFriend ? <>
                <div className="friendWatchlistHeader"><button className="textButton" type="button" onClick={() => setSelectedFriend(null)}>← All friends</button><div><Person profile={selectedFriend} /><span>{friendWatchlist.length} saved</span></div></div>
                {friendWatchlist.length ? <div className="recommendationList">{friendWatchlist.map((title) => <button className="recommendationRow" type="button" key={title.id} onClick={() => { onOpenTitle(title); onClose(); }}><TitleArtwork className={`recommendationArt ${title.art}`} title={title} /><span><strong>{title.title}</strong><small>{title.year} · {title.genres.slice(0, 2).join(" · ")}</small><em>Saved by {selectedFriend.displayName}</em></span><b>{title.score}</b></button>)}</div> : <EmptySocial title="Nothing saved yet" copy={`${selectedFriend.displayName} has not added anything to their watchlist.`} />}
              </> : <>
                <form className="friendSearch" onSubmit={searchFriend}><input value={friendSearch} onChange={(event) => setFriendSearch(event.target.value)} placeholder="Search people" aria-label="Search by name or username" /><button type="submit" disabled={busy} aria-label="Find people">{busy ? "…" : "Find"}</button></form>
                {searchResults.length > 0 && <div className="friendSearchResults" aria-label="Matching members">{searchResults.map((result) => <div className="personRow highlighted" key={result.uid}><Person profile={result} /><button className="secondaryAction" type="button" onClick={() => void sendFriendRequest(result)}>Add friend</button></div>)}</div>}
                {status && <p className="formStatus" role="status">{status}</p>}
                <h3 className="socialListTitle">Your friends</h3>
                {friends.length ? <div className="peopleList">{friends.map((friend) => <div className="personRow" key={friend.uid}><Person profile={friend} /><div className="friendActions"><button className="secondaryAction" type="button" onClick={() => void openFriendWatchlist(friend)}>Watchlist</button><button className="textButton" type="button" onClick={() => void removeFriend(friend)}>Remove</button></div></div>)}</div> : <EmptySocial title="No friends yet" copy="Search for someone’s exact username to send your first request." />}
              </>}
            </div>}

            {activeTab === "requests" && <div className="socialPane">
              <h3>Friend requests</h3>
              {requests.length ? <div className="peopleList">{requests.map((request) => <div className="personRow requestRow" key={request.id}><Person profile={request.sender} /><div><button className="secondaryAction" type="button" onClick={() => void respondToRequest(request, true)}>Accept</button><button className="textButton" type="button" onClick={() => void respondToRequest(request, false)}>Decline</button></div></div>)}</div> : <EmptySocial title="You’re all caught up" copy="New friend requests will appear here." />}
            </div>}

            {activeTab === "inbox" && <div className="socialPane">
              <div className="recommendationHeading"><div><h3>Recommended directly to you</h3><p>Personal picks from people in your circle.</p></div></div>
              {directRecommendations.length ? <div className="directRecommendationList">{directRecommendations.map((item) => <article className={item.status === "sent" ? "unread" : ""} key={item.id}>
                <button className="directRecommendationMain" type="button" onClick={() => void openRecommendation(item)}>
                  <TitleArtwork className={`recommendationArt ${item.title.art}`} title={item.title} />
                  <span><small>{item.sender.displayName} recommends</small><strong>{item.title.title}</strong>{item.episode && <small>S{item.episode.seasonNumber} · E{item.episode.episodeNumber} — {item.episode.episodeName}</small>}<em>{item.message || `Thought you might like this ${item.title.mediaType}.`}</em></span>
                  {item.status === "sent" && <i>New</i>}
                </button>
                <div><button className="secondaryAction" type="button" onClick={() => void saveRecommendation(item)}>{item.status === "saved" || watchlistIds.includes(item.title.id) ? "Saved" : item.episode ? "+ Show watchlist" : "+ Watchlist"}</button><button className="textButton" type="button" onClick={() => void updateRecommendation(item, "dismissed")}>Dismiss</button></div>
              </article>)}</div> : <EmptySocial title="No recommendations yet" copy="When a friend sends you a title, it will appear here." />}
            </div>}

            {activeTab === "recommendations" && <div className="socialPane">
              <div className="recommendationHeading"><div><h3>From your friends’ watchlists</h3><p>Popular picks you have not saved yet.</p></div></div>
              {recommendations.length ? <div className="recommendationList">{recommendations.slice(0, 8).map((recommendation) => <button className="recommendationRow" type="button" key={recommendation.title.id} onClick={() => { onOpenTitle(recommendation.title); onClose(); }}><TitleArtwork className={`recommendationArt ${recommendation.title.art}`} title={recommendation.title} /><span><strong>{recommendation.title.title}</strong><small>{recommendation.title.year} · {recommendation.title.genres.slice(0, 2).join(" · ")}</small><em>{recommendation.friends.length === 1 ? `${recommendation.friends[0].displayName} saved this` : `${recommendation.friends.length} friends saved this`}</em></span><b>{recommendation.title.score}</b></button>)}</div> : <EmptySocial title="Recommendations are warming up" copy="Add friends to see titles from their watchlists here." />}
            </div>}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}

function Person({ profile }: { profile: Profile }) {
  const initials = profile.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="personIdentity">{profile.photoURL ? <Image src={profile.photoURL} alt="" width={38} height={38} className="accountPhoto" /> : <span className="personAvatar">{initials}</span>}<span><strong>{profile.displayName}</strong><small>@{profile.username}</small></span></div>;
}

function EmptySocial({ title, copy }: { title: string; copy: string }) {
  return <div className="socialEmpty"><span aria-hidden="true">◎</span><strong>{title}</strong><p>{copy}</p></div>;
}
