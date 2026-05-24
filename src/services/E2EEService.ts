import nacl from "tweetnacl";
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from "tweetnacl-util";
import {
  getRandomBytes,
  digestStringAsync,
  CryptoDigestAlgorithm,
} from "expo-crypto";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { TokenService } from "./TokenService";
import { SignalKeysService } from "./SecurityService";

nacl.setPRNG((x: Uint8Array, n: number) => {
  const bytes = getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

type E2EEKeyPacket = {
  user_id: string;
  device_id: string;
  nonce: string;
  box: string;
};

type E2EEEnvelopeV1 = {
  v: 1;
  t: "whispr_e2ee_v1";
  conversation_id: string;
  sender: {
    user_id: string;
    device_id: string;
    identity_key: string;
  };
  cipher: {
    nonce: string;
    box: string;
  };
  key_packets: E2EEKeyPacket[];
};

function uuidToBytes(uuid: string): Uint8Array | null {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function uint32be(n: number): Uint8Array {
  const v = n >>> 0;
  return new Uint8Array([
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  ]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeSafetyNumber(
  myIdentityKey: string,
  myUserId: string,
  theirIdentityKey: string,
  theirUserId: string,
): Promise<string> {
  const ikA = decodeBase64(myIdentityKey);
  const ikB = decodeBase64(theirIdentityKey);
  const aFirst = compareBytes(ikA, ikB) <= 0;
  const orderedKeyHex = aFirst
    ? bytesToHex(ikA) + bytesToHex(ikB)
    : bytesToHex(ikB) + bytesToHex(ikA);
  const idABytes = uuidToBytes(myUserId) ?? decodeUTF8(myUserId);
  const idBBytes = uuidToBytes(theirUserId) ?? decodeUTF8(theirUserId);
  const orderedIdHex = aFirst
    ? bytesToHex(idABytes) + bytesToHex(idBBytes)
    : bytesToHex(idBBytes) + bytesToHex(idABytes);
  const hash = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    orderedKeyHex + orderedIdHex,
  );
  const decimal = BigInt("0x" + hash)
    .toString(10)
    .padStart(60, "0")
    .slice(-60);
  return (decimal.match(/.{1,5}/g) ?? []).join(" ");
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isEnvelopeV1(value: unknown): value is E2EEEnvelopeV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as any;
  if (v.v !== 1 || v.t !== "whispr_e2ee_v1") return false;
  if (typeof v.conversation_id !== "string") return false;
  if (!v.sender || typeof v.sender !== "object") return false;
  if (typeof v.sender.user_id !== "string") return false;
  if (typeof v.sender.device_id !== "string") return false;
  if (typeof v.sender.identity_key !== "string") return false;
  if (!v.cipher || typeof v.cipher !== "object") return false;
  if (typeof v.cipher.nonce !== "string") return false;
  if (typeof v.cipher.box !== "string") return false;
  if (!Array.isArray(v.key_packets)) return false;
  return true;
}

let cachedIdentitySecretKey: Uint8Array | null = null;
let cachedIdentityPublicKey: Uint8Array | null = null;

export const __testing = {
  resetCache(): void {
    cachedIdentitySecretKey = null;
    cachedIdentityPublicKey = null;
  },
};

async function loadIdentityKeypair(): Promise<{
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  if (cachedIdentitySecretKey && cachedIdentityPublicKey) {
    return {
      secretKey: cachedIdentitySecretKey,
      publicKey: cachedIdentityPublicKey,
    };
  }
  const b64 = await TokenService.getIdentityPrivateKey();
  if (!b64) {
    throw new Error("NO_IDENTITY_KEY");
  }
  const secretKey = fromBase64(b64);
  const kp = nacl.box.keyPair.fromSecretKey(secretKey);
  cachedIdentitySecretKey = kp.secretKey;
  cachedIdentityPublicKey = kp.publicKey;
  return { secretKey: kp.secretKey, publicKey: kp.publicKey };
}

async function loadSessionIds(): Promise<{ userId: string; deviceId: string }> {
  const token = await TokenService.getAccessToken();
  if (!token) throw new Error("NO_ACCESS_TOKEN");
  const payload = TokenService.decodeAccessToken(token);
  if (!payload?.sub || !payload?.deviceId)
    throw new Error("INVALID_ACCESS_TOKEN");
  return { userId: payload.sub, deviceId: payload.deviceId };
}

function toBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

function normalizeBase64(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, "");
  const base64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  return base64 + "=".repeat(padLen);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof b64 !== "string") {
    throw new TypeError("INVALID_BASE64");
  }
  return decodeBase64(normalizeBase64(b64));
}

function deriveEd25519SigningKeypairFromSeed(
  seed32: Uint8Array,
): nacl.SignKeyPair {
  if (seed32.length !== 32) {
    throw new Error("INVALID_SEED_LENGTH");
  }
  return nacl.sign.keyPair.fromSeed(seed32);
}

export const E2EEService = {
  isEncryptedPayload(content: string): boolean {
    if (typeof content !== "string") return false;
    if (!content.startsWith("{")) return false;
    const parsed = safeJsonParse(content);
    return isEnvelopeV1(parsed);
  },

  async encryptMessageForConversation(params: {
    conversationId: string;
    plaintext: string;
    clientRandom: number;
    recipientUserIds: string[];
  }): Promise<{
    content: string;
    signature: string;
    sender_public_key: string;
  }> {
    const [
      { secretKey: senderSecret, publicKey: senderPublic },
      { userId, deviceId },
    ] = await Promise.all([loadIdentityKeypair(), loadSessionIds()]);

    // Gather all devices for all recipients
    const allRecipientDevices = await Promise.all(
      params.recipientUserIds.map(async (uid) => {
        try {
          const devices = await SignalKeysService.listDevices(uid);
          const deviceIds = devices.deviceIds ?? [];
          const bundles = await Promise.all(
            deviceIds.map(async (d) => {
              try {
                const bundle = await SignalKeysService.getKeyBundle(uid, d);
                return {
                  user_id: uid,
                  device_id: d,
                  identity_key: bundle.identity_key,
                };
              } catch (err) {
                console.warn(
                  `[E2EEService] Could not fetch bundle for user ${uid} device ${d}:`,
                  err,
                );
                return null;
              }
            }),
          );
          return bundles.filter((b): b is any => b !== null);
        } catch (encErr) {
          console.warn(
            `[E2EEService] Could not fetch devices for user ${uid}:`,
            encErr,
          );
          return [];
        }
      }),
    );

    const recipients = allRecipientDevices.flat();

    // Always include our other devices so we can read our own messages
    // (the current device is added below)
    let myOtherRecipients: any[] = [];
    try {
      const myDevices = await SignalKeysService.listDevices(userId);
      const myOtherDeviceIds = (myDevices.deviceIds ?? []).filter(
        (d) => d !== deviceId,
      );

      const myOtherBundles = await Promise.all(
        myOtherDeviceIds.map(async (d) => {
          try {
            const bundle = await SignalKeysService.getKeyBundle(userId, d);
            return {
              user_id: userId,
              device_id: d,
              identity_key: bundle.identity_key,
            };
          } catch (err) {
            console.warn(
              `[E2EEService] Could not fetch bundle for own device ${d}:`,
              err,
            );
            return null;
          }
        }),
      );
      myOtherRecipients = myOtherBundles.filter((b): b is any => b !== null);
    } catch (err) {
      console.warn("[E2EEService] Could not fetch keys for own devices:", err);
    }

    recipients.push(...myOtherRecipients);

    // Include the current device/identity so the sender part of the envelope is complete
    recipients.push({
      user_id: userId,
      device_id: deviceId,
      identity_key: toBase64(senderPublic),
    });

    // CRITICAL: If we have NO recipients (other than ourselves), and E2EE is mandatory, we MUST fail
    // because we cannot encrypt for anyone else.
    // Previous filter used `r.user_id !== userId || r.device_id !== deviceId` which counted
    // the sender's OWN secondary devices as recipients — a user with >=1 other device would
    // never trip the guard even when 0 packets could be produced for the real interlocutor.
    // Use strict user-id comparison so only true counterparts are counted.
    const otherRecipientsCount = recipients.filter(
      (r) => r.user_id !== userId,
    ).length;

    if (otherRecipientsCount === 0 && params.recipientUserIds.length > 0) {
      throw new Error("RECIPIENT_NO_DEVICES");
    }

    const messageKey = nacl.randomBytes(32);
    const msgNonce = nacl.randomBytes(24);
    const msgBytes = decodeUTF8(params.plaintext);
    const msgBox = nacl.secretbox(msgBytes, msgNonce, messageKey);
    if (!msgBox) {
      throw new Error("ENCRYPT_FAILED");
    }

    const key_packets: E2EEKeyPacket[] = recipients.map((r) => {
      const recipientPub = fromBase64(r.identity_key);
      const nonce = nacl.randomBytes(24);
      const box = nacl.box(messageKey, nonce, recipientPub, senderSecret);
      return {
        user_id: r.user_id,
        device_id: r.device_id,
        nonce: toBase64(nonce),
        box: toBase64(box),
      };
    });

    const envelope: E2EEEnvelopeV1 = {
      v: 1,
      t: "whispr_e2ee_v1",
      conversation_id: params.conversationId,
      sender: {
        user_id: userId,
        device_id: deviceId,
        identity_key: toBase64(senderPublic),
      },
      cipher: {
        nonce: toBase64(msgNonce),
        box: toBase64(msgBox),
      },
      key_packets,
    };

    const content = JSON.stringify(envelope);

    const convBytes = uuidToBytes(params.conversationId);
    if (!convBytes) {
      throw new Error("INVALID_CONVERSATION_ID");
    }

    const signingKeyPair = deriveEd25519SigningKeypairFromSeed(
      senderSecret.slice(0, 32),
    );

    const signedData = concatBytes(
      decodeUTF8(content),
      convBytes,
      uint32be(params.clientRandom),
    );
    const signature = nacl.sign.detached(signedData, signingKeyPair.secretKey);

    return {
      content,
      signature: toBase64(signature),
      sender_public_key: toBase64(signingKeyPair.publicKey),
    };
  },

  async encryptDirectTextMessage(params: {
    conversationId: string;
    plaintext: string;
    clientRandom: number;
    recipientUserId: string;
  }): Promise<{
    content: string;
    signature: string;
    sender_public_key: string;
  }> {
    return this.encryptMessageForConversation({
      conversationId: params.conversationId,
      plaintext: params.plaintext,
      clientRandom: params.clientRandom,
      recipientUserIds: [params.recipientUserId],
    });
  },

  async decryptTextMessage(params: {
    conversationId: string;
    content: string;
  }): Promise<string | null> {
    const parsed = safeJsonParse(params.content);
    if (!isEnvelopeV1(parsed)) return null;
    if (parsed.conversation_id !== params.conversationId) return null;

    const [{ secretKey }, { userId, deviceId }] = await Promise.all([
      loadIdentityKeypair(),
      loadSessionIds(),
    ]);

    const packet = parsed.key_packets.find(
      (p) => p.user_id === userId && p.device_id === deviceId,
    );
    if (!packet) return null;

    const senderPub = fromBase64(parsed.sender.identity_key);
    const keyNonce = fromBase64(packet.nonce);
    const keyBox = fromBase64(packet.box);
    const messageKey = nacl.box.open(keyBox, keyNonce, senderPub, secretKey);
    if (!messageKey) return null;

    const msgNonce = fromBase64(parsed.cipher.nonce);
    const msgBox = fromBase64(parsed.cipher.box);
    const plain = nacl.secretbox.open(msgBox, msgNonce, messageKey);
    if (!plain) return null;

    return encodeUTF8(plain);
  },

  async encryptMediaFile(uri: string): Promise<{
    encryptedUri: string;
    key: string;
    nonce: string;
  }> {
    if (Platform.OS === "web") {
      // For web, we'd use Blobs and the Web Crypto API, but for now we follow the mobile path
      // using fetch to get the blob and then FileReader or arrayBuffer
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const key = nacl.randomBytes(32);
      const nonce = nacl.randomBytes(24);
      const box = nacl.secretbox(bytes, nonce, key);

      const encryptedBlob = new Blob([box as any], {
        type: "application/octet-stream",
      });
      const encryptedUri = URL.createObjectURL(encryptedBlob);

      return {
        encryptedUri,
        key: toBase64(key),
        nonce: toBase64(nonce),
      };
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = fromBase64(base64);

    const key = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const box = nacl.secretbox(bytes, nonce, key);

    const encryptedBase64 = toBase64(box);
    const encryptedUri = `${FileSystem.cacheDirectory || ""}enc-${Date.now()}`;
    await FileSystem.writeAsStringAsync(encryptedUri, encryptedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return {
      encryptedUri,
      key: toBase64(key),
      nonce: toBase64(nonce),
    };
  },

  async decryptMediaFile(
    uri: string,
    keyB64: string,
    nonceB64: string,
  ): Promise<string> {
    const key = fromBase64(keyB64);
    const nonce = fromBase64(nonceB64);

    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const plain = nacl.secretbox.open(bytes, nonce, key);
      if (!plain) throw new Error("DECRYPT_MEDIA_FAILED");

      const decryptedBlob = new Blob([plain as any]);
      return URL.createObjectURL(decryptedBlob);
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = fromBase64(base64);

    const plain = nacl.secretbox.open(bytes, nonce, key);
    if (!plain) throw new Error("DECRYPT_MEDIA_FAILED");

    const decryptedBase64 = toBase64(plain);
    const decryptedUri = `${FileSystem.cacheDirectory || ""}dec-${Date.now()}`;
    await FileSystem.writeAsStringAsync(decryptedUri, decryptedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return decryptedUri;
  },
};
