// Reads the facts about Romit's OpenPGP public key (fingerprint, key ID, algorithms, expiry) for
// the card on the Contact page, from the key file itself, so the card never goes out of date when
// the key is replaced. Runs at build time only, with Node's built-in modules. Ported from the
// website's scripts/lib/pgp.mjs.
import { createHash } from "node:crypto";

export type KeyUse = "signing" | "encryption" | "authentication" | "certification";

export interface KeyFacts {
  /** The primary key's fingerprint, in groups of four, as gpg prints it. */
  fingerprint: string;
  /** The long key ID: the last 16 characters of the fingerprint. */
  keyId: string;
  /** The primary key, then each subkey, with what it is for. */
  algorithms: { name: string; use: KeyUse }[];
  /** The day the key was made, as YYYY-MM-DD. */
  created: string;
  /** The day the key stops being valid, as YYYY-MM-DD, or null if it never does. */
  expires: string | null;
  userIds: string[];
}

// The checksum armored keys may end with (a line starting with "="): CRC-24 from RFC 4880.
const crc24 = (bytes: Uint8Array) => {
  let crc = 0xb704ce;
  for (const byte of bytes) {
    crc ^= byte << 16;
    for (let bit = 0; bit < 8; bit++) {
      crc <<= 1;
      if (crc & 0x1000000) crc ^= 0x1864cfb;
    }
  }
  return crc & 0xffffff;
};

/** Turns the armored text into the key's bytes, the same bytes "gpg --dearmor" gives. */
export const dearmor = (text: string) => {
  const match =
    /-----BEGIN PGP PUBLIC KEY BLOCK-----\r?\n([\s\S]*?)-----END PGP PUBLIC KEY BLOCK-----/.exec(
      text,
    );
  if (!match) throw new Error("This is not an armored key: no BEGIN PGP PUBLIC KEY BLOCK line.");
  // Header lines ("Comment: ...") come first and end at the first blank line, if there are any.
  let lines = match[1].split(/\r?\n/).map((line) => line.trim());
  const blank = lines.indexOf("");
  if (blank !== -1 && lines.slice(0, blank).every((line) => line.includes(": ")))
    lines = lines.slice(blank + 1);
  lines = lines.filter(Boolean);
  const checksumLine = lines.find((line) => /^=[A-Za-z0-9+/]{4}$/.test(line));
  const bytes = Buffer.from(lines.filter((line) => line !== checksumLine).join(""), "base64");
  if (
    checksumLine &&
    Buffer.from(checksumLine.slice(1), "base64").readUIntBE(0, 3) !== crc24(bytes)
  )
    throw new Error("The key's checksum does not match: the file is damaged.");
  return bytes;
};

/** The pieces a key is made of (RFC 9580, section 4). */
const packets = (bytes: Buffer) => {
  const found: { tag: number; body: Buffer }[] = [];
  let at = 0;
  while (at < bytes.length) {
    const first = bytes[at];
    if (!(first & 0x80)) throw new Error(`Not an OpenPGP packet at byte ${at}.`);
    let tag: number;
    let length: number;
    let start: number;
    if (first & 0x40) {
      // The new format: the tag, then a length of one, two or five bytes.
      tag = first & 0x3f;
      const octet = bytes[at + 1];
      if (octet < 192) [length, start] = [octet, at + 2];
      else if (octet < 224) [length, start] = [((octet - 192) << 8) + bytes[at + 2] + 192, at + 3];
      else if (octet === 255) [length, start] = [bytes.readUInt32BE(at + 2), at + 6];
      else throw new Error("Keys in pieces of unknown length are not supported.");
    } else {
      // The old format: tag and the size of the length share the first byte.
      tag = (first >> 2) & 0x0f;
      const size = [1, 2, 4][first & 0x03];
      if (!size) throw new Error("Packets of unknown length are not supported.");
      length = bytes.readUIntBE(at + 1, size);
      start = at + 1 + size;
    }
    found.push({ tag, body: bytes.subarray(start, start + length) });
    at = start + length;
  }
  return found;
};

/** The subpackets of a version 4 signature that the signature itself covers. */
const signedSubpackets = (body: Buffer) => {
  const found: Record<number, Buffer> = {};
  const end = 6 + body.readUInt16BE(4);
  let at = 6;
  while (at < end) {
    let length = body[at];
    if (length < 192) at += 1;
    else if (length < 255) [length, at] = [((length - 192) << 8) + body[at + 1] + 192, at + 2];
    else [length, at] = [body.readUInt32BE(at + 1), at + 5];
    found[body[at] & 0x7f] = body.subarray(at + 1, at + length);
    at += length;
  }
  return found;
};

// The curves by their OID (the number that names them inside the key).
const curves: Record<string, string> = {
  "2b06010401da470f01": "Ed25519",
  "2b060104019755010501": "Curve25519",
};

const algorithmName = (key: Buffer) => {
  const algorithm = key[5];
  if (algorithm === 27) return "Ed25519";
  if (algorithm === 28) return "Ed448";
  if (algorithm === 25) return "Curve25519";
  if (algorithm === 26) return "X448";
  if ([18, 19, 22].includes(algorithm))
    return curves[key.subarray(7, 7 + key[6]).toString("hex")] ?? `curve algorithm ${algorithm}`;
  if ([1, 2, 3].includes(algorithm)) return `RSA ${key.readUInt16BE(6)}`;
  return `algorithm ${algorithm}`;
};

/** What a key is for, from the key flags its signature gives it (RFC 9580, 5.2.3.29). */
const useOf = (flags: number): KeyUse => {
  if (flags & 0x0c) return "encryption";
  if (flags & 0x02) return "signing";
  if (flags & 0x20) return "authentication";
  return "certification";
};

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** The facts about an armored public key, as gpg prints them. */
export const keyFacts = (armored: string): KeyFacts => {
  const all = packets(dearmor(armored));
  const primary = all[0];
  if (primary?.tag !== 6 || primary.body[0] !== 4)
    throw new Error("This file does not start with a version 4 public key.");
  const fingerprint = createHash("sha1")
    .update(Buffer.from([0x99, primary.body.length >> 8, primary.body.length & 0xff]))
    .update(primary.body)
    .digest("hex")
    .toUpperCase();
  const created = primary.body.readUInt32BE(1);

  const userIds: string[] = [];
  let newest: { made: number; lasts?: number } | null = null;
  // The primary key, then each subkey, with the flags its own signature gives it.
  const keys = [{ body: primary.body, flags: 0 }];
  for (const packet of all.slice(1)) {
    if (packet.tag === 14) keys.push({ body: packet.body, flags: 0 });
    if (packet.tag === 13) userIds.push(packet.body.toString("utf8"));
    if (packet.tag !== 2 || packet.body[0] !== 4) continue;
    const type = packet.body[1];
    const subpackets = signedSubpackets(packet.body);
    const flags = subpackets[27]?.[0] ?? 0;
    // A certification of a user ID (signature types 0x10 to 0x13), on the primary key.
    if (keys.length === 1 && type >= 0x10 && type <= 0x13) {
      const made = subpackets[2]?.readUInt32BE(0) ?? 0;
      if (!newest || made >= newest.made) newest = { made, lasts: subpackets[9]?.readUInt32BE(0) };
      keys[0].flags ||= flags;
    }
    // A subkey's binding signature (type 0x18).
    if (keys.length > 1 && type === 0x18) keys[keys.length - 1].flags = flags;
  }

  return {
    fingerprint: fingerprint.match(/.{4}/g)!.join(" "),
    keyId: fingerprint.slice(-16),
    algorithms: keys.map((key) => ({ name: algorithmName(key.body), use: useOf(key.flags) })),
    created: day(created),
    expires: newest?.lasts ? day(created + newest.lasts) : null,
    userIds,
  };
};
