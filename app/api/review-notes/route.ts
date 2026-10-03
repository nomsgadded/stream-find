import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";

type ReviewNoteInput = {
  id?: unknown;
  x?: unknown;
  y?: unknown;
  target?: unknown;
  text?: unknown;
  createdAt?: unknown;
};

const MAX_NOTES = 50;

export async function GET(request: Request) {
  const page = cleanPage(new URL(request.url).searchParams.get("page"));
  if (!page) return Response.json({ error: "A valid review page is required." }, { status: 400 });

  const snapshot = await notesCollection(page).limit(MAX_NOTES).get();
  const notes = snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() } as { id: string; createdAt?: string; [key: string]: unknown }))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  return Response.json({ notes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json() as { page?: unknown; note?: ReviewNoteInput };
  const page = cleanPage(body.page);
  const note = cleanNote(body.note);
  if (!page || !note) return Response.json({ error: "The review note is invalid." }, { status: 400 });

  const collection = notesCollection(page);
  const existing = await collection.limit(MAX_NOTES).get();
  if (existing.size >= MAX_NOTES && !existing.docs.some((entry) => entry.id === note.id)) {
    return Response.json({ error: "This page has reached its review-note limit." }, { status: 409 });
  }

  await collection.doc(note.id).set({
    ...note,
    page,
    syncedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return Response.json({ note });
}

export async function DELETE(request: Request) {
  const body = await request.json() as { page?: unknown; id?: unknown };
  const page = cleanPage(body.page);
  const id = typeof body.id === "string" && /^[a-zA-Z0-9_-]{5,80}$/.test(body.id) ? body.id : null;
  if (!page || !id) return Response.json({ error: "The review note is invalid." }, { status: 400 });
  await notesCollection(page).doc(id).delete();
  return Response.json({ deleted: true });
}

function notesCollection(page: string) {
  const pageId = createHash("sha256").update(page).digest("hex").slice(0, 32);
  return adminFirestore.collection("reviewSessions").doc(pageId).collection("notes");
}

function cleanPage(value: unknown) {
  if (typeof value !== "string") return null;
  const page = value.trim();
  return page.startsWith("/") && page.length <= 240 && !page.includes("..") ? page : null;
}

function cleanNote(value?: ReviewNoteInput) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" && /^[a-zA-Z0-9_-]{5,80}$/.test(value.id) ? value.id : null;
  const x = typeof value.x === "number" && Number.isFinite(value.x) ? Math.max(0, Math.round(value.x)) : null;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? Math.max(0, Math.round(value.y)) : null;
  const target = typeof value.target === "string" ? value.target.trim().slice(0, 180) : "";
  const text = typeof value.text === "string" ? value.text.trim().slice(0, 600) : "";
  const createdAt = typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt))
    ? new Date(value.createdAt).toISOString()
    : new Date().toISOString();
  return id && x !== null && y !== null && target && text ? { id, x, y, target, text, createdAt } : null;
}
