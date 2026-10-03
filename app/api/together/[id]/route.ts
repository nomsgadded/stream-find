import { adminAuth, adminFirestore } from "@/lib/firebase-admin";

type Params = { params: Promise<{ id: string }> };

async function authenticated(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(header.slice(7)); } catch { return null; }
}

export async function GET(request: Request, { params }: Params) {
  const user = await authenticated(request);
  if (!user) return Response.json({ error: "Sign in to join this movie night." }, { status: 401 });
  const { id } = await params;
  if (!/^[a-zA-Z0-9]{16,32}$/.test(id)) return Response.json({ error: "Movie night not found." }, { status: 404 });
  const snapshot = await adminFirestore.doc(`groupPicks/${id}`).get();
  if (!snapshot.exists) return Response.json({ error: "Movie night not found." }, { status: 404 });
  const data = snapshot.data()!;
  if (!data.participantUids?.includes(user.uid)) return Response.json({ error: "This movie night is for invited friends." }, { status: 403 });
  return Response.json({ room: {
    id, hostUid: data.hostUid, people: data.people, region: data.region, mood: data.mood,
    duration: data.duration, candidates: data.candidates, votes: data.votes ?? {},
    status: data.status, winnerKey: data.winnerKey ?? null,
  } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Params) {
  const user = await authenticated(request);
  if (!user) return Response.json({ error: "Sign in to vote." }, { status: 401 });
  const { id } = await params;
  if (!/^[a-zA-Z0-9]{16,32}$/.test(id)) return Response.json({ error: "Movie night not found." }, { status: 404 });
  let body: { action?: unknown; candidateKey?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Choose a title." }, { status: 400 }); }
  const action = body.action === "finalize" ? "finalize" : body.action === "vote" ? "vote" : null;
  const candidateKey = body.candidateKey;
  if (!action || (candidateKey !== null && typeof candidateKey !== "string")) return Response.json({ error: "Choose a title." }, { status: 400 });

  const reference = adminFirestore.doc(`groupPicks/${id}`);
  try {
    await adminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error("not-found");
      const data = snapshot.data()!;
      if (!data.participantUids?.includes(user.uid)) throw new Error("forbidden");
      if (data.status !== "open") throw new Error("closed");
      if (action === "finalize" && data.hostUid !== user.uid) throw new Error("forbidden");
      if (candidateKey !== null && !data.candidates?.some((candidate: { key: string }) => candidate.key === candidateKey)) throw new Error("invalid");
      if (action === "finalize") {
        if (!candidateKey) throw new Error("invalid");
        transaction.update(reference, { status: "decided", winnerKey: candidateKey });
      } else {
        const votes = { ...(data.votes ?? {}) };
        if (candidateKey) votes[user.uid] = candidateKey;
        else delete votes[user.uid];
        transaction.update(reference, { votes });
      }
    });
    return Response.json({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const status = reason === "not-found" ? 404 : reason === "forbidden" ? 403 : reason === "closed" ? 409 : reason === "invalid" ? 400 : 500;
    return Response.json({ error: status === 409 ? "This movie night already has a final pick." : status === 403 ? "You are not invited to this movie night." : "That vote could not be saved." }, { status });
  }
}
