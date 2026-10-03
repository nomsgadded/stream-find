import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";
import { episodeKey, episodePath, normalizeFavoriteEpisode } from "@/lib/episode-links";
async function account(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  try { return header.startsWith("Bearer ") ? await adminAuth.verifyIdToken(header.slice(7)) : null; } catch { return null; }
}
export async function GET(request: Request) {
  const user = await account(request);
  if (!user) return Response.json({error:"Sign in to see favorite episodes."},{status:401});
  const idText = new URL(request.url).searchParams.get("id");
  const id = idText === null ? null : Number(idText);
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) return Response.json({error:"Choose a valid series."},{status:400});
  try {
    const [snapshot, progress] = await Promise.all([
      adminFirestore.collection(`users/${user.uid}/favoriteEpisodes`).orderBy("savedAt","desc").limit(500).get(),
      id === null ? null : adminFirestore.collection(`users/${user.uid}/episodeProgress/${id}/episodes`).orderBy("watchedAt","desc").limit(5000).get(),
    ]);
    return Response.json({favorites:snapshot.docs.map(entry=>normalizeFavoriteEpisode(entry.data())).filter(Boolean), watched:progress?.docs.map(entry=>normalizeFavoriteEpisode(entry.data())).filter(Boolean) ?? [], progressLimited:progress?.docs.length === 5000}, {headers:{"Cache-Control":"private, no-store"}});
  } catch { return Response.json({error:"Favorite episodes could not load."},{status:502}); }
}
export async function POST(request: Request) {
  const user = await account(request);
  if (!user) return Response.json({error:"Sign in to favorite or recommend episodes."},{status:401});
  let body;
  try { body = await request.json(); } catch { return Response.json({error:"Choose an episode."},{status:400}); }
  if (!body || typeof body !== "object") return Response.json({error:"Choose an episode."},{status:400});
  const episode = normalizeFavoriteEpisode(body.episode);
  if (!episode || !["favorite","remove","share","watched","unwatched"].includes(body.action)) return Response.json({error:"Choose a valid episode and action."},{status:400});
  try {
    const favorite = adminFirestore.doc(`users/${user.uid}/favoriteEpisodes/${episodeKey(episode)}`);
    if (body.action === "remove") { await favorite.delete(); return Response.json({ok:true}); }
    if (body.action === "favorite") { await favorite.set({...episode,savedAt:FieldValue.serverTimestamp()}); return Response.json({ok:true}); }
    if (body.action === "watched" || body.action === "unwatched") {
      const progress = adminFirestore.doc(`users/${user.uid}/episodeProgress/${episode.tmdbId}/episodes/${episode.seasonNumber}-${episode.episodeNumber}`);
      if (body.action === "watched") await progress.set({...episode,watchedAt:FieldValue.serverTimestamp()});
      else await progress.delete();
      return Response.json({ok:true});
    }
    if (typeof body.toUid !== "string" || !body.toUid || body.toUid.includes("/") || body.toUid === user.uid || (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 240))) return Response.json({error:"Choose a friend and a note under 240 characters."},{status:400});
    const [friend, profile] = await Promise.all([adminFirestore.doc(`users/${user.uid}/friends/${body.toUid}`).get(),adminFirestore.doc(`users/${user.uid}`).get()]);
    if (!friend.exists) return Response.json({error:"You can recommend episodes to accepted friends only."},{status:403});
    const sender = {uid:user.uid,displayName:String(profile.data()?.displayName || user.name || "A friend"),username:String(profile.data()?.username || "friend")};
    const href = episodePath(episode);
    const title = {id:-1_000_000_000-episode.tmdbId,tmdbId:episode.tmdbId,title:episode.showTitle,year:episode.year??0,mediaType:"show",runtime:"",score:0,rating:"",genres:[],synopsis:"",art:"posterPaper",offers:[],...(episode.posterUrl?{posterUrl:episode.posterUrl}:{})};
    const recommendation = adminFirestore.collection("recommendations").doc();
    const batch = adminFirestore.batch();
    batch.set(recommendation,{fromUid:user.uid,toUid:body.toUid,sender,title,titlePath:href,episode,message:(body.message??"").trim(),status:"sent",sentAt:FieldValue.serverTimestamp()});
    batch.set(adminFirestore.doc(`users/${body.toUid}/notifications/recommendation-${recommendation.id}`),{type:"recommendation",toUid:body.toUid,actor:sender,recommendationId:recommendation.id,titleId:title.id,heading:`${sender.displayName} recommends an episode`,body: `${episode.showTitle} · S${episode.seasonNumber} E${episode.episodeNumber}: ${episode.episodeName}${body.message?.trim()?` — ${body.message.trim()}`:""}`,href,...(episode.posterUrl?{imageUrl:episode.posterUrl}:{}),createdAt:FieldValue.serverTimestamp()});
    await batch.commit();
    return Response.json({ok:true});
  } catch { return Response.json({error:"Your episode action could not be saved. Try again."},{status:502}); }
}
