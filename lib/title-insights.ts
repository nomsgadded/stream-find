export type InsightParts = { positive: string; negative: string; fallback: string };

const tidy = (text: string) => text.trim().replace(/^[;|\s]+|[;|\s]+$/g, "").trim();

export function splitTitleInsight(text: string, kind: "fit" | "reviews"): InsightParts {
  const value = text.trim();
  if (kind === "reviews") {
    // Only assign a polarity when the provider explicitly labels it.
    const positive = /\bpros\s*:/i.exec(value);
    const negative = /\bcons\s*:/i.exec(value);
    if (!positive && !negative) return { positive: "", negative: "", fallback: value };
    const section = (match: RegExpExecArray | null, other: RegExpExecArray | null) => match
      ? tidy(value.slice(match.index + match[0].length, other && other.index > match.index ? other.index : undefined))
      : "";
    return { positive: section(positive, negative), negative: section(negative, positive), fallback: "" };
  }
  const negative = /\b(?:not for you(?:\s+if)?|may not be for you(?:\s+if)?)\s*:?\s*/i.exec(value);
  const positiveText = negative ? value.slice(0, negative.index) : value;
  const positiveLabel = /^(?:you[’']ll (?:likely )?(?:like|enjoy) (?:this|it)(?:\s+if)?|you (?:may|might) (?:like|enjoy) (?:this|it)(?:\s+if)?)\s*:?\s*/i;
  const hasPositiveLabel = positiveLabel.test(positiveText);
  if (!negative && !hasPositiveLabel) return { positive: "", negative: "", fallback: value };
  return {
    positive: tidy(positiveText.replace(positiveLabel, "")),
    negative: negative ? tidy(value.slice(negative.index + negative[0].length)) : "",
    fallback: "",
  };
}
