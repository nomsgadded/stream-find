import { adminAuth, adminFirestore } from "@/lib/firebase-admin";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return Response.json({ error: "Sign in to find friends." }, { status: 401 });
  let user;
  try {
    user = await adminAuth.verifyIdToken(authorization.slice(7));
  } catch {
    return Response.json({ error: "Your sign-in has expired." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  if (query.length < 2 || query.length > 60) return Response.json({ error: "Enter between 2 and 60 characters." }, { status: 400 });

  const snapshot = await adminFirestore.collection("users").limit(500).get();
  const results = snapshot.docs
    .flatMap((entry) => {
      const data = entry.data();
      const uid = String(data.uid ?? entry.id);
      const displayName = String(data.displayName ?? "").trim();
      const username = String(data.username ?? "").trim();
      const displayNameLower = displayName.toLowerCase();
      const usernameLower = username.toLowerCase();
      if (!displayName || !username || uid === user.uid || (!displayNameLower.includes(query) && !usernameLower.includes(query.replace(/^@/, "")))) return [];
      const rank = usernameLower === query.replace(/^@/, "") ? 0 : displayNameLower.startsWith(query) ? 1 : usernameLower.startsWith(query.replace(/^@/, "")) ? 2 : 3;
      return [{ uid, displayName, username, usernameLower, ...(data.photoURL ? { photoURL: String(data.photoURL) } : {}), rank }];
    })
    .sort((a, b) => a.rank - b.rank || a.displayName.localeCompare(b.displayName))
    .slice(0, 8)
    .map((profile) => ({ uid: profile.uid, displayName: profile.displayName, username: profile.username, usernameLower: profile.usernameLower, ...(profile.photoURL ? { photoURL: profile.photoURL } : {}) }));

  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
