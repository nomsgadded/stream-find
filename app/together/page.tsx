import type { Metadata } from "next";
import TogetherPage from "@/components/TogetherPage";

export const metadata: Metadata = { title: "Decide together · Stream Find", description: "Pick a movie or show with your friends and see where to watch it." };

export default function Page() { return <TogetherPage />; }
