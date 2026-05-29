import React from "react";
import { render } from "@testing-library/react-native";

const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: mockCanGoBack }),
}));

const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockSetCallEndReason = jest.fn();
let mockActive: any = null;
let mockCallEndReason: any = null;

jest.mock("@/store/callsStore", () => {
  const fn: any = (selector: any) =>
    selector({
      active: mockActive,
      end: mockEnd,
      callEndReason: mockCallEndReason,
      setCallEndReason: mockSetCallEndReason,
    });
  fn.getState = () => ({
    active: mockActive,
    end: mockEnd,
    callEndReason: mockCallEndReason,
    setCallEndReason: mockSetCallEndReason,
  });
  return { useCallsStore: fn };
});

jest.mock("@/services/calls/liveKitProvider", () => ({
  callsLiveKit: {
    enableMic: jest.fn().mockResolvedValue(undefined),
    enableCamera: jest.fn().mockResolvedValue(undefined),
    flipCamera: jest.fn(),
  },
}));

jest.mock("livekit-client", () => ({
  RoomEvent: {
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    LocalTrackPublished: "localTrackPublished",
    Disconnected: "disconnected",
  },
  DisconnectReason: {
    CLIENT_INITIATED: 1,
  },
}));

jest.mock("@/components/Calls/CallParticipantTile", () => ({
  CallParticipantTile: () => null,
}));

jest.mock("@/components/Calls/CallControls", () => ({
  CallControls: () => null,
}));

jest.mock("@/components/Toast/Toast", () => ({
  __esModule: true,
  default: () => null,
}));

import { InCallScreen } from "@/screens/Calls/InCallScreen";

describe("InCallScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActive = null;
    mockCallEndReason = null;
  });

  it("matches snapshot when no active call", () => {
    const { toJSON } = render(<InCallScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("renders without crashing when there is an active room", () => {
    const room = {
      localParticipant: { identity: "me" },
      remoteParticipants: new Map(),
      on: jest.fn(),
      off: jest.fn(),
    };
    mockActive = { callId: "c1", status: "connected", room };
    const { toJSON } = render(<InCallScreen />);
    expect(toJSON()).toBeTruthy();
    expect(room.on).toHaveBeenCalled();
  });

  it("subscribes to room events on mount and unsubscribes on unmount", () => {
    const room = {
      localParticipant: { identity: "me" },
      remoteParticipants: new Map(),
      on: jest.fn(),
      off: jest.fn(),
    };
    mockActive = { callId: "c1", status: "connected", room };
    const { unmount } = render(<InCallScreen />);
    expect(room.on).toHaveBeenCalledTimes(8);
    unmount();
    expect(room.off).toHaveBeenCalledTimes(8);
  });

  it("ends the active call on unmount when user navigates away mid-call", () => {
    const room = {
      localParticipant: { identity: "me" },
      remoteParticipants: new Map(),
      on: jest.fn(),
      off: jest.fn(),
    };
    mockActive = { callId: "c1", status: "connected", room };
    const { unmount } = render(<InCallScreen />);
    expect(mockEnd).not.toHaveBeenCalled();
    unmount();
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it("does not call end on unmount when no active call exists", () => {
    mockActive = null;
    const { unmount } = render(<InCallScreen />);
    unmount();
    expect(mockEnd).not.toHaveBeenCalled();
  });
});
