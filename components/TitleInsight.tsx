import { splitTitleInsight } from "@/lib/title-insights";

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default function TitleInsight({ kind, text }: { kind: "fit" | "reviews"; text: string }) {
  const parts = splitTitleInsight(text, kind);
  const labels = kind === "fit" ? ["You’ll like it if", "May not be for you if"] : ["Pros", "Cons"];
  return (
    <article className="titleInsightCard">
      <small>{kind === "fit" ? "Will you like it?" : "What reviewers say"}</small>
      {parts.fallback && <p>{parts.fallback}</p>}
      {([parts.positive, parts.negative] as const).map((content, index) => content && (
        <div className={`titleInsightPart ${index === 0 ? "positive" : "negative"}`} key={labels[index]}>
          <h3><span aria-hidden="true">{index === 0 ? "+" : "−"}</span>{labels[index]}</h3>
          {kind === "reviews" ? (
            <ul>{content.split(/\s*;\s*/).filter(Boolean).map((point, pointIndex) => <li key={pointIndex}>{sentenceCase(point)}</li>)}</ul>
          ) : <p>{sentenceCase(content)}</p>}
        </div>
      ))}
    </article>
  );
}
