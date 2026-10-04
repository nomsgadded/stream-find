"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { episodeKey, episodePath, type FavoriteEpisode } from "@/lib/episode-links";
import ModalDialog from "@/components/ModalDialog";

export function useEpisodeFavorites(tmdbId?: number) {
  const [user,setUser]=useState<User|null>(null);
  const [authReady,setAuthReady]=useState(false);
  const [favorites,setFavorites]=useState<FavoriteEpisode[]>([]);
  const [watched,setWatched]=useState<FavoriteEpisode[]>([]);
  const [progressLimited,setProgressLimited]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  const currentUid=useRef<string|null>(null);
  useEffect(()=>onAuthStateChanged(firebaseAuth,account=>{currentUid.current=account?.uid??null;setUser(account);setAuthReady(true);setFavorites([]);setWatched([]);setProgressLimited(false);setReady(false);setError("");}),[]);
  useEffect(()=>{
    const controller=new AbortController();
    if (!user) return;
    void user.getIdToken().then(token=>fetch(`/api/episode-actions${tmdbId?`?id=${tmdbId}`:''}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})).then(async response=>{
      const data=await response.json(); if(!response.ok) throw new Error(data.error); if(!controller.signal.aborted&&currentUid.current===user.uid){setFavorites(data.favorites??[]);setWatched(data.watched??[]);setProgressLimited(Boolean(data.progressLimited));setReady(true);setError("");}
    }).catch(()=>{if(!controller.signal.aborted&&currentUid.current===user.uid){setError("Your episode favorites and progress could not load.");setReady(false);}});
    return ()=>controller.abort();
  },[user,retry,tmdbId]);
  const action=async(action:string,episode:FavoriteEpisode,extra?:{toUid:string;message:string})=>{
    if(!user) throw new Error("Sign in to save favorites, watching progress, or recommendations.");
    const token=await user.getIdToken();const response=await fetch('/api/episode-actions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,episode,...extra})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"That episode action could not be saved.");
    if(currentUid.current!==user.uid)return;
    if(action==="watched"||action==="unwatched")setWatched(current=>action==="unwatched"?current.filter(item=>episodeKey(item)!==episodeKey(episode)):[episode,...current.filter(item=>episodeKey(item)!==episodeKey(episode))]);
    if(action==="favorite"||action==="remove")setFavorites(current=>action==="remove"?current.filter(item=>episodeKey(item)!==episodeKey(episode)):[episode,...current.filter(item=>episodeKey(item)!==episodeKey(episode))]);
  };
  return {user,authReady,favorites:user?favorites:[],watched:user?watched:[],progressLimited,ready:user?ready:false,error:user?error:"",action,retry:()=>setRetry(value=>value+1)};
}
export type EpisodeFavorites = ReturnType<typeof useEpisodeFavorites>;
export default function EpisodeActions({episode,favorites}:{episode:FavoriteEpisode;favorites:EpisodeFavorites}) {
  const [sharing,setSharing]=useState(false);const [status,setStatus]=useState("");const [busy,setBusy]=useState(false);
  const watched=favorites.watched.some(item=>episodeKey(item)===episodeKey(episode));
  const markWatched=async()=>{setBusy(true);try{await favorites.action(watched?"unwatched":"watched",episode);setStatus(watched?"Marked as unwatched":"Marked as watched");}catch(error){setStatus(error instanceof Error?error.message:"Progress could not be saved.");}finally{setBusy(false);}};
  const saved=favorites.favorites.some(item=>episodeKey(item)===episodeKey(episode));
  const toggle=async()=>{setBusy(true);try{await favorites.action(saved?'remove':'favorite',episode);setStatus(saved?'Removed from favorite episodes':'Added to favorite episodes');}catch(error){setStatus(error instanceof Error?error.message:'Could not save episode.');}finally{setBusy(false);}};
  return <><div className="episodeActions"><button type="button" className={saved?'favoriteEpisode saved':'favoriteEpisode'} aria-pressed={saved} aria-label={`${saved?'Remove':'Favorite'} ${episode.showTitle} season ${episode.seasonNumber} episode ${episode.episodeNumber}`} title={saved?'Remove favorite':'Favorite episode'} disabled={busy||Boolean(favorites.user&&!favorites.ready)} onClick={()=>void toggle()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.3l8.8-8.9a5.5 5.5 0 0 0 0-7.8Z" fill={saved?'currentColor':'none'} stroke="currentColor" strokeWidth="1.7" /></svg></button><button type="button" className={watched?"episodeWatched active":"episodeWatched"} aria-pressed={watched} aria-label={`${watched?"Mark unwatched":"Mark watched"}: ${episode.showTitle} season ${episode.seasonNumber} episode ${episode.episodeNumber}`} disabled={busy||Boolean(favorites.user&&!favorites.ready)} onClick={()=>void markWatched()}>{watched?"✓ Watched":"Mark watched"}</button><button type="button" onClick={()=>setSharing(true)}>Share episode ↗</button></div>{status&&<p role="status" className="episodeSource">{status}{!favorites.user&&<> <Link href="/?panel=account">Sign in</Link></>}</p>}{sharing&&<EpisodeShare episode={episode} favorites={favorites} onClose={()=>setSharing(false)} />}</>;
}
export function EpisodeShare({episode,favorites,onClose}:{episode:FavoriteEpisode;favorites:EpisodeFavorites;onClose:()=>void}) {
  const [friends,setFriends]=useState<Array<{uid:string;name:string}>|null>(null);const [recipient,setRecipient]=useState("");const [note,setNote]=useState("");const [status,setStatus]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{let cancelled=false;if(!favorites.user)return;void getDocs(collection(firestore,'users',favorites.user.uid,'friends')).then(snapshot=>{if(!cancelled)setFriends(snapshot.docs.map(entry=>({uid:entry.id,name:String(entry.data().displayName||'Friend')})));}).catch(()=>{if(!cancelled){setFriends([]);setStatus('Friends could not load. You can still copy the episode link.');}});return()=>{cancelled=true;};},[favorites.user]);
  const copy=async()=>{try{await navigator.clipboard.writeText(new URL(episodePath(episode),window.location.origin).href);setStatus('Episode link copied');}catch{setStatus('Copy failed. Select and copy the link below.');}};
  const nativeShare=async()=>{try{const data={title:`${episode.showTitle} · S${episode.seasonNumber} E${episode.episodeNumber}`,text:`${episode.episodeName}${note.trim()?` — ${note.trim()}`:''}`,url:new URL(episodePath(episode),window.location.origin).href};if(navigator.share)await navigator.share(data);else await copy();}catch(error){if(!(error instanceof Error&&error.name==='AbortError'))setStatus('Sharing failed. Try copying the link.');}};
  const send=async()=>{setBusy(true);try{await favorites.action('share',episode,{toUid:recipient,message:note});setStatus('Episode sent to your friend');setRecipient("");}catch(error){setStatus(error instanceof Error?error.message:'Episode could not be sent.');}finally{setBusy(false);}};
  return <div className="modalBackdrop episodeShareBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><ModalDialog className="modalPanel episodeShareDialog" aria-labelledby="episode-share-heading" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}><header><h2 id="episode-share-heading">Share this episode</h2><button type="button" aria-label="Close episode sharing" onClick={onClose}>×</button></header>{episode.posterUrl&&<Image className="episodeSharePoster" src={episode.posterUrl} alt="" width={72} height={108} unoptimized />}<h3>{episode.showTitle}</h3><p>S{episode.seasonNumber} · E{episode.episodeNumber} — {episode.episodeName}</p><label>Add a note<textarea maxLength={240} value={note} onChange={event=>setNote(event.target.value)} rows={3} /></label><div className="episodeShareButtons"><button type="button" onClick={()=>void nativeShare()}>Share ↗</button><button type="button" onClick={()=>void copy()}>Copy link</button></div><input aria-label="Episode share link" readOnly value={typeof window==='undefined'?'':new URL(episodePath(episode),window.location.origin).href} />{favorites.user?friends===null?<p>Loading friends…</p>:friends.length?<><label>Send to a friend<select value={recipient} onChange={event=>setRecipient(event.target.value)}><option value="">Choose a friend</option>{friends.map(friend=><option value={friend.uid} key={friend.uid}>{friend.name}</option>)}</select></label><button type="button" disabled={!recipient||busy} onClick={()=>void send()}>{busy?'Sending…':'Send episode'}</button></>:<p>Add friends in Your circle to recommend episodes directly.</p>:<p><Link href="/?panel=account">Sign in</Link> to send directly to your friends.</p>}{status&&<p role="status">{status}</p>}</ModalDialog></div>;
}
