"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { titlePath } from "@/lib/title-routes";
import { rememberTitleNavigation } from "@/lib/title-navigation";

type Friend = { uid: string; displayName: string; photoURL?: string };
type Candidate = { key: string; tmdbId: number; mediaType: "movie" | "show"; title: string; year?: number; posterUrl: string; availableOn: string[]; includedFor: number; savedBy: string[]; reason: string; rank: number };
type Room = { id: string; hostUid: string; people: Array<{ uid: string; name: string; region: string }>; region: string; mood: string; duration: string; candidates: Candidate[]; votes: Record<string, string>; status: "open" | "decided"; winnerKey?: string | null };
type RecentRoom = { id: string; people: Room["people"]; status: string; mood: string; winner?: string };
const moods = ["Any", "Funny", "Thrilling", "Heartwarming", "Sci-fi"];
const durations = ["Any", "Under 2 hours", "One episode"];

export default function TogetherPage({ roomId }: { roomId?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mood, setMood] = useState("Any");
  const [duration, setDuration] = useState("Any");
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(Boolean(roomId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => onAuthStateChanged(firebaseAuth, (account) => { setUser(account); setAuthReady(true); }), []);

  const request = useCallback(async (path: string, options?: RequestInit) => {
    if (!user) throw new Error("Sign in to continue.");
    const token = await user.getIdToken();
    const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options?.body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }, [user]);

  useEffect(() => {
    if (!user || roomId) return;
    let cancelled = false;
    void Promise.all([
      getDocs(collection(firestore, "users", user.uid, "friends")),
      request("/api/together"),
    ]).then(([snapshot, data]) => {
      if (cancelled) return;
      setFriends(snapshot.docs.map((entry) => ({ uid: entry.id, displayName: entry.data().displayName || "Friend", photoURL: entry.data().photoURL })));
      setRecent(data.rooms ?? []);
    }).catch(() => { if (!cancelled) setError("Your friends or recent movie nights could not load."); });
    return () => { cancelled = true; };
  }, [user, roomId, request]);

  const refresh = useCallback(async () => {
    if (!roomId || !user) return;
    try {
      const data = await request(`/api/together/${roomId}`);
      setRoom(data.room);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "This movie night could not load."); }
    finally { setLoading(false); }
  }, [roomId, user, request]);

  useEffect(() => {
    if (!roomId || !user) return;
    const frame = window.requestAnimationFrame(() => { void refresh(); });
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 6000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(interval); };
  }, [roomId, user, refresh]);

  const candidates = useMemo(() => [...(room?.candidates ?? [])].sort((a, b) => {
    const aVotes = Object.values(room?.votes ?? {}).filter((key) => key === a.key).length;
    const bVotes = Object.values(room?.votes ?? {}).filter((key) => key === b.key).length;
    return bVotes - aVotes || b.rank - a.rank;
  }), [room]);
  const winner = room?.candidates.find((candidate) => candidate.key === room.winnerKey);

  const create = async () => {
    setBusy(true); setError("");
    try {
      const data = await request("/api/together", { method: "POST", body: JSON.stringify({ friendUids: selected, mood, duration }) });
      router.push(`/together/${data.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your movie night could not be created."); }
    finally { setBusy(false); }
  };

  const act = async (action: "vote" | "finalize", candidateKey: string | null) => {
    setBusy(true); setError("");
    try {
      await request(`/api/together/${roomId}`, { method: "POST", body: JSON.stringify({ action, candidateKey }) });
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your choice could not be saved."); }
    finally { setBusy(false); }
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError("Copy failed. You can share this page’s address from your browser."); }
  };

  return <main className="togetherPage">
    <header className="togetherHeader"><Link href="/" className="togetherBrand"><span aria-hidden="true">▶</span> Stream Find</Link><Link href="/">← Discover</Link></header>
    <div className="togetherShell">
      <p className="sectionKicker">Stream Find together</p>
      {!authReady ? <p className="togetherStatus">Loading your account…</p> : !user ? <section className="togetherIntro"><h1>Decide what to watch together.</h1><p>Sign in to invite friends and vote on a shared short list.</p><Link className="togetherPrimary" href={`/?panel=friends&next=${encodeURIComponent(roomId ? `/together/${roomId}` : "/together")}`}>Sign in to Stream Find</Link><small>You’ll return to this movie night after signing in.</small></section> : !roomId ? <>
        <section className="togetherIntro"><h1>Make the choice together.</h1><p>Pick a mood and a time. We’ll find movies and shows included on your circle’s services, then everyone gets a vote.</p></section>
        <div className="togetherSetup">
          <section><span className="togetherStep">01 / YOUR CIRCLE</span><h2>Who’s watching?</h2><p>Invite up to five accepted friends. They’ll get an Activity invitation and can vote from their own account.</p>
            {friends.length ? <div className="togetherFriends">{friends.map((friend) => <label key={friend.uid}><input type="checkbox" checked={selected.includes(friend.uid)} disabled={!selected.includes(friend.uid) && selected.length >= 5} onChange={() => setSelected((current) => current.includes(friend.uid) ? current.filter((uid) => uid !== friend.uid) : [...current, friend.uid])} /><span className="togetherAvatar">{friend.displayName.slice(0, 1).toUpperCase()}</span><span>{friend.displayName}</span></label>)}</div> : <p className="togetherHint">No friends yet? You can make a solo short list now, or <Link href="/?panel=friends">find friends</Link> first.</p>}</section>
          <section><span className="togetherStep">02 / SET THE VIBE</span><h2>What feels right?</h2><div className="togetherChoices" role="group" aria-label="Choose a mood">{moods.map((option) => <button type="button" aria-pressed={mood === option} className={mood === option ? "selected" : ""} onClick={() => setMood(option)} key={option}>{option}</button>)}</div></section>
          <section><span className="togetherStep">03 / YOUR TIME</span><h2>How long do you have?</h2><div className="togetherChoices" role="group" aria-label="Choose a time">{durations.map((option) => <button type="button" aria-pressed={duration === option} className={duration === option ? "selected" : ""} onClick={() => setDuration(option)} key={option}>{option}</button>)}</div><p className="togetherHint">Availability uses the host’s country. Friends in another country should check their own title page before watching.</p></section>
        </div>
        {error && <p className="togetherError" role="alert">{error}</p>}
        <button className="togetherPrimary togetherCreate" type="button" onClick={() => void create()} disabled={busy}>{busy ? "Finding your picks…" : selected.length ? `Find picks for ${selected.length + 1} people →` : "Find my picks →"}</button>
        {recent.length > 0 && <section className="togetherRecent"><h2>Your movie nights</h2>{recent.map((item) => <Link href={`/together/${item.id}`} key={item.id}><strong>{item.winner ? `You picked ${item.winner}` : `${item.people.length} ${item.people.length === 1 ? "person" : "people"} · ${item.mood} mood`}</strong><span>{item.status === "decided" ? "View pick" : "Voting open"} →</span></Link>)}</section>}
      </> : loading && !room ? <p className="togetherStatus">Finding your movie night…</p> : !room ? <section className="togetherIntro"><h1>This movie night isn’t available.</h1><p role="alert">{error}</p><Link className="togetherPrimary" href="/together">Start a movie night</Link></section> : <>
        <section className="togetherIntro"><span className="togetherStep">{room.status === "decided" ? "THE PICK IS IN" : "VOTING IS OPEN"}</span><h1>{winner ? `Tonight, watch ${winner.title}.` : "What are we watching?"}</h1><p>{room.people.map((person) => person.name).join(", ")} · {room.mood} mood · {room.duration === "Any" ? "Flexible time" : room.duration} · {room.region} availability</p><div className="togetherRoomActions"><button type="button" onClick={() => void copyInvite()}>{copied ? "Link copied ✓" : "Copy invite link"}</button><small>Only invited friends can open and vote.</small></div></section>
        {error && <p className="togetherError" role="alert">{error}</p>}
        <div className="togetherResultsHeading"><div><p className="sectionKicker">A short list for your circle</p><h2>{winner ? "Your chosen title" : `${candidates.length} picks to consider`}</h2></div><span>{Object.keys(room.votes).length} of {room.people.length} voted</span></div>
        <div className="togetherCandidates">{(winner ? [winner, ...candidates.filter((candidate) => candidate.key !== winner.key)] : candidates).map((candidate) => {
          const votes = Object.entries(room.votes).filter(([, key]) => key === candidate.key).map(([uid]) => room.people.find((person) => person.uid === uid)?.name || "Friend");
          const href = titlePath({ title: candidate.title, mediaType: candidate.mediaType, tmdbId: candidate.tmdbId })!;
          return <article className={winner?.key === candidate.key ? "togetherCandidate winner" : "togetherCandidate"} key={candidate.key}>
            <Link href={href} onClick={() => rememberTitleNavigation(href)} className="togetherCandidatePoster" style={{ backgroundImage: `url(${JSON.stringify(candidate.posterUrl)})` }} aria-label={`Explore ${candidate.title}`} />
            <div><p className="togetherStep">{candidate.mediaType === "show" ? "SERIES" : "MOVIE"}{candidate.year ? ` · ${candidate.year}` : ""}{winner?.key === candidate.key ? " · TONIGHT’S PICK" : ""}</p><h3>{candidate.title}</h3><p>{candidate.reason}</p><small>Included on {candidate.availableOn.slice(0, 3).join(", ")}{candidate.availableOn.length > 3 ? ` +${candidate.availableOn.length - 3} more` : ""} in {room.region}</small><div className="togetherVotes">{votes.length ? `${votes.length} ${votes.length === 1 ? "vote" : "votes"} · ${votes.join(", ")}` : "No votes yet"}</div><div className="togetherCandidateActions"><Link href={href} onClick={() => rememberTitleNavigation(href)}>Details & where to watch →</Link>{room.status === "open" && <button type="button" disabled={busy} className={room.votes[user.uid] === candidate.key ? "selected" : ""} onClick={() => void act("vote", room.votes[user.uid] === candidate.key ? null : candidate.key)}>{room.votes[user.uid] === candidate.key ? "✓ Your vote" : "Vote for this"}</button>}{room.status === "open" && room.hostUid === user.uid && <button type="button" className="togetherFinalize" disabled={busy} onClick={() => void act("finalize", candidate.key)}>Choose this</button>}</div></div>
          </article>;
        })}</div>
        <p className="togetherFootnote">Picks are ranked by included access, saved titles, taste and TMDB popularity. Availability is checked for the host’s country; open a title for current watch links. People’s private taste signals are never shown to the group.</p>
      </>}
    </div>
  </main>;
}
