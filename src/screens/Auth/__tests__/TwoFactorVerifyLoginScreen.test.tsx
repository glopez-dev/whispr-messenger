/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { TwoFactorVerifyLoginScreen } from "@/screens/Auth/TwoFactorVerifyLoginScreen";
import { AuthService } from "@/services/AuthService";
import { TwoFactorService } from "@/services/TwoFactorService";
import { TokenService } from "@/services/TokenService";

const mockReset = jest.fn();
const mockGoBack = jest.fn();
const mockSignIn = jest.fn();

const ROUTE_PARAMS = {
  verificationId: "vid-abc",
  deviceInfo: {
    deviceId: "dev1",
    deviceName: "iPhone",
    deviceType: "mobile",
    model: "iPhone14",
    osVersion: "17.0",
    appVersion: "1.0.0",
  },
  signalKeyBundle: {
    identityKey: "idkey",
    signedPreKey: { keyId: 1, publicKey: "spk", signature: "sig" },
    preKeys: [],
  },
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    reset: mockReset,
    navigate: jest.fn(),
  }),
  useRoute: () => ({ params: ROUTE_PARAMS }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));
jest.mock("@/context/ThemeContext", () => ({
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
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    userId: null,
    deviceId: null,
    signIn: mockSignIn,
    signOut: jest.fn(),
  }),
}));
jest.mock("@/services/AuthService", () => ({
  AuthService: {
    loginAfter2FA: jest.fn(),
  },
}));
jest.mock("@/services/TwoFactorService", () => ({
  TwoFactorService: {
    useBackupCode: jest.fn(),
  },
}));
jest.mock("@/services/TokenService", () => ({
  TokenService: {
    saveTokens: jest.fn().mockResolvedValue(undefined),
    decodeAccessToken: jest.fn(),
  },
}));
jest.mock("@/services/UserService", () => ({
  UserService: {
    getInstance: () => ({
      bootstrapAccount: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));
jest.mock("@/components/Toast/Toast", () => {
  const { View } = require("react-native");
  return ({ visible }: any) => (visible ? <View testID="toast" /> : null);
});

const mockedAuth = AuthService as jest.Mocked<typeof AuthService>;
const mockedTwoFactor = TwoFactorService as jest.Mocked<
  typeof TwoFactorService
>;
const mockedToken = TokenService as jest.Mocked<typeof TokenService>;

describe("TwoFactorVerifyLoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedToken.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);
    mockedToken.saveTokens.mockResolvedValue(undefined);
  });

  it("affiche les deux onglets TOTP et backup code", () => {
    const { getByText } = render(<TwoFactorVerifyLoginScreen />);
    expect(getByText("twoFactor.tabTotp")).toBeTruthy();
    expect(getByText("twoFactor.tabBackupCode")).toBeTruthy();
  });

  it("appelle loginAfter2FA avec le bon code TOTP et navigue vers ConversationsList", async () => {
    mockedAuth.loginAfter2FA.mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
    });

    const { getByText, getByPlaceholderText } = render(
      <TwoFactorVerifyLoginScreen />,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("000000"), "123456");
    });

    await act(async () => {
      fireEvent.press(getByText("auth.continue"));
    });

    await waitFor(() => {
      expect(mockedAuth.loginAfter2FA).toHaveBeenCalledWith(
        ROUTE_PARAMS.verificationId,
        "123456",
        ROUTE_PARAMS.deviceInfo,
        ROUTE_PARAMS.signalKeyBundle,
      );
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ConversationsList" }],
      });
    });
  });

  it("appelle useBackupCode depuis l'onglet backup code et navigue", async () => {
    mockedTwoFactor.useBackupCode.mockResolvedValue({
      accessToken: "at2",
      refreshToken: "rt2",
    });

    const { getByText, getByPlaceholderText } = render(
      <TwoFactorVerifyLoginScreen />,
    );

    // Switcher sur l'onglet backup
    await act(async () => {
      fireEvent.press(getByText("twoFactor.tabBackupCode"));
    });

    await act(async () => {
      fireEvent.changeText(
        getByPlaceholderText("XXXX-XXXX-XXXX-XXXX"),
        "ABCD-1234-EFGH",
      );
    });

    await act(async () => {
      fireEvent.press(getByText("auth.continue"));
    });

    await waitFor(() => {
      expect(mockedTwoFactor.useBackupCode).toHaveBeenCalledWith(
        "ABCD-1234-EFGH",
        ROUTE_PARAMS.verificationId,
      );
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ConversationsList" }],
      });
    });
  });

  it("affiche une erreur toast quand loginAfter2FA retourne 401", async () => {
    const err = Object.assign(new Error("unauthorized"), { status: 401 });
    mockedAuth.loginAfter2FA.mockRejectedValue(err);

    const { getByText, getByPlaceholderText, findByTestId } = render(
      <TwoFactorVerifyLoginScreen />,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText("000000"), "000000");
    });
    await act(async () => {
      fireEvent.press(getByText("auth.continue"));
    });

    const toast = await findByTestId("toast");
    expect(toast).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
