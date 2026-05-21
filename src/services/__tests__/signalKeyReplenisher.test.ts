// WHISPR-1399 - test que replenishPreKeysIfNeeded consomme bien
// needs_replenishment du backend (sinon forward secrecy se degrade
// silencieusement).

const mockGetDeviceHealth = jest.fn();
const mockUploadSigned = jest.fn();
const mockUploadPrekeys = jest.fn();
const mockGenerate = jest.fn();
const mockGetToken = jest.fn();
const mockDecodeAccessToken = jest.fn();
const mockGetIdentityPrivateKey = jest.fn();

jest.mock("../SecurityService", () => ({
  SignalKeysService: {
    getDeviceHealth: (...args: unknown[]) => mockGetDeviceHealth(...args),
    uploadSignedPrekey: (...args: unknown[]) => mockUploadSigned(...args),
    uploadPrekeys: (...args: unknown[]) => mockUploadPrekeys(...args),
  },
}));

jest.mock("../SignalKeyService", () => ({
  SignalKeyService: {
    generateKeyBundle: (...args: unknown[]) => mockGenerate(...args),
  },
}));

jest.mock("../TokenService", () => ({
  TokenService: {
    getAccessToken: (...args: unknown[]) => mockGetToken(...args),
    decodeAccessToken: (...args: unknown[]) => mockDecodeAccessToken(...args),
    getIdentityPrivateKey: (...args: unknown[]) =>
      mockGetIdentityPrivateKey(...args),
  },
}));

jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { replenishPreKeysIfNeeded, __testing } from "../signalKeyReplenisher";

const FAKE_BUNDLE = {
  identityKey: "ik",
  signedPreKey: { keyId: 1, publicKey: "spk", signature: "sig" },
  preKeys: [
    { keyId: 100, publicKey: "pk100" },
    { keyId: 101, publicKey: "pk101" },
  ],
};

describe("replenishPreKeysIfNeeded", () => {
  beforeEach(() => {
    __testing.reset();
    mockGetDeviceHealth.mockReset();
    mockUploadSigned.mockReset().mockResolvedValue(undefined);
    mockUploadPrekeys.mockReset().mockResolvedValue(undefined);
    mockGenerate.mockReset().mockResolvedValue(FAKE_BUNDLE);
    mockGetToken.mockReset().mockResolvedValue("fake-token");
    mockDecodeAccessToken
      .mockReset()
      .mockReturnValue({ sub: "user-1", deviceId: "dev-1" });
    mockGetIdentityPrivateKey.mockReset().mockResolvedValue("existing-key");
  });

  it("ne fait rien si pas de session auth", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    await replenishPreKeysIfNeeded();
    expect(mockGetDeviceHealth).not.toHaveBeenCalled();
  });

  it("ne replenish pas si le serveur dit needs_replenishment=false", async () => {
    mockGetDeviceHealth.mockResolvedValueOnce({
      prekeys_remaining: 50,
      signed_prekey_age_days: 1,
      needs_replenishment: false,
    });
    await replenishPreKeysIfNeeded();
    expect(mockGetDeviceHealth).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUploadSigned).not.toHaveBeenCalled();
    expect(mockUploadPrekeys).not.toHaveBeenCalled();
  });

  it("upload un nouveau bundle quand needs_replenishment=true", async () => {
    mockGetDeviceHealth.mockResolvedValueOnce({
      prekeys_remaining: 3,
      signed_prekey_age_days: 12,
      needs_replenishment: true,
    });
    await replenishPreKeysIfNeeded();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockUploadSigned).toHaveBeenCalledWith({
      key_id: 1,
      public_key: "spk",
      signature: "sig",
    });
    expect(mockUploadPrekeys).toHaveBeenCalledWith([
      { key_id: 100, public_key: "pk100" },
      { key_id: 101, public_key: "pk101" },
    ]);
  });

  it("ne crash pas si getDeviceHealth throw", async () => {
    mockGetDeviceHealth.mockRejectedValueOnce(new Error("network"));
    await expect(replenishPreKeysIfNeeded()).resolves.not.toThrow();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("throttle les calls rapproches (foreground spam)", async () => {
    mockGetDeviceHealth.mockResolvedValue({
      prekeys_remaining: 50,
      signed_prekey_age_days: 1,
      needs_replenishment: false,
    });
    await replenishPreKeysIfNeeded();
    await replenishPreKeysIfNeeded();
    await replenishPreKeysIfNeeded();
    expect(mockGetDeviceHealth).toHaveBeenCalledTimes(1);
  });
});
