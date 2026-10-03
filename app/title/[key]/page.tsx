import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TitleDetailPage from "@/components/TitleDetailPage";
import { parseTitleKey } from "@/lib/title-routes";

type PageProps = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key } = await params;
  const parsed = parseTitleKey(key);
  if (!parsed) return { title: "Title not found · Stream Find" };
  return {
    title: `${parsed.titleHint} · Stream Find`,
    description: `See where ${parsed.titleHint} is streaming, compare prices, and explore cast, trailers, and related titles.`,
  };
}

export default async function TitlePage({ params }: PageProps) {
  const { key } = await params;
  if (!parseTitleKey(key)) notFound();
  return <TitleDetailPage titleKey={key} />;
}
