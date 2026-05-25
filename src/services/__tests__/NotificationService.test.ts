/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("../TokenService", () =>
  require("../../__test-utils__/mockFactories").makeTokenServiceMock(),
);
jest.mock("../AuthService", () =>
  require("../../__test-utils__/mockFactories").makeAuthServiceMock(),
);
jest.mock("../DeviceService", () =>
  require("../../__test-utils__/mockFactories").makeDeviceServiceMock(),
);
jest.mock("../apiBase", () =>
  require("../../__test-utils__/mockFactories").makeApiBaseMock(
    "https://api.test",
  ),
);

// expo-notifications est chargé dynamiquement via require() dans loadExpoNotifications()
// - Platform.OS doit valoir "ios" ou "android" pour que le module soit chargé
// - jest.mock ici intercepte le require() au runtime
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetDevicePushTokenAsync = jest.fn();
const mockAddPushTokenListener = jest.fn();
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...args: any[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: any[]) =>
    mockRequestPermissionsAsync(...args),
  getDevicePushTokenAsync: (...args: any[]) =>
    mockGetDevicePushTokenAsync(...args),
  addPushTokenListener: (...args: any[]) => mockAddPushTokenListener(...args),
}));

import { NotificationService } from "../NotificationService";
import { TokenService } from "../TokenService";
import { AuthService } from "../AuthService";
import {
  installFetchMock,
  mockResponse,
} from "../../__test-utils__/mockFactories";

const mockedToken = TokenService as any;
const mockedAuth = AuthService as any;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = installFetchMock();
  mockedToken.getAccessToken.mockReset().mockResolvedValue("at");
  mockedAuth.refreshTokens.mockReset().mockResolvedValue(undefined);
});

describe("NotificationService.getBadge", () => {
  it("returns the unread_count from the response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { unread_count: 7 } }),
    );

    await expect(NotificationService.getBadge()).resolves.toBe(7);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/notification/api/v1/badge");
  });

  it("defaults to 0 when unread_count is missing or not a number", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ body: {} }));
    await expect(NotificationService.getBadge()).resolves.toBe(0);
  });
});

describe("NotificationService.getSettings / updateSettings", () => {
  it("GETs the settings for a user", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { push_enabled: true } }),
    );

    const result = await NotificationService.getSettings("user 1/x");

    expect(mockFetch.mock.calls[0][0] as string).toBe(
      "https://api.test/notification/api/settings/user%201%2Fx",
    );
    expect(result).toEqual({ push_enabled: true });
  });

  it("PUTs the partial settings payload", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ body: { push_enabled: false } }),
    );

    await NotificationService.updateSettings("u1", { push_enabled: false });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/notification/api/settings/u1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ push_enabled: false });
  });
});

describe("NotificationService.muteConversation", () => {
  it("POSTs with duration when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));
    await NotificationService.muteConversation("c-1", 3600);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.test/notification/api/conversations/c-1/mute",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ duration: 3600 });
  });

  it("POSTs an empty body when no duration is provided (indefinite mute)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));
    await NotificationService.muteConversation("c-1");

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({});
  });
});

describe("NotificationService.unmuteConversation", () => {
  it("DELETEs the mute endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));
    await NotificationService.unmuteConversation("c-1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.test/notification/api/conversations/c-1/mute",
    );
    expect(init.method).toBe("DELETE");
  });
});

describe("NotificationService.registerDevice / unregisterDevice", () => {
  it("POSTs the token with device_id, platform, app_version, user_id", async () => {
    const mockedDevice = require("../DeviceService").DeviceService as any;
    mockedDevice.getOrCreateDeviceId.mockResolvedValue("dev-xyz");
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await NotificationService.registerDevice({
      token: "fcm-tok",
      userId: "user-42",
      platform: "android",
      appVersion: "1.2.3",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/notification/api/v1/devices");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      device_id: "dev-xyz",
      fcm_token: "fcm-tok",
      platform: "android",
      app_version: "1.2.3",
      user_id: "user-42",
    });
  });

  it("DELETEs /api/v1/devices/:deviceId", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await NotificationService.unregisterDevice("dev-1/2");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/notification/api/v1/devices/dev-1%2F2");
    expect(init.method).toBe("DELETE");
  });
});

describe("NotificationService 401 retry & error handling", () => {
  it("refreshes the token on 401 and retries once", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ status: 401 }))
      .mockResolvedValueOnce(mockResponse({ body: { unread_count: 1 } }));

    await expect(NotificationService.getBadge()).resolves.toBe(1);
    expect(mockedAuth.refreshTokens).toHaveBeenCalledTimes(1);
  });

  it("propagates an error with status on non-OK", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: 500, body: { message: "crash" } }),
    );

    await expect(NotificationService.getBadge()).rejects.toMatchObject({
      message: "crash",
      status: 500,
    });
  });

  it("falls back to 'HTTP <status>' when the error body has no message", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 503 }));
    await expect(NotificationService.getBadge()).rejects.toThrow("HTTP 503");
  });
});

describe("NotificationService.initPushRegistration", () => {
  const Platform = require("react-native").Platform;

  beforeEach(() => {
    Platform.OS = "ios";
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockGetDevicePushTokenAsync.mockReset();
    mockAddPushTokenListener.mockReset();
    // listener stub retourne une subscription supprimable
    mockAddPushTokenListener.mockReturnValue({ remove: jest.fn() });

    const mockedDevice = require("../DeviceService").DeviceService as any;
    mockedDevice.getOrCreateDeviceId.mockResolvedValue("dev-ios");
  });

  afterEach(() => {
    // nettoyer le listener entre tests pour éviter les fuites d'état
    NotificationService.tearDownPushRegistration();
  });

  it("demande la permission si elle n'est pas encore accordée, puis enregistre le token APNS", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetDevicePushTokenAsync.mockResolvedValue({
      type: "ios",
      data: "apns-token-abc123",
    });
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await NotificationService.initPushRegistration("user-ios-1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/notification/api/v1/devices");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.fcm_token).toBe("apns-token-abc123");
    expect(body.platform).toBe("ios");
    expect(body.user_id).toBe("user-ios-1");
  });

  it("ne fait rien si la permission est refusée", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissionsAsync.mockResolvedValue({ status: "denied" });

    await NotificationService.initPushRegistration("user-ios-2");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it("saute requestPermissionsAsync si la permission est déjà accordée", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetDevicePushTokenAsync.mockResolvedValue({
      type: "ios",
      data: "apns-token-xyz",
    });
    mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await NotificationService.initPushRegistration("user-ios-3");

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("abonne un listener de rotation de token APNS", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetDevicePushTokenAsync.mockResolvedValue({
      type: "ios",
      data: "apns-token-init",
    });
    mockFetch.mockResolvedValue(mockResponse({ status: 204 }));

    await NotificationService.initPushRegistration("user-ios-4");

    expect(mockAddPushTokenListener).toHaveBeenCalledTimes(1);

    // simule une rotation de token APNS
    const rotationCallback = mockAddPushTokenListener.mock.calls[0][0];
    rotationCallback({ type: "ios", data: "apns-token-rotated" });

    // le callback déclenche une promesse fire-and-forget — on vide la file
    // de microtâches en plusieurs passes pour laisser registerDevice() s'exécuter
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const rotatedBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(rotatedBody.fcm_token).toBe("apns-token-rotated");
  });

  it("n'abonne pas un second listener si appelé deux fois (idempotent)", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetDevicePushTokenAsync.mockResolvedValue({
      type: "ios",
      data: "apns-token-a",
    });
    mockFetch.mockResolvedValue(mockResponse({ status: 204 }));

    await NotificationService.initPushRegistration("user-ios-5");
    await NotificationService.initPushRegistration("user-ios-5");

    expect(mockAddPushTokenListener).toHaveBeenCalledTimes(1);
  });

  it("est no-op sur web (Platform.OS === 'web')", async () => {
    Platform.OS = "web";

    await NotificationService.initPushRegistration("user-web");

    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("swallowe les erreurs réseau sans propager (best-effort)", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetDevicePushTokenAsync.mockRejectedValue(new Error("APNS indispo"));

    await expect(
      NotificationService.initPushRegistration("user-ios-6"),
    ).resolves.toBeUndefined();
  });
});

describe("NotificationService.tearDownPushRegistration", () => {
  const Platform = require("react-native").Platform;

  beforeEach(() => {
    Platform.OS = "ios";
    mockGetPermissionsAsync.mockReset();
    mockRequestPermissionsAsync.mockReset();
    mockGetDevicePushTokenAsync.mockReset();
    mockAddPushTokenListener.mockReset();
  });

  it("supprime le listener de rotation au logout", async () => {
    const removeSub = jest.fn();
    mockAddPushTokenListener.mockReturnValue({ remove: removeSub });
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetDevicePushTokenAsync.mockResolvedValue({
      type: "ios",
      data: "apns-tok",
    });
    mockFetch.mockResolvedValue(mockResponse({ status: 204 }));

    await NotificationService.initPushRegistration("user-logout");
    NotificationService.tearDownPushRegistration();

    expect(removeSub).toHaveBeenCalledTimes(1);
  });

  it("est sans effet si aucun listener n'est enregistré (idempotent)", () => {
    expect(() => NotificationService.tearDownPushRegistration()).not.toThrow();
  });
});
