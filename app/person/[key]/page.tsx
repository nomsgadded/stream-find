import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PersonDetailPage from "@/components/PersonDetailPage";
import { parsePersonKey } from "@/lib/person-routes";

type PageProps = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params;
  const parsed = parsePersonKey(key);
  if (!parsed) return { title: "Person not found · Stream Find" };
  return {
    title: `${parsed.nameHint} · Stream Find`,
    description: `Explore ${parsed.nameHint}'s movies and shows and find where to watch them.`,
  };
}

export default async function PersonPage({ params }: PageProps) {
  const { key } = await params;
  const parsed = parsePersonKey(key);
  if (!parsed) notFound();
  return <PersonDetailPage personId={parsed.personId} />;
}
