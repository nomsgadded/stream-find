import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import webpush from "web-push";

initializeApp();

const db = getFirestore();
const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY");
const watchmodeApiKey = defineSecret("WATCHMODE_API_KEY");
const VAPID_PUBLIC_KEY = "BKAb51ZZ0qr5N8_LWvzjhgoTbIXMIjubN0h0lZZhWhjspZ-gMthbrqpxmQMBkb2R31l4gNexk4bPjKqChUO2qvI";
const ALERTS_URL = "https://stream-find--stream-find.us-east4.hosted.app/api/watchlist-alerts";
const APP_URL = "https://stream-find--stream-find.us-east4.hosted.app/?view=watchlist";
const WATCHMODE_API = "https://api.watchmode.com/v1";

export const sendActivityNotification = onDocumentCreated({
  document: "users/{userId}/notifications/{notificationId}",
  region: "us-east4",
  memory: "256MiB",
  timeoutSeconds: 60,
  secrets: [vapidPrivateKey],
}, async (event) => {
  const activity = event.data?.data();
  if (!activity || activity.type === "release_alert") return;

  const preferenceSnapshot = await db.doc(`users/${event.params.userId}/settings/notifications`).get();
  const preferences = preferenceSnapshot.data() ?? {};
  const preferenceKey = activity.type === "recommendation"
    ? "recommendations"
    : String(activity.type).startsWith("availability_")
      ? "availability"
      : "friends";
  if (preferences[preferenceKey] === false) return;

  webpush.setVapidDetails(
    "https://stream-find--stream-find.us-east4.hosted.app",
    VAPID_PUBLIC_KEY,
    vapidPrivateKey.value(),
  );
  const subscriptions = await db.collection(`users/${event.params.userId}/pushSubscriptions`).get();
  if (subscriptions.empty) return;

  const payload = JSON.stringify({
    title: String(activity.heading ?? "New Stream Find activity"),
    body: String(activity.body ?? "Open Stream Find to see what’s new."),
    tag: `stream-find-activity-${event.params.notificationId}`,
    url: absoluteAppUrl(activity.href),
  });
  await Promise.all(subscriptions.docs.filter((entry) => entry.get("enabled") === true).map(async (entry) => {
    try {
      await webpush.sendNotification(entry.get("subscription"), payload, { TTL: 86_400 });
      await entry.ref.set({ lastDeliveredAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await entry.ref.delete();
      else console.error("Activity notification delivery failed", error);
    }
  }));
});

export const checkAvailabilityChanges = onSchedule({
  schedule: "every day 08:00",
  timeZone: "America/Los_Angeles",
  region: "us-east4",
  memory: "256MiB",
  timeoutSeconds: 300,
  secrets: [watchmodeApiKey],
}, async () => {
  const watchlist = await db.collectionGroup("watchlist").limit(200).get();
  const entries = watchlist.docs.flatMap((entry) => {
    const userRef = entry.ref.parent.parent;
    const title = entry.data();
    const watchmodeId = Number(title.watchmodeId);
    if (!userRef || !Number.isSafeInteger(watchmodeId) || watchmodeId <= 0 || !String(title.title ?? "").trim()) return [];
    return [{ entry, userRef, title, watchmodeId }];
  });
  if (!entries.length) return;

  const userRefs = new Map(entries.map(({ userRef }) => [userRef.id, userRef]));
  const watchedByUser = new Map(await Promise.all([...userRefs].map(async ([userId, userRef]) => {
    const signals = await userRef.collection("tasteSignals").get();
    return [userId, new Set(signals.docs.filter((signal) => signal.get("watched") === true || signal.get("signal") === "watched").map((signal) => signal.id))];
  })));
  const activeEntries = entries.filter(({ entry, userRef }) => !watchedByUser.get(userRef.id)?.has(entry.id));
  if (!activeEntries.length) return;
  const userSettings = new Map(await Promise.all([...userRefs].map(async ([userId, userRef]) => {
    const settings = (await userRef.collection("settings").doc("app").get()).data() ?? {};
    return [userId, {
      region: validRegion(settings.region),
      currency: validCurrency(settings.currency),
    }];
  })));

  const uniqueChecks = new Map();
  for (const item of activeEntries) {
    const settings = userSettings.get(item.userRef.id) ?? { region: "US", currency: "USD" };
    for (const id of titleWatchmodeIds(item.title, item.watchmodeId)) {
      uniqueChecks.set(`${settings.region}:${id}`, { watchmodeId: id, region: settings.region });
    }
  }
  const availability = new Map();
  await mapWithConcurrency([...uniqueChecks], 6, async ([key, request]) => {
    const offers = await fetchWatchmodeOffers(request.watchmodeId, request.region, watchmodeApiKey.value());
    if (offers) availability.set(key, offers);
  });

  await mapWithConcurrency(activeEntries, 8, async ({ entry, userRef, title, watchmodeId }) => {
    const settings = userSettings.get(userRef.id) ?? { region: "US", currency: "USD" };
    const ids = titleWatchmodeIds(title, watchmodeId);
    // An incomplete catalog response must not generate false removal alerts.
    if (ids.some((id) => !availability.has(`${settings.region}:${id}`))) return;
    const offers = [...new Map(ids.flatMap((id) => availability.get(`${settings.region}:${id}`))
      .map((offer) => [`${offer.provider}:${offer.type}:${offer.price ?? ""}`, offer])).values()];

    const snapshotRef = userRef.collection("availabilitySnapshots").doc(entry.id);
    const previousSnapshot = await snapshotRef.get();
    const previous = previousSnapshot.data();
    const snapshot = {
      titleId: Number(title.id),
      watchmodeId,
      title: String(title.title),
      mediaType: title.mediaType === "show" ? "show" : "movie",
      region: settings.region,
      currency: settings.currency,
      offers,
      ...(title.posterUrl ? { imageUrl: String(title.posterUrl) } : {}),
      checkedAt: FieldValue.serverTimestamp(),
    };

    if (!previousSnapshot.exists || previous?.region !== settings.region || !Array.isArray(previous?.offers)) {
      await snapshotRef.set({ ...snapshot, baselineCreatedAt: FieldValue.serverTimestamp() });
      return;
    }

    const changes = compareOffers(previous.offers, offers, settings.currency);
    if (changes.length) {
      const primary = changes[0];
      const date = new Date().toISOString().slice(0, 10);
      const signature = simpleHash(changes.map((change) => `${change.type}:${change.provider}:${change.offerType}:${change.price ?? ""}`).join("|"));
      const notificationRef = userRef.collection("notifications").doc(`availability-${safeId(entry.id)}-${date}-${signature}`);
      if (!(await notificationRef.get()).exists) {
        await notificationRef.set({
          type: primary.type,
          toUid: userRef.id,
          sourceId: `${entry.id}:${signature}`,
          titleId: Number(title.id),
          heading: availabilityHeading(String(title.title), primary),
          body: `${primary.message}${changes.length > 1 ? ` Plus ${changes.length - 1} more change${changes.length === 2 ? "" : "s"}.` : ""}`,
          href: titleHref(title, watchmodeId),
          ...(title.posterUrl ? { imageUrl: String(title.posterUrl) } : {}),
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    await snapshotRef.set(snapshot);
  });
});

export const sendReleaseAlerts = onSchedule({
  schedule: "every day 09:00",
  timeZone: "America/Los_Angeles",
  region: "us-east4",
  memory: "256MiB",
  timeoutSeconds: 300,
  secrets: [vapidPrivateKey],
}, async () => {
  webpush.setVapidDetails(
    "https://stream-find--stream-find.us-east4.hosted.app",
    VAPID_PUBLIC_KEY,
    vapidPrivateKey.value(),
  );

  const subscriptions = await db.collectionGroup("pushSubscriptions").get();
  for (const subscriptionDoc of subscriptions.docs) {
    if (subscriptionDoc.get("enabled") !== true) continue;
    const userRef = subscriptionDoc.ref.parent.parent;
    if (!userRef) continue;
    const watchlistSnapshot = await userRef.collection("watchlist").limit(100).get();
    const signals = await userRef.collection("tasteSignals").get();
    const watchedIds = new Set(signals.docs.filter((signal) => signal.get("watched") === true || signal.get("signal") === "watched").map((signal) => signal.id));
    const titles = watchlistSnapshot.docs.filter((entry) => !watchedIds.has(entry.id)).map((entry) => {
      const title = entry.data();
      return {
        id: Number(title.id),
        title: String(title.title ?? ""),
        year: Number(title.year) || undefined,
        mediaType: title.mediaType === "show" ? "show" : "movie",
        tmdbId: Number(title.tmdbId) || undefined,
        posterUrl: typeof title.posterUrl === "string" ? title.posterUrl : undefined,
      };
    }).filter((title) => Number.isSafeInteger(title.id) && title.title).slice(0, 12);
    if (!titles.length) continue;

    const response = await fetch(ALERTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region: subscriptionDoc.get("region") || "US", titles }),
    });
    if (!response.ok) continue;
    const data = await response.json();
    const dueAlerts = (Array.isArray(data.alerts) ? data.alerts : []).filter(isDueSoon);
    if (!dueAlerts.length) continue;

    const delivered = new Set(Array.isArray(subscriptionDoc.get("deliveredAlertKeys"))
      ? subscriptionDoc.get("deliveredAlertKeys")
      : []);
    const newAlerts = dueAlerts.filter((alert) => !delivered.has(alertKey(alert)));
    if (!newAlerts.length) continue;

    await Promise.all(newAlerts.map(async (alert) => {
      const notificationRef = userRef.collection("notifications").doc(`release-${safeId(alertKey(alert))}`);
      if ((await notificationRef.get()).exists) return;
      const savedTitle = titles.find((title) => title.id === alert.titleId);
      await notificationRef.set({
        type: "release_alert",
        toUid: userRef.id,
        sourceId: alertKey(alert),
        heading: `${alert.title}: ${alert.label}`,
        body: alert.detail,
        href: releaseHref(alert, titles),
        titleId: alert.titleId,
        ...(savedTitle?.posterUrl ? { imageUrl: savedTitle.posterUrl } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
    }));

    const preferences = (await userRef.collection("settings").doc("notifications").get()).data() ?? {};
    if (preferences.releases === false) continue;

    const first = newAlerts[0];
    const payload = JSON.stringify({
      title: newAlerts.length === 1 ? `${first.title}: ${first.label}` : `${newAlerts.length} Stream Find release updates`,
      body: newAlerts.length === 1 ? first.detail : `${first.title} and ${newAlerts.length - 1} more saved titles have updates.`,
      tag: `stream-find-${first.titleId}-${first.date}`,
      url: newAlerts.length === 1 ? absoluteAppUrl(releaseHref(first, titles)) : APP_URL,
    });

    try {
      await webpush.sendNotification(subscriptionDoc.get("subscription"), payload, { TTL: 86_400 });
      await subscriptionDoc.ref.set({
        deliveredAlertKeys: [...delivered, ...newAlerts.map(alertKey)].slice(-60),
        lastDeliveredAt: FieldValue.serverTimestamp(),
        lastCheckedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await subscriptionDoc.ref.delete();
      else console.error("Release alert delivery failed", error);
    }
  }
});

function alertKey(alert) {
  return `${alert.titleId}:${alert.kind}:${alert.date}`;
}

function titleWatchmodeIds(title, primaryId) {
  return [...new Set([primaryId, ...(Array.isArray(title.watchmodeIds) ? title.watchmodeIds : [])])]
    .filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 8);
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function isDueSoon(alert) {
  if (!alert?.date) return false;
  const date = new Date(`${String(alert.date).slice(0, 10)}T12:00:00Z`).getTime();
  if (!Number.isFinite(date)) return false;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  const days = Math.round((date - today) / 86_400_000);
  if (alert.kind === "upcoming_episode") return days >= 0 && days <= 2;
  if (alert.kind === "recent_episode" || alert.kind === "recent_release") return days >= -1 && days <= 0;
  return days >= 0 && days <= 7;
}

function absoluteAppUrl(path) {
  const value = typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new URL(value, "https://stream-find--stream-find.us-east4.hosted.app").toString();
}

async function fetchWatchmodeOffers(watchmodeId, region, apiKey) {
  const url = new URL(`${WATCHMODE_API}/title/${watchmodeId}/details/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("append_to_response", "sources");
  url.searchParams.set("regions", region);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const details = await response.json();
    const offers = new Map();
    for (const source of Array.isArray(details.sources) ? details.sources : []) {
      if (source.region && source.region !== region) continue;
      const type = normalizeOfferType(source.type);
      const provider = normalizeProvider(source.name);
      if (!type || !provider) continue;
      const numericPrice = Number(source.price);
      const price = Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : undefined;
      const key = `${provider}|${type}`;
      const existing = offers.get(key);
      if (!existing || (price && (!existing.price || price < existing.price))) {
        offers.set(key, { provider, type, ...(price ? { price } : {}) });
      }
    }
    return [...offers.values()].sort((a, b) => offerRank(a.type) - offerRank(b.type) || a.provider.localeCompare(b.provider));
  } catch (error) {
    console.error("Availability check failed", { watchmodeId, region, error });
    return null;
  }
}

function compareOffers(previousOffers, currentOffers, currency) {
  const previous = new Map(previousOffers.map((offer) => [`${offer.provider}|${offer.type}`, offer]));
  const current = new Map(currentOffers.map((offer) => [`${offer.provider}|${offer.type}`, offer]));
  const changes = [];
  for (const [key, offer] of current) {
    const old = previous.get(key);
    if (!old) {
      const type = offer.type === "included" ? "availability_included" : offer.type === "free" ? "availability_free" : "availability_new";
      changes.push({ type, provider: offer.provider, offerType: offer.type, price: offer.price, message: addedOfferMessage(offer, currency) });
    } else if (offer.price && old.price && offer.price < old.price - 0.009) {
      changes.push({
        type: "availability_price_drop",
        provider: offer.provider,
        offerType: offer.type,
        price: offer.price,
        message: `${capitalize(offer.type)} on ${offer.provider} dropped from ${formatMoney(old.price, currency)} to ${formatMoney(offer.price, currency)}.`,
      });
    }
  }
  for (const [key, offer] of previous) {
    if (!current.has(key)) changes.push({
      type: "availability_removed",
      provider: offer.provider,
      offerType: offer.type,
      message: `${capitalize(offer.type)} access is no longer listed on ${offer.provider}.`,
    });
  }
  const rank = { availability_included: 0, availability_free: 1, availability_price_drop: 2, availability_new: 3, availability_removed: 4 };
  return changes.sort((a, b) => rank[a.type] - rank[b.type]).slice(0, 6);
}

function addedOfferMessage(offer, currency) {
  if (offer.type === "included") return `Now included with ${offer.provider}.`;
  if (offer.type === "free") return `Now available free on ${offer.provider}.`;
  return `Now available to ${offer.type} on ${offer.provider}${offer.price ? ` for ${formatMoney(offer.price, currency)}` : ""}.`;
}

function availabilityHeading(title, change) {
  if (change.type === "availability_included") return `${title} is now included`;
  if (change.type === "availability_free") return `${title} is now free`;
  if (change.type === "availability_price_drop") return `${title} dropped in price`;
  if (change.type === "availability_removed") return `${title} changed providers`;
  return `${title} has a new watch option`;
}

function titleHref(title, watchmodeId) {
  const slug = String(title.title).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "title";
  return `/title/wm-${watchmodeId}-${slug}`;
}

function releaseHref(alert, titles) {
  const title = titles.find((item) => item.id === alert.titleId);
  if (!title) return "/?view=watchlist";
  const slug = String(title.title).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "title";
  if (title.id < 0) return `/title/wm-${-title.id}-${slug}`;
  if (title.tmdbId > 0) return `/title/tmdb-${title.mediaType}-${title.tmdbId}-${slug}`;
  return "/?view=watchlist";
}

function normalizeOfferType(type) {
  if (type === "sub") return "included";
  if (["free", "rent", "buy"].includes(type)) return type;
  return null;
}

function normalizeProvider(name) {
  if (!name) return null;
  const value = String(name).trim();
  const aliases = {
    "Amazon Prime": "Prime Video", "Amazon Prime Video": "Prime Video", "Amazon Video": "Prime Video",
    AppleTV: "Apple TV", "AppleTV+": "Apple TV+", "Google Play": "Google TV", "Google Play Movies": "Google TV",
    "HBO MAX": "HBO Max", Max: "HBO Max", "Netflix Basic with Ads": "Netflix", "Paramount Plus": "Paramount+",
    "Tubi TV": "Tubi", "The Roku Channel": "Roku Channel", Viki: "Rakuten Viki", "Viki Pass": "Rakuten Viki",
    "Youtube TV": "YouTube TV", YouTubeTV: "YouTube TV", iTunes: "Apple TV",
  };
  return aliases[value] ?? value;
}

function offerRank(type) {
  return type === "included" ? 0 : type === "free" ? 1 : type === "rent" ? 2 : 3;
}

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

function capitalize(value) {
  return `${String(value).charAt(0).toUpperCase()}${String(value).slice(1)}`;
}

function validRegion(value) {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : "US";
}

function validCurrency(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : "USD";
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

async function mapWithConcurrency(items, concurrency, task) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await task(current);
    }
  });
  await Promise.all(workers);
}
