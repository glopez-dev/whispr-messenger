import { renderHook } from "@testing-library/react-native";
import { act } from "@testing-library/react-native";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";

let netInfoCallback: ((state: object) => void) | null = null;
const mockUnsubscribe = jest.fn();
const mockNudge = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: (state: object) => void) => {
      netInfoCallback = cb;
      return mockUnsubscribe;
    }),
  },
}));

jest.mock("@/services/messaging/websocket", () => ({
  getSharedSocket: jest.fn(() => ({ nudge: mockNudge })),
}));

jest.mock("@/utils/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

const fire = (
  isConnected: boolean,
  isInternetReachable: boolean | null = true,
) => {
  act(() => {
    netInfoCallback?.({ isConnected, isInternetReachable });
  });
};

beforeEach(() => {
  netInfoCallback = null;
  mockUnsubscribe.mockClear();
  mockNudge.mockClear();
});

describe("useNetworkMonitor", () => {
  it("calls NetInfo.addEventListener on mount and unsubscribes on unmount", () => {
    const NetInfo = require("@react-native-community/netinfo").default;
    const { unmount } = renderHook(() => useNetworkMonitor());

    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("nudges the socket on offline → online transition", () => {
    renderHook(() => useNetworkMonitor());

    fire(false); // go offline
    fire(true); // come back online

    expect(mockNudge).toHaveBeenCalledTimes(1);
  });

  it("does NOT nudge when already online on the first event", () => {
    renderHook(() => useNetworkMonitor());

    fire(true); // first event while wasReachable is null

    expect(mockNudge).not.toHaveBeenCalled();
  });

  it("does NOT nudge on consecutive online events (no transition)", () => {
    renderHook(() => useNetworkMonitor());

    fire(false);
    fire(true); // nudge here (offline → online)
    fire(true); // no nudge (online → online)

    expect(mockNudge).toHaveBeenCalledTimes(1);
  });

  it("nudges again on a second offline → online cycle", () => {
    renderHook(() => useNetworkMonitor());

    fire(false);
    fire(true); // first nudge
    fire(false);
    fire(true); // second nudge

    expect(mockNudge).toHaveBeenCalledTimes(2);
  });

  it("treats isInternetReachable=false as offline", () => {
    renderHook(() => useNetworkMonitor());

    fire(true, false); // connected but no internet — treat as offline
    fire(true, true); // truly online now → nudge

    expect(mockNudge).toHaveBeenCalledTimes(1);
  });

  it("does not throw when getSharedSocket throws (socket not yet initialised)", () => {
    const { getSharedSocket } = require("@/services/messaging/websocket");
    (getSharedSocket as jest.Mock).mockImplementationOnce(() => {
      throw new Error("socket not ready");
    });
    renderHook(() => useNetworkMonitor());

    expect(() => {
      fire(false);
      fire(true);
    }).not.toThrow();
  });
});
