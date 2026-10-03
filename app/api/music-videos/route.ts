import { NextRequest, NextResponse } from "next/server";

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string; width?: number; height?: number }>;
  };
};

type YouTubeVideoItem = {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

const musicTopicId = "/m/04rlf";

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function durationInSeconds(value?: string) {
  if (!value) return 0;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function formatDuration(value?: string) {
  const seconds = durationInSeconds(value);
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function classify(title: string) {
  const normalized = title.toLowerCase();
  if (/\blyric(?:s)?\b|lyric video/.test(normalized)) return "lyrics";
  if (/\blive\b|concert|session|performance/.test(normalized)) return "live";
  if (/visualizer|dance video|performance video/.test(normalized)) return "performance";
  if (/official (music )?video|official video|\(official\)|\[official\]/.test(normalized)) return "official";
  return "other";
}

function looksOfficial(title: string, channelTitle: string) {
  return classify(title) === "official"
    || /vevo\b|official\b|records\b|music\b|entertainment\b/i.test(channelTitle);
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function relevanceScore(query: string, title: string, channelTitle: string, official: boolean) {
  const normalizedQuery = normalizeSearchText(query).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedTitle = normalizeSearchText(title).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedChannel = normalizeSearchText(channelTitle).replace(/[^a-z0-9]+/g, " ").trim();
  const ignored = new Set(["official", "music", "video", "videos", "song", "lyrics", "lyric", "live"]);
  const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 1 && !ignored.has(term));
  let score = official ? 1 : 0;
  if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) score += 20;
  if (normalizedQuery && normalizedChannel.includes(normalizedQuery)) score += 18;
  for (const term of terms) {
    if (normalizedTitle.includes(term)) score += 5;
    if (normalizedChannel.includes(term)) score += 7;
  }
  return score;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const region = (request.nextUrl.searchParams.get("region") || "US").toUpperCase();
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (query.length < 2) {
    return NextResponse.json({ error: "Enter at least two characters to search music videos." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "Music video search is not connected yet." }, { status: 503 });
  }

  try {
    const searchParams = new URLSearchParams({
      part: "snippet",
      q: `${query} music video`,
      type: "video",
      topicId: musicTopicId,
      maxResults: "18",
      order: "relevance",
      regionCode: region,
      safeSearch: "moderate",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      key: apiKey,
    });
    const searchResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`, {
      next: { revalidate: 600 },
    });
    const searchData = await searchResponse.json() as { items?: YouTubeSearchItem[]; error?: { message?: string } };
    if (!searchResponse.ok) throw new Error(searchData.error?.message || "YouTube search could not finish.");

    const searchItems = (searchData.items ?? []).filter((item) => item.id?.videoId && item.snippet?.title);
    const videoIds = searchItems.map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
    if (!videoIds.length) return NextResponse.json({ videos: [] });

    const detailParams = new URLSearchParams({
      part: "contentDetails,statistics",
      id: videoIds.join(","),
      key: apiKey,
    });
    const detailResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams.toString()}`, {
      next: { revalidate: 600 },
    });
    const detailData = await detailResponse.json() as { items?: YouTubeVideoItem[] };
    const detailById = new Map((detailData.items ?? []).map((item) => [item.id, item]));

    const videos = searchItems.map((item, index) => {
      const id = item.id?.videoId as string;
      const snippet = item.snippet ?? {};
      const title = decodeEntities(snippet.title ?? "Untitled video");
      const channelTitle = decodeEntities(snippet.channelTitle ?? "YouTube");
      const detail = detailById.get(id);
      const thumbnails = snippet.thumbnails ?? {};
      const thumbnail = thumbnails.maxres?.url ?? thumbnails.standard?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url;
      const official = looksOfficial(title, channelTitle);
      return {
        video: {
          id,
          title,
          channelTitle,
          channelId: snippet.channelId,
          description: decodeEntities(snippet.description ?? ""),
          publishedAt: snippet.publishedAt,
          thumbnail,
          duration: formatDuration(detail?.contentDetails?.duration),
          durationSeconds: durationInSeconds(detail?.contentDetails?.duration),
          viewCount: Number(detail?.statistics?.viewCount ?? 0),
          category: classify(title),
          official,
          url: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
        },
        relevanceScore: relevanceScore(query, title, channelTitle, official),
        sourceIndex: index,
      };
    })
      .filter(({ video }) => video.durationSeconds === 0 || video.durationSeconds <= 1200)
      .sort((a, b) => b.relevanceScore - a.relevanceScore || a.sourceIndex - b.sourceIndex)
      .map(({ video }) => video);

    return NextResponse.json({ videos }, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Music video search could not finish.",
    }, { status: 502 });
  }
}
