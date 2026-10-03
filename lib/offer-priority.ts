export type RankedOffer = { provider: string; type: "included" | "free" | "rent" | "buy"; price?: number };

export function normalizedService(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
    .replace(/^hbomax$/, "max").replace(/^amazonprimevideo$/, "primevideo")
    .replace(/^amazonvideo$/, "primevideo").replace(/^disneyplus$/, "disney")
    .replace(/^appletvplus$/, "appletv");
}

export function includedServiceIndex(provider: string, services: string[]) {
  const key = normalizedService(provider);
  return services.findIndex((service) => normalizedService(service) === key);
}

export function offerPriority(offer: RankedOffer, services: string[]) {
  const savedIndex = offer.type === "included" ? includedServiceIndex(offer.provider, services) : -1;
  if (savedIndex >= 0) return savedIndex / (services.length + 1);
  return offer.type === "free" ? 1 : offer.type === "included" ? 2 : offer.type === "rent" ? 3 : 4;
}

export function compareOffers(a: RankedOffer, b: RankedOffer, services: string[]) {
  return offerPriority(a, services) - offerPriority(b, services)
    || (a.price ?? 0) - (b.price ?? 0);
}

export function bestOffer<T extends RankedOffer>(offers: T[], services: string[]) {
  return [...offers].sort((a, b) => compareOffers(a, b, services))[0];
}
