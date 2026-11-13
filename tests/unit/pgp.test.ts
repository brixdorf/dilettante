// Tests the reader for Romit's OpenPGP key file: the Contact page shows the facts it reads, which
// must match what gpg itself says about the key.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { keyFacts } from "../../src/lib/pgp.ts";

const keyFile = join(import.meta.dirname, "..", "..", "public", "romitraj-pgp-public.asc");

describe("the OpenPGP key facts", () => {
  const facts = keyFacts(readFileSync(keyFile, "utf8"));

  it("match what gpg --show-keys prints", () => {
    expect(facts.fingerprint).toBe("010F 1F08 E31C AFDB 78E1 AEEC CF7E F21B CBB8 D0BB");
    expect(facts.keyId).toBe("CF7EF21BCBB8D0BB");
    expect(facts.algorithms).toEqual([
      { name: "Ed25519", use: "signing" },
      { name: "Curve25519", use: "encryption" },
    ]);
    expect(facts.created).toBe("2026-09-29");
    expect(facts.expires).toBe("2029-09-28");
    expect(facts.userIds).toEqual(["Romit Raj Sahu <hi@romitraj.dev>"]);
  });

  it("refuse a file that is not an armored key", () => {
    expect(() => keyFacts("hello")).toThrow(/not an armored key/);
  });

  it("refuse a damaged key", () => {
    const text = readFileSync(keyFile, "utf8");
    const damaged = text.replace(/^(mDME)./m, "$1A");
    expect(() => keyFacts(damaged)).toThrow();
  });
});
