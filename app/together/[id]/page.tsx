import type { Metadata } from "next";
import TogetherPage from "@/components/TogetherPage";

export const metadata: Metadata = { title: "Movie night · Stream Find", description: "Vote with your friends on what to watch tonight." };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TogetherPage roomId={id} />;
}
