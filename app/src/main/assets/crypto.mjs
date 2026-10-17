// JAZZY protocol v1. Uses the platform's Web Crypto implementations.
// A 256-bit pair secret is transferred out of band, never to the relay.
const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });
export const ROLES = ['hyu', 'jasmin'];
export function encode64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384) {
    text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decode64(text, max = 24000000) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length > max || text.length % 4 === 1) throw new Error('Invalid encoded data');
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export function randomToken(size = 32) { return encode64(crypto.getRandomValues(new Uint8Array(size))); }
export function validateServer(input, allowLocal = false) {
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a full HTTPS server address.'); }
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:';
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Use an HTTPS server address without a path, password, or query.');
  return url.origin;
}
export function makeInvite(config, joinToken) {
  const data = { v: 1, server: config.server, room: config.room, join: joinToken, key: config.key, role: config.role === 'hyu' ? 'jasmin' : 'hyu' };
  return 'jazzy1.' + encode64(te.encode(JSON.stringify(data)));
}
export function parseInvite(text, allowLocal = false) {
  const match = text.trim().match(/jazzy1\.([A-Za-z0-9_-]{100,4000})/);
  if (!match) throw new Error('Paste the full JAZZY invite from your partner.');
  let data;
  try { data = JSON.parse(td.decode(decode64(match[1], 4000))); } catch { throw new Error('This invite is damaged or incomplete.'); }
  if (data.v !== 1 || !/^[A-Za-z0-9_-]{22}$/.test(data.room) || !ROLES.includes(data.role) || decode64(data.key, 44).length !== 32 || decode64(data.join, 44).length !== 32) throw new Error('Invalid JAZZY invite.');
  return { ...data, server: validateServer(data.server, allowLocal) };
}
export async function eventKey(secret, room) {
  const bytes = decode64(secret, 44);
  if (bytes.length !== 32 || !/^[A-Za-z0-9_-]{22}$/.test(room)) throw new Error('Invalid pair key');
  const root = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  bytes.fill(0);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode(room),info:te.encode('JAZZY/v1/events/AES-256-GCM')},root,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function aad(envelope) {
  if (envelope.v !== 1 || !/^[A-Za-z0-9_-]{22}$/.test(envelope.room) || !/^[A-Za-z0-9_-]{22}$/.test(envelope.id) || !ROLES.includes(envelope.author) || typeof envelope.created !== 'string' || !Number.isFinite(Date.parse(envelope.created)) || new Date(envelope.created).toISOString() !== envelope.created) throw new Error('Invalid envelope');
  return te.encode(JSON.stringify({v:1,room:envelope.room,id:envelope.id,author:envelope.author,created:envelope.created}));
}
export async function seal(key, room, author, payload, now = new Date()) {
  const envelope = {v:1,room,id:randomToken(16),author,created:now.toISOString()};
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(envelope),tagLength:128},key,te.encode(JSON.stringify(payload)));
  return {...envelope,iv:encode64(iv),ciphertext:encode64(new Uint8Array(encrypted))};
}
export async function open(key, expectedRoom, envelope) {
  if (envelope.room !== expectedRoom) throw new Error('Wrong room');
  const iv = decode64(envelope.iv, 16);
  if (iv.length !== 12) throw new Error('Invalid nonce');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(envelope),tagLength:128},key,decode64(envelope.ciphertext));
  return JSON.parse(td.decode(plain));
}
export async function safetyCode(secret, room) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('JAZZY/safety/v1/' + room + '/' + secret)));
  return Array.from(digest.subarray(0, 16), b => b.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{4}/g).join(' ');
}
export function normalizeReel(input) {
  const raw = input.match(/https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels)\/[A-Za-z0-9_-]+\/?(?:\?[^\s]*)?/i)?.[0];
  if (!raw) throw new Error('Use an Instagram Reel link: https://www.instagram.com/reel/…');
  const url = new URL(raw);
  if (!['instagram.com','www.instagram.com'].includes(url.hostname) || url.protocol !== 'https:') throw new Error('Invalid Instagram link');
  const id = url.pathname.match(/^\/(?:reel|reels)\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  if (!id || id.length > 80) throw new Error('Invalid Reel link');
  return 'https://www.instagram.com/reel/' + id + '/';
}

// Authenticated-account directory pairing. Only public keys and sealed offers reach the server.
export async function createIdentity(){
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  return {privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey:encode64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)))};
}
async function requestKey(identity,publicKey,context){
  const privateKey=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const peer=await crypto.subtle.importKey('raw',decode64(publicKey,100),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:peer},privateKey,256);
  const root=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  new Uint8Array(shared).fill(0);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode(context),info:te.encode('JAZZY/v2/friend-request')},root,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealRequest(identity,publicKey,context,payload){
  const key=await requestKey(identity,publicKey,context),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:te.encode(context)},key,te.encode(JSON.stringify(payload)));
  return {iv:encode64(iv),ciphertext:encode64(new Uint8Array(ciphertext))};
}
export async function openRequest(identity,publicKey,context,envelope){
  const key=await requestKey(identity,publicKey,context);
  return JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.iv,16),additionalData:te.encode(context)},key,decode64(envelope.ciphertext,8000))));
}
