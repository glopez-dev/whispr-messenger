import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { DevicePairingScannerScreen } from "@/screens/Auth/DevicePairingScannerScreen";
import { DeviceManagerService } from "@/services/SecurityService";
import { TokenService } from "@/services/TokenService";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReset = jest.fn();
const mockSignIn = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    reset: mockReset,
  }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-camera", () => ({
  CameraView: ({ onBarcodeScanned, children }: any) => {
    const { View, TouchableOpacity } = require("react-native");
    return (
      <View>
        {children}
        <TouchableOpacity
          testID="mock-scan-trigger"
          onPress={() =>
            onBarcodeScanned?.({ data: "mock.jwt.token", type: "qr" })
          }
        />
      </View>
    );
  },
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      text: { primary: "#fff", secondary: "#aaa" },
      primary: "#6200ee",
    }),
  }),
}));
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));
jest.mock("@/services/SecurityService", () => ({
  DeviceManagerService: { scanQRChallenge: jest.fn() },
  SignalKeysService: {
    uploadSignedPrekey: jest.fn().mockResolvedValue(undefined),
    uploadPrekeys: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/services/TokenService", () => ({
  TokenService: {
    saveTokens: jest.fn().mockResolvedValue(undefined),
    decodeAccessToken: jest.fn(),
  },
}));
jest.mock("@/services/SignalKeyService", () => ({
  SignalKeyService: {
    generateKeyBundle: jest.fn().mockResolvedValue({
      signedPreKey: { keyId: 1, publicKey: "pk", signature: "sig" },
      preKeys: [],
    }),
  },
}));
jest.mock("@/theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] } },
    text: { light: "#fff" },
    primary: { main: "#6200ee" },
  },
}));

describe("DevicePairingScannerScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders without crashing", () => {
    const { toJSON } = render(<DevicePairingScannerScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("navigates to ConversationsList on successful scan", async () => {
    (DeviceManagerService.scanQRChallenge as jest.Mock).mockResolvedValueOnce({
      accessToken: "access.token.here",
      refreshToken: "refresh.token.here",
    });
    (TokenService.decodeAccessToken as jest.Mock).mockReturnValueOnce({
      sub: "user-123",
      deviceId: "device-456",
      exp: 9999999999,
    });

    const { getByTestId } = render(<DevicePairingScannerScreen />);
    fireEvent.press(getByTestId("mock-scan-trigger"));

    await waitFor(() => {
      expect(TokenService.saveTokens).toHaveBeenCalledWith({
        accessToken: "access.token.here",
        refreshToken: "refresh.token.here",
      });
      expect(mockSignIn).toHaveBeenCalledWith("user-123", "device-456");
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ConversationsList" }],
      });
    });
  });

  it("shows error alert on scan failure", async () => {
    const { Alert } = require("react-native");
    jest.spyOn(Alert, "alert");
    (DeviceManagerService.scanQRChallenge as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );

    const { getByTestId } = render(<DevicePairingScannerScreen />);
    fireEvent.press(getByTestId("mock-scan-trigger"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Connexion échouée",
        expect.stringContaining("expiré"),
        expect.any(Array),
      );
    });
  });
});
