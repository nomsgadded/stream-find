"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";

export default function SearchRouteSync({ onQuery }: { onQuery: (query: string | null) => void }) {
  const params = useSearchParams();
  const query = params.get("q")?.trim() || null;
  const previous = useRef<string | null | undefined>(undefined);
  const applyQuery = useEffectEvent(onQuery);
  useEffect(() => {
    if (query !== previous.current && (query !== null || previous.current !== undefined)) applyQuery(query);
    previous.current = query;
  }, [query]);
  return null;
}
