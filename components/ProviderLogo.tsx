"use client";

import Image from "next/image";
import { useState } from "react";

// These sources come from Watchmode's provider directory. Generic directory
// placeholders are deliberately excluded so they are never presented as brands.
const directoryMarks: Record<string, string> = {
  Netflix: "netflix",
  "HBO Max": "max",
  "Disney+": "disneyPlus",
  "Prime Video": "prime_video",
  "Apple TV+": "appleTvPlus",
  Hulu: "hulu",
  Peacock: "peacock",
  "Paramount+": "paramountPlus",
  Tubi: "tubi",
  Crunchyroll: "crunchyroll",
};

const localMarks: Record<string, string> = {
  "Pluto TV": "/brands/pluto-tv.svg",
  "Roku Channel": "/brands/roku-channel.svg",
  "Rakuten Viki": "/brands/rakuten-viki.svg",
  "YouTube TV": "/brands/youtube-tv.svg",
  "Google TV": "/brands/google-tv.svg",
  "Apple TV": "/brands/apple-tv-plus.svg",
  Amazon: "/brands/amazon.svg",
};

export function providerBrand(name: string) {
  const base = name.replace(/\s*\((?:Via|via) [^)]+\)\s*$/, "").replace(/\s+Apple TV Channel$/, "").trim();
  const aliases: Record<string, string> = {
    Max: "HBO Max",
    HBO: "HBO Max",
    "MAX": "HBO Max",
    "Amazon Prime": "Prime Video",
    "Amazon Prime Video": "Prime Video",
    "Amazon Video": "Prime Video",
    "The Roku Channel": "Roku Channel",
    Viki: "Rakuten Viki",
    "Viki Pass": "Rakuten Viki",
  };
  return aliases[base] ?? base;
}

export function providerHost(name: string) {
  const via = name.match(/\((?:Via|via) ([^)]+)\)$/)?.[1];
  if (via) return providerBrand(via);
  return name.endsWith(" Apple TV Channel") ? "Apple TV" : undefined;
}

function logoFor(name: string, source?: string) {
  const brand = providerBrand(name);
  const directory = directoryMarks[brand];
  if (directory) return `https://cdn.watchmode.com/provider_logos/${directory}_100px.png`;
  if (localMarks[brand]) return localMarks[brand];
  if (source && /^https:\/\//.test(source) && !/\/\d+_generic_v\d+\./.test(source)) return source;
  return undefined;
}

export default function ProviderLogo({ name, source, variant = "service" }: {
  name: string;
  source?: string;
  variant?: "service" | "badge" | "title";
}) {
  const logo = logoFor(name, source);
  const [failedLogo, setFailedLogo] = useState<string>();
  const lightTile = ["Apple TV", "Amazon", "Roku Channel", "Rakuten Viki", "Google TV"].includes(providerBrand(name));

  return (
    <span className={`providerIdentity providerIdentity--${variant}${lightTile ? " providerIdentity--light" : ""}`} aria-hidden="true">
      {logo && failedLogo !== logo
        ? <Image className="providerIdentityImage" src={logo} alt="" width={40} height={40} unoptimized={logo.startsWith("http")} onError={() => setFailedLogo(logo)} />
        : <span className="providerIdentityFallback">▶</span>}
    </span>
  );
}
