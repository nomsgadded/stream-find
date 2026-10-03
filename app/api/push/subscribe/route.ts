import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { getRegionConfig } from "@/lib/regions";

type PushSubscriptionPayload = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { auth?: string; p256dh?: string };
};

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  try {
    return await adminAuth.verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

function validSubscription(value: PushSubscriptionPayload | undefined) {
  return Boolean(
    value?.endpoint?.startsWith("https://")
      && value.keys?.auth
      && value.keys.p256dh
      && value.endpoint.length < 3000,
  );
}

function subscriptionId(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return Response.json({ error: "Sign in to enable notifications." }, { status: 401 });

  let body: { subscription?: PushSubscriptionPayload; region?: string };
  try {
    body = await request.json() as { subscription?: PushSubscriptionPayload; region?: string };
  } catch {
    return Response.json({ error: "The notification request is invalid." }, { status: 400 });
  }
  if (!validSubscription(body.subscription)) {
    return Response.json({ error: "The browser subscription is invalid." }, { status: 400 });
  }

  const subscription = body.subscription as Required<Pick<PushSubscriptionPayload, "endpoint" | "keys">> & PushSubscriptionPayload;
  const id = subscriptionId(subscription.endpoint);
  const region = getRegionConfig(body.region);
  await adminFirestore.doc(`users/${user.uid}/pushSubscriptions/${id}`).set({
    subscription,
    region: region.code,
    enabled: true,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return Response.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return Response.json({ error: "Sign in to change notifications." }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = await request.json() as { endpoint?: string };
  } catch {
    return Response.json({ error: "The notification request is invalid." }, { status: 400 });
  }
  if (!body.endpoint?.startsWith("https://")) {
    return Response.json({ error: "The browser subscription is invalid." }, { status: 400 });
  }

  await adminFirestore.doc(`users/${user.uid}/pushSubscriptions/${subscriptionId(body.endpoint)}`).delete();
  return Response.json({ subscribed: false });
}
