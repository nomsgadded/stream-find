import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { durations, groupCandidates, moods, type MemberTaste } from "@/lib/together-data";
import { getRegionConfig } from "@/lib/regions";

export const maxDuration = 60;

async function signedIn(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(header.slice(7)); } catch { return null; }
}

export async function GET(request: Request) {
  const user = await signedIn(request);
  if (!user) return Response.json({ error: "Sign in to see your movie nights." }, { status: 401 });
  const snapshot = await adminFirestore.collection("groupPicks").where("participantUids", "array-contains", user.uid).limit(20).get();
  const rooms = snapshot.docs.map((entry) => {
    const data = entry.data();
    return { id: entry.id, people: data.people, status: data.status, mood: data.mood, winner: data.candidates?.find((item: { key: string }) => item.key === data.winnerKey)?.title, createdAt: data.createdAt?.toMillis?.() ?? 0 };
  }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  return Response.json({ rooms }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await signedIn(request);
  if (!user) return Response.json({ error: "Sign in to invite friends." }, { status: 401 });
  let body: { friendUids?: unknown; mood?: unknown; duration?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Choose your movie-night settings." }, { status: 400 }); }
  const friendUids = Array.isArray(body.friendUids) ? [...new Set(body.friendUids)] : [];
  if (friendUids.length > 5 || friendUids.some((id) => typeof id !== "string" || !id || id === user.uid)) {
    return Response.json({ error: "Choose up to five friends." }, { status: 400 });
  }
  const mood = String(body.mood ?? "Any");
  const duration = String(body.duration ?? "Any");
  if (!moods.includes(mood) || !durations.includes(duration)) return Response.json({ error: "Choose a mood and time." }, { status: 400 });
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Group discovery is not configured." }, { status: 503 });

  try {
    const friendDocs = await Promise.all(friendUids.map((uid) => adminFirestore.doc(`users/${user.uid}/friends/${uid}`).get()));
    if (friendDocs.some((entry) => !entry.exists)) return Response.json({ error: "You can invite accepted friends only." }, { status: 403 });
    const uids = [user.uid, ...friendUids as string[]];
    const members = await Promise.all(uids.map(async (uid): Promise<MemberTaste> => {
      const [profile, settings, watchlist, signals] = await Promise.all([
        adminFirestore.doc(`users/${uid}`).get(),
        adminFirestore.doc(`users/${uid}/settings/app`).get(),
        adminFirestore.collection(`users/${uid}/watchlist`).limit(80).get(),
        adminFirestore.collection(`users/${uid}/tasteSignals`).limit(80).get(),
      ]);
      const data = settings.data();
      const preferred = Array.isArray(data?.preferredGenres) ? data.preferredGenres.filter((name: unknown) => typeof name === "string") as string[] : [];
      const liked = signals.docs.filter((entry) => ["loved", "watched"].includes(entry.data().signal)).flatMap((entry) => entry.data().genres ?? []);
      return {
        uid, name: String(profile.data()?.displayName || (uid === user.uid ? user.name : "Friend") || "Friend").slice(0, 60),
        region: getRegionConfig(data?.region).code,
        services: Array.isArray(data?.services) ? data.services.filter((name: unknown) => typeof name === "string").slice(0, 20) : [],
        genres: [...preferred, ...liked].filter((name): name is string => typeof name === "string"),
        saved: new Set(watchlist.docs.flatMap((entry) => {
          const item = entry.data();
          return Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0 && ["movie", "show"].includes(item.mediaType) ? [`${item.mediaType}-${item.tmdbId}`] : [];
        })),
      };
    }));
    const candidates = await groupCandidates(members, mood, duration, token);
    if (!candidates.length) return Response.json({ error: "No included picks matched these services and filters. Try another mood or time, or add a service." }, { status: 422 });
    const reference = adminFirestore.collection("groupPicks").doc();
    const people = members.map(({ uid, name, region }) => ({ uid, name, region }));
    await reference.set({ hostUid: user.uid, participantUids: uids, people, region: members[0].region, mood, duration, candidates, votes: {}, status: "open", createdAt: FieldValue.serverTimestamp() });
    if (friendUids.length) {
      const batch = adminFirestore.batch();
      for (const uid of friendUids as string[]) {
        batch.set(adminFirestore.doc(`users/${uid}/notifications/group-invite-${reference.id}`), {
          type: "group_invite", toUid: uid, actor: { uid: user.uid, displayName: members[0].name },
          heading: `${members[0].name} invited you to pick tonight’s watch`,
          body: `Vote on ${candidates.length} picks available on your circle’s services.`,
          href: `/together/${reference.id}`, createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return Response.json({ id: reference.id }, { status: 201 });
  } catch {
    return Response.json({ error: "Your movie night could not be created. Try again." }, { status: 502 });
  }
}
