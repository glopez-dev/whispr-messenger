import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { SecurityKeysScreen, _qrCache } from "../SecurityKeysScreen";

const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ userId: "test-user-id", deviceId: "test-device-id" }),
}));
jest.mock("expo-crypto", () => ({
  digestStringAsync: jest
    .fn()
    .mockResolvedValue(
      "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    ),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));
jest.mock("../../../context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      background: {
        gradient: ["#000", "#111"],
        primary: "#000",
        secondary: "#111",
      },
      text: { primary: "#fff", secondary: "#aaa", tertiary: "#555" },
      primary: "#6200ee",
    }),
    getFontSize: () => 16,
    getLocalizedText: (key: string) => key,
  }),
}));
jest.mock("../../../components/Toast/Toast", () => () => null);
jest.mock("../../../utils/clipboard", () => ({
  copyToClipboard: jest.fn(),
}));
jest.mock("react-native-qrcode-styled", () => () => null);

const mockListDevices = jest.fn();
const mockRevokeDevice = jest.fn();
const mockGenerateQRChallenge = jest.fn();
const mockGetKeyBundle = jest.fn();
jest.mock("../../../services/SecurityService", () => ({
  DeviceManagerService: {
    listDevices: (...a: unknown[]) => mockListDevices(...a),
    revokeDevice: (...a: unknown[]) => mockRevokeDevice(...a),
    generateQRChallenge: (...a: unknown[]) => mockGenerateQRChallenge(...a),
  },
  SignalKeysService: {
    getKeyBundle: (...a: unknown[]) => mockGetKeyBundle(...a),
  },
}));

describe("SecurityKeysScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDevices.mockResolvedValue([]);
    mockGenerateQRChallenge.mockResolvedValue("jwt-challenge-token");
    mockGetKeyBundle.mockResolvedValue({
      identity_key: "dGVzdC1pZGVudGl0eS1rZXk=",
      signed_prekey: {
        key_id: 1,
        public_key: "cHVibGljS2V5",
        signature: "c2ln",
      },
      one_time_prekeys: [],
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    // Reset module-level cache so each test starts fresh
    _qrCache.challenge = null;
    _qrCache.deviceId = "";
    _qrCache.generatedAt = 0;
    _qrCache.inFlight = null;
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<SecurityKeysScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("fetches device list on mount", async () => {
    render(<SecurityKeysScreen />);
    await waitFor(() => expect(mockListDevices).toHaveBeenCalled());
  });

  it("renders devices returned by the API", async () => {
    mockListDevices.mockResolvedValue([
      {
        id: "test-device-id",
        deviceName: "Mon iPhone",
        deviceType: "ios",
        lastActive: new Date().toISOString(),
        isVerified: true,
        isActive: true,
      },
    ]);
    const { findByText } = render(<SecurityKeysScreen />);
    expect(await findByText("Mon iPhone")).toBeTruthy();
  });

  it("pre-fetches QR challenge on mount and opens modal on button press", async () => {
    const { getByText } = render(<SecurityKeysScreen />);
    await waitFor(() => expect(mockListDevices).toHaveBeenCalled());

    // generateQRChallenge is called immediately on mount (pre-fetch), not on button press
    await waitFor(() =>
      expect(mockGenerateQRChallenge).toHaveBeenCalledWith("test-device-id"),
    );

    const qrButton = getByText("security.scanQRCode");
    await act(async () => {
      fireEvent.press(qrButton);
    });

    // Cache is fresh — no additional API call on button press
    expect(mockGenerateQRChallenge).toHaveBeenCalledTimes(1);
  });
});
