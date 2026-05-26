/* eslint-disable @typescript-eslint/no-explicit-any */

const mockSaveIdentityPrivateKey = jest.fn();
const mockResetIdentityCache = jest.fn();

jest.mock("../TokenService", () => ({
  TokenService: {
    saveIdentityPrivateKey: (...args: any[]) =>
      mockSaveIdentityPrivateKey(...args),
  },
}));

jest.mock("../E2EEService", () => ({
  E2EEService: {
    resetIdentityCache: (...args: any[]) => mockResetIdentityCache(...args),
  },
}));

jest.mock("expo-crypto", () => ({
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n)),
}));

jest.mock("tweetnacl", () => {
  const mkKeyPair = () => ({
    publicKey: new Uint8Array(32).fill(0xaa),
    secretKey: new Uint8Array(32).fill(0xbb),
  });
  return {
    __esModule: true,
    default: {
      setPRNG: jest.fn(),
      box: {
        keyPair: Object.assign(jest.fn(mkKeyPair), {
          // fromSecretKey reconstruit la paire depuis la secretKey 32 bytes
          fromSecretKey: jest.fn((_sk: Uint8Array) => ({
            publicKey: new Uint8Array(32).fill(0xac),
            secretKey: new Uint8Array(32).fill(0xbb),
          })),
        }),
      },
      sign: {
        keyPair: {
          fromSeed: jest.fn(() => ({
            publicKey: new Uint8Array(32).fill(0xcc),
            secretKey: new Uint8Array(64).fill(0xdd),
          })),
        },
        detached: jest.fn(() => new Uint8Array(64).fill(0xee)),
      },
    },
  };
});

jest.mock("tweetnacl-util", () => ({
  encodeBase64: jest.fn((bytes: Uint8Array) => `b64(${bytes.length})`),
  decodeBase64: jest.fn((s: string) => new Uint8Array(64).fill(0xab)),
}));

import { SignalKeyService } from "../SignalKeyService";
import nacl from "tweetnacl";

const mockedNacl = nacl as unknown as {
  setPRNG: jest.Mock;
  box: { keyPair: jest.Mock & { fromSecretKey: jest.Mock } };
  sign: {
    keyPair: { fromSeed: jest.Mock };
    detached: jest.Mock;
  };
};

beforeEach(() => {
  mockSaveIdentityPrivateKey.mockReset().mockResolvedValue(undefined);
  mockResetIdentityCache.mockReset();
  mockedNacl.box.keyPair.mockClear();
  mockedNacl.box.keyPair.fromSecretKey.mockClear();
  mockedNacl.sign.keyPair.fromSeed.mockClear();
  mockedNacl.sign.detached.mockClear();
});

describe("SignalKeyService.generateKeyBundle", () => {
  it("returns a bundle with identityKey, signedPreKey and 100 preKeys", async () => {
    const bundle = await SignalKeyService.generateKeyBundle();

    expect(bundle).toMatchObject({
      identityKey: expect.any(String),
      signedPreKey: {
        keyId: expect.any(Number),
        publicKey: expect.any(String),
        signature: expect.any(String),
      },
    });
    expect(bundle.preKeys).toHaveLength(100);
  });

  it("generates sequential keyIds starting from a common base", async () => {
    const bundle = await SignalKeyService.generateKeyBundle();
    const ids = bundle.preKeys.map((pk) => pk.keyId);
    const base = ids[0];

    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(base + i);
    }
  });

  it("keeps every keyId within signed int32 range", async () => {
    const bundle = await SignalKeyService.generateKeyBundle();

    expect(bundle.signedPreKey.keyId).toBeGreaterThanOrEqual(0);
    expect(bundle.signedPreKey.keyId).toBeLessThan(0x80000000);
    for (const pk of bundle.preKeys) {
      expect(pk.keyId).toBeGreaterThanOrEqual(0);
      expect(pk.keyId).toBeLessThan(0x80000000);
    }
  });

  it("persists the identity private key via TokenService", async () => {
    await SignalKeyService.generateKeyBundle();

    expect(mockSaveIdentityPrivateKey).toHaveBeenCalledTimes(1);
    expect(mockSaveIdentityPrivateKey).toHaveBeenCalledWith(
      expect.stringContaining("b64("),
    );
  });

  it("invalidates the E2EE identity cache after writing the new private key", async () => {
    // Cache must be dropped at the moment the on-disk key changes so a
    // re-login on the same JS process stops returning the stale cached
    // keypair from E2EEService.loadIdentityKeypair. Order matters: the
    // save must happen before the reset so a failed write doesn't wipe a
    // cache that's still consistent with disk.
    const callOrder: string[] = [];
    mockSaveIdentityPrivateKey.mockImplementation(async () => {
      callOrder.push("save");
    });
    mockResetIdentityCache.mockImplementation(() => {
      callOrder.push("reset");
    });

    await SignalKeyService.generateKeyBundle();

    expect(mockResetIdentityCache).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["save", "reset"]);
  });

  it("signs the signed pre-key public key with the derived Ed25519 key", async () => {
    await SignalKeyService.generateKeyBundle();

    expect(mockedNacl.sign.keyPair.fromSeed).toHaveBeenCalledTimes(1);
    expect(mockedNacl.sign.detached).toHaveBeenCalledTimes(1);
    // Called with (signedPreKey.publicKey, signingSecretKey)
    const [pubKeyArg, secretKeyArg] = mockedNacl.sign.detached.mock.calls[0];
    expect(pubKeyArg).toBeInstanceOf(Uint8Array);
    expect(secretKeyArg).toBeInstanceOf(Uint8Array);
  });

  it("generates a fresh identity keypair and a separate signed pre-key keypair", async () => {
    await SignalKeyService.generateKeyBundle();

    // 1 identity + 1 signed-prekey + 100 one-time prekeys
    expect(mockedNacl.box.keyPair).toHaveBeenCalledTimes(102);
  });

  it("derives prekey ids from CSPRNG (expo-crypto), not Math.random", async () => {
    // les ids viennent de getRandomBytes(4), donc on doit pouvoir les piloter
    // via le mock pour verifier que c'est bien la source utilisee.
    const expoCrypto = jest.requireMock("expo-crypto") as {
      getRandomBytes: jest.Mock;
    };
    let call = 0;
    expoCrypto.getRandomBytes.mockImplementation((n: number) => {
      call += 1;
      const buf = new Uint8Array(n);
      // octets non-zero pour eviter l'ambiguite avec un mock par defaut
      for (let i = 0; i < n; i++) buf[i] = (call * 13 + i) & 0xff;
      return buf;
    });

    const bundle = await SignalKeyService.generateKeyBundle();

    // au moins 2 appels dedies aux ids prekey (signed + base) sur l'ensemble
    expect(expoCrypto.getRandomBytes).toHaveBeenCalledWith(4);
    expect(bundle.signedPreKey.keyId).toBeGreaterThan(0);
    expect(bundle.preKeys[0].keyId).toBeGreaterThan(0);
    // ids dans l'INT32 signe
    expect(bundle.signedPreKey.keyId).toBeLessThan(0x80000000);
    for (const pk of bundle.preKeys) {
      expect(pk.keyId).toBeLessThan(0x80000000);
    }

    expoCrypto.getRandomBytes.mockReset();
    expoCrypto.getRandomBytes.mockImplementation(
      (n: number) => new Uint8Array(n),
    );
  });
});

describe("SignalKeyService.generateKeyBundle context-aware", () => {
  const mockGetIdentityPrivateKey = jest.fn();

  beforeEach(() => {
    mockGetIdentityPrivateKey.mockReset();
    // Injecter getIdentityPrivateKey dans le mock TokenService existant
    const TokenService = jest.requireMock("../TokenService").TokenService;
    TokenService.getIdentityPrivateKey = mockGetIdentityPrivateKey;
  });

  it("register context : génère et persiste une nouvelle paire quelle que soit la clé existante", async () => {
    mockGetIdentityPrivateKey.mockResolvedValue("existing-key-base64");

    await SignalKeyService.generateKeyBundle("register");

    // generateKeyBundle doit TOUJOURS écraser en register
    expect(mockSaveIdentityPrivateKey).toHaveBeenCalledTimes(1);
    // nacl.box.keyPair appelé pour identity + signedPreKey + 100 one-time
    expect(mockedNacl.box.keyPair).toHaveBeenCalledTimes(102);
  });

  it("login context : réutilise la clé existante sans écraser le storage", async () => {
    // decodeBase64 retourne 32 bytes (taille réelle nacl.box secretKey)
    const { decodeBase64 } = jest.requireMock("tweetnacl-util");
    decodeBase64.mockReturnValue(new Uint8Array(32).fill(0xab));
    mockGetIdentityPrivateKey.mockResolvedValue("existing-b64-key");

    const bundle = await SignalKeyService.generateKeyBundle("login");

    // clé existante présente → pas d'overwrite
    expect(mockSaveIdentityPrivateKey).not.toHaveBeenCalled();
    // nacl.box.keyPair appelé seulement pour signedPreKey + 100 one-time (pas identity)
    expect(mockedNacl.box.keyPair).toHaveBeenCalledTimes(101);
    // fromSecretKey utilisé pour dériver la publicKey depuis la secretKey stockée
    expect(mockedNacl.box.keyPair.fromSecretKey).toHaveBeenCalledTimes(1);
    expect(mockedNacl.box.keyPair.fromSecretKey).toHaveBeenCalledWith(
      new Uint8Array(32).fill(0xab),
    );
    // identityKey ne doit PAS être vide
    expect(bundle.identityKey).toBeTruthy();
    expect(bundle.identityKey.length).toBeGreaterThan(0);
  });

  it("login context sans clé stockée : génère et persiste une nouvelle clé", async () => {
    const { decodeBase64 } = jest.requireMock("tweetnacl-util");
    decodeBase64.mockReturnValue(new Uint8Array(32).fill(0xab));
    mockGetIdentityPrivateKey.mockResolvedValue(null);

    await SignalKeyService.generateKeyBundle("login");

    expect(mockSaveIdentityPrivateKey).toHaveBeenCalledTimes(1);
    // identity + signedPreKey + 100 one-time
    expect(mockedNacl.box.keyPair).toHaveBeenCalledTimes(102);
  });

  it("recovery context : génère et persiste une nouvelle paire", async () => {
    mockGetIdentityPrivateKey.mockResolvedValue("old-key");

    await SignalKeyService.generateKeyBundle("recovery");

    expect(mockSaveIdentityPrivateKey).toHaveBeenCalledTimes(1);
    expect(mockedNacl.box.keyPair).toHaveBeenCalledTimes(102);
  });
});
