/**
 * The backup code ("냥이 코드"): the whole profile as one line of text, so a player can move to
 * another device without a server.
 *
 *   MG1.<z|r>.<crc32 of the JSON, 8 hex>.<base64url payload>
 *
 * `z` = the JSON was deflated with CompressionStream, `r` = stored as it is (browsers without it).
 * The checksum catches typos and truncation, not tampering: without a server there is nobody to
 * sign the code, so a code is exactly as trustworthy as the save file it came from.
 */
import { fail, ok, type ProfileData, type Result } from './types';
import { MIGRATIONS, PROFILE_VERSION, migrateProfile } from './profileData';

export const BACKUP_FORMAT = 1;
const TAG = 'MG';

interface Envelope {
  v: number;
  t: number;
  data: unknown;
}

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function hex8(n: number): string {
  return n.toString(16).padStart(8, '0');
}

/** The profile as a code. The run in progress, unseen chest animations and the last result stay on the device. */
export async function encodeBackup(data: ProfileData, now: number): Promise<string> {
  const env: Envelope = { v: PROFILE_VERSION, t: now, data: { ...data, pending: null, reveals: [], lastRun: null } };
  const json = new TextEncoder().encode(JSON.stringify(env));
  const crc = hex8(crc32(json));
  if (typeof CompressionStream === 'function') {
    return `${TAG}${BACKUP_FORMAT}.z.${crc}.${toBase64Url(await pipe(json, new CompressionStream('deflate')))}`;
  }
  return `${TAG}${BACKUP_FORMAT}.r.${crc}.${toBase64Url(json)}`;
}

export interface DecodedBackup {
  /** Profile data migrated to the current version, not yet sanitised. */
  data: unknown;
  savedAt: number;
}

/** Check a code and unpack it. Whitespace (line breaks from pasting) is ignored. */
export async function decodeBackup(code: string): Promise<Result<DecodedBackup>> {
  const parts = code.replace(/\s+/g, '').split('.');
  if (parts.length !== 4) return fail('invalid_code');
  const [tag, mode, crcText, payload] = parts as [string, string, string, string];
  const m = /^MG(\d+)$/.exec(tag);
  if (!m) return fail('invalid_code');
  if (Number(m[1]) > BACKUP_FORMAT) return fail('newer_version');
  if ((mode !== 'z' && mode !== 'r') || !/^[0-9a-f]{8}$/.test(crcText)) return fail('invalid_code');
  const packed = fromBase64Url(payload);
  if (!packed) return fail('invalid_code');

  let json: Uint8Array;
  if (mode === 'r') json = packed;
  else {
    if (typeof DecompressionStream !== 'function') return fail('unavailable');
    try {
      json = await pipe(packed, new DecompressionStream('deflate'));
    } catch {
      return fail('corrupt_code');
    }
  }
  if (hex8(crc32(json)) !== crcText) return fail('corrupt_code');

  let env: unknown;
  try {
    env = JSON.parse(new TextDecoder().decode(json));
  } catch {
    return fail('corrupt_code');
  }
  if (!env || typeof env !== 'object') return fail('corrupt_code');
  const e = env as Partial<Envelope>;
  if (typeof e.v !== 'number' || !Number.isInteger(e.v) || e.v < 1) return fail('corrupt_code');
  if (e.v > PROFILE_VERSION) return fail('newer_version');
  return ok({ data: migrateProfile(e.data, e.v, MIGRATIONS), savedAt: typeof e.t === 'number' ? e.t : 0 });
}
