import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { getRandomBytes } from "expo-crypto";
import { TokenService } from "./TokenService";
import { E2EEService } from "./E2EEService";
import { generateClientRandom } from "../utils/crypto";
import type { SignalKeyBundleDto } from "../types/auth";

// tweetnacl looks for self.crypto which doesn't exist in Hermes — wire it up explicitly
nacl.setPRNG((x: Uint8Array, n: number) => {
  const bytes = getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

const NUM_ONE_TIME_PREKEYS = 100;

// Generate keyIds that fit in 32-bit signed INT (< 2^31 ≈ 2.14e9).
// Random 30-bit base avoids same-second collisions when the user
// reconnects multiple times, and leaves ~100 slots below 2^31 for the
// one-time prekeys numbered `base + i` (i < 100).
// CSPRNG pour coherence avec NaCl deja en place (cf. nacl.setPRNG ci-dessus).
function generateSignedPrekeyId(): number {
  return generateClientRandom() & 0x3fffffff;
}

function generatePrekeyIdBase(signedPrekeyId: number): number {
  // Pick a different random base for one-time prekeys so they never
  // overlap the signed prekey id even if both are generated in the same
  // second. The +/- spread within 2^30 keeps everything in INT32 range.
  let base = generateClientRandom() & 0x3fffffff;
  if (Math.abs(base - signedPrekeyId) < 200) {
    // In the unlikely collision, shift far enough away from signedPrekeyId.
    base = (signedPrekeyId + 0x20000000) & 0x3fffffff;
  }
  return base;
}

function toBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

export type KeyBundleContext = "register" | "login" | "recovery";

export function deriveIdentityPublicKey(secretKey: Uint8Array): Uint8Array {
  // nacl.box.keyPair() retourne une secretKey de 32 bytes.
  // slice(32, 64) sur 32 bytes = tableau vide → publicKey vide → identityKey ""
  // On utilise fromSecretKey pour reconstruire la paire correctement.
  return nacl.box.keyPair.fromSecretKey(secretKey).publicKey;
}

export const SignalKeyService = {
  async generateKeyBundle(
    context: KeyBundleContext = "register",
  ): Promise<SignalKeyBundleDto> {
    let identitySecretKey: Uint8Array;
    let identityPublicKey: Uint8Array;

    if (context === "login") {
      // En contexte login : réutiliser la clé d'identité existante pour ne
      // pas casser les sessions E2EE en cours. La clé est générée une seule
      // fois à l'inscription et persistée dans le vault sécurisé.
      const existingKey = await TokenService.getIdentityPrivateKey();
      if (existingKey) {
        identitySecretKey = decodeBase64(existingKey);
        identityPublicKey = deriveIdentityPublicKey(identitySecretKey);
      } else {
        // Pas de clé stockée (premier login sur cet appareil) : générer et persister.
        const kp = nacl.box.keyPair();
        identitySecretKey = kp.secretKey;
        identityPublicKey = kp.publicKey;
        await TokenService.saveIdentityPrivateKey(toBase64(identitySecretKey));
      }
    } else {
      // register ou recovery : générer une nouvelle paire et écraser.
      // recovery est un placeholder pour le flow complet du ticket suivant.
      const kp = nacl.box.keyPair();
      identitySecretKey = kp.secretKey;
      identityPublicKey = kp.publicKey;
      await TokenService.saveIdentityPrivateKey(toBase64(identitySecretKey));
    }

    // Signed pre-key pair (Curve25519)
    const signedPreKeyPair = nacl.box.keyPair();

    // Signer la clé publique du signed pre-key avec la clé d'identité (Ed25519)
    const signingKeyPair = nacl.sign.keyPair.fromSeed(
      identitySecretKey.slice(0, 32),
    );
    const signature = nacl.sign.detached(
      signedPreKeyPair.publicKey,
      signingKeyPair.secretKey,
    );

    const signedPrekeyId = generateSignedPrekeyId();
    const prekeyBase = generatePrekeyIdBase(signedPrekeyId);

    // One-time pre-keys
    const preKeys = Array.from({ length: NUM_ONE_TIME_PREKEYS }, (_, i) => {
      const kp = nacl.box.keyPair();
      return {
        keyId: prekeyBase + i,
        publicKey: toBase64(kp.publicKey),
      };
    });

    // Drop any stale cached identity keypair from E2EEService so subsequent
    // encrypt/decrypt operations pick up this freshly-generated key. Without
    // this a re-login on the same JS process keeps signing and decrypting
    // with the previous identity, producing envelopes whose
    // `sender.identity_key` doesn't match the one the server now publishes
    // — counterparts can't decrypt and see "Message chiffré".
    E2EEService.resetIdentityCache();

    return {
      identityKey: toBase64(identityPublicKey),
      signedPreKey: {
        keyId: signedPrekeyId,
        publicKey: toBase64(signedPreKeyPair.publicKey),
        signature: toBase64(signature),
      },
      preKeys,
    };
  },
};
