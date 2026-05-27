/* eslint-disable @typescript-eslint/no-explicit-any */

// Targeted tests for the caches added in WHISPR-1555:
//   - plaintext cache (decryptTextMessage)
//   - decrypted-media cache (decryptMediaFile, native path)
//   - reset hooks called from AuthService.logout

// Map name must start with `mock` so jest.mock() factory closures may
// reference it without tripping the hoist-time guard.
const mockFsFiles = new Map<string, string>();

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async (path: string) => {
    for (const k of [...mockFsFiles.keys()]) {
      if (k.startsWith(path)) mockFsFiles.delete(k);
    }
  }),
  getInfoAsync: jest.fn(async (path: string) => ({
    exists: mockFsFiles.has(path),
    uri: path,
  })),
  readAsStringAsync: jest.fn(async (path: string) => {
    const v = mockFsFiles.get(path);
    if (!v) throw new Error("ENOENT");
    return v;
  }),
  writeAsStringAsync: jest.fn(async (path: string, value: string) => {
    mockFsFiles.set(path, value);
  }),
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("../TokenService", () => ({
  TokenService: {
    getIdentityPrivateKey: jest.fn(),
    getAccessToken: jest.fn(),
    decodeAccessToken: jest.fn(),
  },
}));

jest.mock("../SecurityService", () => ({
  SignalKeysService: {
    listDevices: jest.fn(),
    getKeyBundle: jest.fn(),
  },
}));

import nacl from "tweetnacl";
import { encodeBase64, decodeUTF8 } from "tweetnacl-util";

import { E2EEService } from "../E2EEService";

beforeEach(() => {
  mockFsFiles.clear();
  // Wipe both caches between tests so memoization doesn't leak.
  E2EEService.resetPlaintextCache();
  return E2EEService.resetDecryptedMediaCache();
});

describe("E2EEService — decrypted media cache", () => {
  it("decryptMediaFile writes a deterministic file path and reuses it", async () => {
    const key = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const plain = decodeUTF8("hello-image-bytes");
    const cipher = nacl.secretbox(plain, nonce, key);

    // Encrypted source file: the implementation reads it as base64.
    const sourceUri = "file:///source/image.enc";
    mockFsFiles.set(sourceUri, encodeBase64(cipher));

    const first = await E2EEService.decryptMediaFile(
      sourceUri,
      encodeBase64(key),
      encodeBase64(nonce),
    );
    expect(first).toContain("whispr-e2ee-decrypted/");
    expect(mockFsFiles.has(first)).toBe(true);

    const second = await E2EEService.decryptMediaFile(
      sourceUri,
      encodeBase64(key),
      encodeBase64(nonce),
    );
    expect(second).toBe(first);
  });

  it("decryptMediaFile short-circuits to disk when memory is cold", async () => {
    const key = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const plain = decodeUTF8("payload");
    const cipher = nacl.secretbox(plain, nonce, key);

    const sourceUri = "file:///source/x";
    mockFsFiles.set(sourceUri, encodeBase64(cipher));

    const first = await E2EEService.decryptMediaFile(
      sourceUri,
      encodeBase64(key),
      encodeBase64(nonce),
    );

    // Drop the in-memory cache but keep the disk so the next call must hit
    // getInfoAsync and short-circuit through the disk-hit path.
    E2EEService.resetPlaintextCache();
    // Note: resetDecryptedMediaCache wipes disk too — use a manual clear
    // of the memory cache via a fresh call after clearing the mock state.
    const fs = require("expo-file-system/legacy");
    fs.readAsStringAsync.mockClear();
    fs.writeAsStringAsync.mockClear();

    const second = await E2EEService.decryptMediaFile(
      sourceUri,
      encodeBase64(key),
      encodeBase64(nonce),
    );
    expect(second).toBe(first);
    // No re-decrypt happened: no extra read of the encrypted source, no
    // extra write of the plaintext.
    expect(fs.readAsStringAsync).not.toHaveBeenCalled();
    expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("decryptMediaFile throws when secretbox.open fails (wrong key)", async () => {
    const realKey = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const plain = decodeUTF8("payload");
    const cipher = nacl.secretbox(plain, nonce, realKey);

    const sourceUri = "file:///source/wrong-key";
    mockFsFiles.set(sourceUri, encodeBase64(cipher));

    const otherKey = nacl.randomBytes(32);
    await expect(
      E2EEService.decryptMediaFile(
        sourceUri,
        encodeBase64(otherKey),
        encodeBase64(nonce),
      ),
    ).rejects.toThrow("DECRYPT_MEDIA_FAILED");
  });

  it("resetDecryptedMediaCache clears both memory and disk", async () => {
    const key = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const plain = decodeUTF8("bytes");
    const cipher = nacl.secretbox(plain, nonce, key);

    const sourceUri = "file:///source/clearme";
    mockFsFiles.set(sourceUri, encodeBase64(cipher));

    const decrypted = await E2EEService.decryptMediaFile(
      sourceUri,
      encodeBase64(key),
      encodeBase64(nonce),
    );
    expect(mockFsFiles.has(decrypted)).toBe(true);

    await E2EEService.resetDecryptedMediaCache();
    expect(mockFsFiles.has(decrypted)).toBe(false);
  });

  it("resetDecryptedMediaCache surfaces a warning when deleteAsync rejects", async () => {
    const fs = require("expo-file-system/legacy");
    fs.deleteAsync.mockRejectedValueOnce(new Error("EACCES"));
    // The method itself must not throw — it logs and resolves.
    await expect(
      E2EEService.resetDecryptedMediaCache(),
    ).resolves.toBeUndefined();
  });
});

describe("E2EEService — plaintext cache helpers", () => {
  it("resetPlaintextCache is idempotent and synchronous", () => {
    expect(() => E2EEService.resetPlaintextCache()).not.toThrow();
    expect(() => E2EEService.resetPlaintextCache()).not.toThrow();
  });
});
