/**
 * Tests sans mock nacl pour garantir que deriveIdentityPublicKey
 * produit bien une cle publique valide de 32 bytes non nulle.
 *
 * Regression guard contre le bug identityKey="" (WHISPR-safety-number-empty-key) :
 * si fromSecretKey est remplace par .secretKey.slice(32,64) la cle devient vide.
 */

// Ces tests utilisent le vrai nacl — pas de mock global ici.
// Le préfixe "mock" est requis pour que jest.mock() puisse accéder à cette variable
// (babel-jest autorise uniquement les variables prefixées "mock" dans les factory functions).
let mockCallCount = 0;
jest.mock("expo-crypto", () => ({
  getRandomBytes: jest.fn((n: number) => {
    mockCallCount++;
    const buf = new Uint8Array(n);
    // Chaque appel produit une séquence différente grâce au compteur,
    // ce qui garantit que nacl.box.keyPair() génère des paires distinctes.
    for (let i = 0; i < n; i++)
      buf[i] = ((mockCallCount * 97 + i + 1) * 37) & 0xff;
    return buf;
  }),
}));

jest.mock("../TokenService", () => ({
  TokenService: {
    saveIdentityPrivateKey: jest.fn().mockResolvedValue(undefined),
    getIdentityPrivateKey: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("../E2EEService", () => ({
  E2EEService: {
    resetIdentityCache: jest.fn(),
  },
}));

import nacl from "tweetnacl";
import { deriveIdentityPublicKey } from "../SignalKeyService";

describe("deriveIdentityPublicKey (real nacl)", () => {
  it("retourne une Uint8Array de 32 bytes", () => {
    const secretKey = nacl.box.keyPair().secretKey;
    const pubKey = deriveIdentityPublicKey(secretKey);
    expect(pubKey).toBeInstanceOf(Uint8Array);
    expect(pubKey.length).toBe(32);
  });

  it("la cle publique n'est pas tout zeros", () => {
    const secretKey = nacl.box.keyPair().secretKey;
    const pubKey = deriveIdentityPublicKey(secretKey);
    expect(pubKey.some((b) => b !== 0)).toBe(true);
  });

  it("est deterministe : meme secretKey -> meme publicKey", () => {
    const secretKey = nacl.box.keyPair().secretKey;
    const pubKey1 = deriveIdentityPublicKey(secretKey);
    const pubKey2 = deriveIdentityPublicKey(secretKey);
    expect(pubKey1).toEqual(pubKey2);
  });

  it("deux secretKeys differentes produisent des publicKeys differentes", () => {
    const sk1 = nacl.box.keyPair().secretKey;
    const sk2 = nacl.box.keyPair().secretKey;
    const pk1 = deriveIdentityPublicKey(sk1);
    const pk2 = deriveIdentityPublicKey(sk2);
    // Probabilite de collision negligeable avec nacl CSPRNG
    expect(pk1).not.toEqual(pk2);
  });

  it("leve une erreur sur une secretKey vide (protection contre slice vide)", () => {
    expect(() => deriveIdentityPublicKey(new Uint8Array(0))).toThrow();
  });

  it("leve une erreur sur une secretKey de mauvaise taille (< 32 bytes)", () => {
    expect(() => deriveIdentityPublicKey(new Uint8Array(16))).toThrow();
  });
});
