export type SuggestionOffer = { provider: string; type: string };
export function suggestionAvailabilityLabel(offers?: SuggestionOffer[], services: string[] = []) {
  if (!offers?.length) return undefined;
  const yours = offers.find((offer) => offer.type === "included" && includedServiceIndex(offer.provider, services) >= 0);
  if (yours) return `Included on your ${yours.provider}`;
  const included = offers.find((offer) => offer.type === "included");
  const free = offers.find((offer) => offer.type === "free");
  if (included) return `Included on ${included.provider}`;
  if (free) return `Free on ${free.provider}`;
  const rent = offers.find((offer) => offer.type === "rent");
  if (rent) return `Rent on ${rent.provider}`;
  const buy = offers.find((offer) => offer.type === "buy");
  return buy ? `Buy on ${buy.provider}` : undefined;
}
import { includedServiceIndex } from "@/lib/offer-priority";
