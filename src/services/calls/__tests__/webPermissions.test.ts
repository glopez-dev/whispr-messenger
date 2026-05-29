/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests pour webPermissions — demande de permissions média navigateur.
 */

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

import { requestWebMediaPermissions } from "@/services/calls/webPermissions";

describe("requestWebMediaPermissions", () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("retourne granted=true quand getUserMedia réussit", async () => {
    const mockStream = {
      getTracks: () => [{ stop: jest.fn() }],
    };
    Object.defineProperty(global, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: jest.fn().mockResolvedValue(mockStream),
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await requestWebMediaPermissions(false);

    expect(result.granted).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("arrête les tracks du stream après la demande de permission", async () => {
    const stopFn = jest.fn();
    const mockStream = {
      getTracks: () => [{ stop: stopFn }, { stop: stopFn }],
    };
    Object.defineProperty(global, "navigator", {
      value: {
        mediaDevices: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
      },
      writable: true,
      configurable: true,
    });

    await requestWebMediaPermissions(true);

    expect(stopFn).toHaveBeenCalledTimes(2);
  });

  it("retourne error=not-allowed sur NotAllowedError", async () => {
    const err = Object.assign(new Error(""), { name: "NotAllowedError" });
    Object.defineProperty(global, "navigator", {
      value: {
        mediaDevices: { getUserMedia: jest.fn().mockRejectedValue(err) },
      },
      writable: true,
      configurable: true,
    });

    const result = await requestWebMediaPermissions(false);

    expect(result.granted).toBe(false);
    expect(result.error).toBe("not-allowed");
    expect(result.message).toContain("refusé");
  });

  it("retourne error=not-allowed sur PermissionDeniedError", async () => {
    const err = Object.assign(new Error(""), { name: "PermissionDeniedError" });
    Object.defineProperty(global, "navigator", {
      value: {
        mediaDevices: { getUserMedia: jest.fn().mockRejectedValue(err) },
      },
      writable: true,
      configurable: true,
    });

    const result = await requestWebMediaPermissions(false);

    expect(result.granted).toBe(false);
    expect(result.error).toBe("not-allowed");
  });

  it("retourne error=not-found sur NotFoundError", async () => {
    const err = Object.assign(new Error(""), { name: "NotFoundError" });
    Object.defineProperty(global, "navigator", {
      value: {
        mediaDevices: { getUserMedia: jest.fn().mockRejectedValue(err) },
      },
      writable: true,
      configurable: true,
    });

    const result = await requestWebMediaPermissions(false);

    expect(result.granted).toBe(false);
    expect(result.error).toBe("not-found");
    expect(result.message).toContain("micro");
  });

  it("retourne error=not-supported quand navigator.mediaDevices est absent", async () => {
    Object.defineProperty(global, "navigator", {
      value: { mediaDevices: undefined },
      writable: true,
      configurable: true,
    });

    const result = await requestWebMediaPermissions(false);

    expect(result.granted).toBe(false);
    expect(result.error).toBe("not-supported");
  });

  it("retourne error=unknown pour les erreurs inconnues", async () => {
    const err = Object.assign(new Error("weird"), { name: "SecurityError" });
    Object.defineProperty(global, "navigator", {
      value: {
        mediaDevices: { getUserMedia: jest.fn().mockRejectedValue(err) },
      },
      writable: true,
      configurable: true,
    });

    const result = await requestWebMediaPermissions(false);

    expect(result.granted).toBe(false);
    expect(result.error).toBe("unknown");
  });

  it("retourne granted=true immédiatement sur plateforme natif (non-web)", async () => {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: "ios" } }));
    const {
      requestWebMediaPermissions: fn,
    } = require("@/services/calls/webPermissions");

    const result = await fn(false);

    expect(result.granted).toBe(true);
  });
});
