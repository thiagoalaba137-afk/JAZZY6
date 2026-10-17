export const PEOPLE = {
  hyu: {name:'Hyu Suk',handle:'hyusukk',initials:'HS',city:'Gwangju',timezone:'Asia/Seoul',bio:'My favorite place is wherever you are. ☁️'},
  jasmin: {name:'Jazzy',handle:'JAZZY',initials:'J',city:'Azul',timezone:'America/Argentina/Buenos_Aires',bio:'Little moments, just for us. 🦋'}
};
export function derive(events, now = Date.now()) {
  const all = [...events].sort((a,b) => (a.seq || Number.MAX_SAFE_INTEGER) - (b.seq || Number.MAX_SAFE_INTEGER) || a.created.localeCompare(b.created));
  const originals = new Map(all.filter(e=>['post','story','reel','message'].includes(e.data?.kind)).map(e=>[e.id,e]));
  const deleted = new Set(all.filter(e=>e.data?.kind === 'delete' && originals.get(e.data.target)?.author === e.author).map(e=>e.data.target));
  const visible = all.filter(e=>!deleted.has(e.id));
  const likes = new Map();
  for(const e of all) if(e.data?.kind==='like' && originals.has(e.data.target)) {
    const set=likes.get(e.data.target)||new Set();
    e.data.active ? set.add(e.author) : set.delete(e.author);
    likes.set(e.data.target,set);
  }
  const profiles = structuredClone(PEOPLE);
  for(const e of all) if(e.data?.kind==='profile') {
    const d=e.data;
    profiles[e.author]={...profiles[e.author],...(d.name?{name:d.name}:{}),...(d.handle?{handle:d.handle}:{}),bio:String(d.bio||'').slice(0,180),city:String(d.city||'').slice(0,60),timezone:String(d.timezone||profiles[e.author].timezone)};
  }
  const read = {};
  for(const e of all) if(e.data?.kind==='read') read[e.author] = e.data.target;
  return { posts:visible.filter(e=>e.data?.kind==='post').reverse(), stories:visible.filter(e=>e.data?.kind==='story' && Date.parse(e.created)+86400000>now), reels:visible.filter(e=>e.data?.kind==='reel').reverse(), messages:visible.filter(e=>e.data?.kind==='message'), comments:visible.filter(e=>e.data?.kind==='comment' && !deleted.has(e.data.target)), likes,profiles,read };
}
export function validatePayload(p) {
  if(!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if(!['post','story','reel','message','like','comment','delete','read','profile'].includes(p.kind)) return false;
  if(p.text !== undefined && (typeof p.text !== 'string' || p.text.length>5000)) return false;
  if(p.caption !== undefined && (typeof p.caption !== 'string' || p.caption.length>2200)) return false;
  if(p.location !== undefined && (typeof p.location !== 'string' || p.location.length>100)) return false;
  if(p.postId !== undefined && !/^[A-Za-z0-9_-]{22}$/.test(p.postId)) return false;
  if(p.name !== undefined && (typeof p.name!=='string'||p.name.length>50))return false;
  if(p.handle !== undefined && (typeof p.handle!=='string'||!/^[A-Za-z0-9_.]{3,30}$/.test(p.handle)))return false;
  if(p.file!==undefined&&(typeof p.file!=='object'||!p.file||typeof p.file.name!=='string'||p.file.name.length>180||typeof p.file.body!=='string'||p.file.body.length>12000000||!/^data:application\/octet-stream;base64,[A-Za-z0-9+/=]+$/.test(p.file.body)))return false;
  if(p.media !== undefined && p.media !== null && (typeof p.media!=='string' || p.media.length>17000000 || !/^data:(image\/(jpeg|png|webp)|video\/(mp4|webm)|audio\/(webm|mp4|ogg));base64,[A-Za-z0-9+/=]+$/.test(p.media))) return false;
  if(['like','comment','delete','read'].includes(p.kind) && !/^[A-Za-z0-9_-]{22}$/.test(p.target)) return false;
  if(p.kind==='like' && typeof p.active !== 'boolean') return false;
  if(p.kind==='profile' && (typeof p.bio!=='string' || p.bio.length>180 || typeof p.city!=='string' || p.city.length>60 || typeof p.timezone!=='string' || p.timezone.length>80)) return false;
  if(p.kind==='reel' && p.url && (typeof p.url !== 'string' || !/^https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]{1,80}\/$/.test(p.url))) return false;
  return true;
}
