import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { OtpScreen } from "../OtpScreen";
import { AuthService } from "../../../services/AuthService";
import { TokenService } from "../../../services/TokenService";

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
  useRoute: () => ({
    params: {
      phoneNumber: "+33612345678",
      verificationId: "vid123",
      purpose: "login",
      demoCode: undefined,
    },
  }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
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
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    userId: null,
    deviceId: null,
    signIn: mockSignIn,
    signOut: jest.fn(),
  }),
}));
jest.mock("../../../components", () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));
jest.mock("../../../services/AuthService", () => ({
  AuthService: {
    confirmVerification: jest.fn(),
    register: jest.fn(),
    login: jest.fn(),
    requestVerification: jest.fn(),
  },
}));
jest.mock("../../../services/TokenService", () => ({
  TokenService: {
    decodeAccessToken: jest.fn(),
    getAccessToken: jest.fn(),
  },
}));
jest.mock("../../../services/SignalKeyService", () => ({
  SignalKeyService: {
    generateKeyBundle: jest.fn().mockResolvedValue({
      signedPreKey: { keyId: 1, publicKey: "pk", signature: "sig" },
      preKeys: [],
    }),
  },
}));
jest.mock("../../../services/DeviceService", () => ({
  DeviceService: {
    getDeviceInfo: jest.fn().mockResolvedValue({
      deviceId: "dev1",
      deviceName: "iPhone",
      deviceType: "mobile",
      model: "iPhone14",
      osVersion: "17.0",
      appVersion: "1.0.0",
    }),
  },
}));
jest.mock("../../../services/SecurityService", () => ({
  SignalKeysService: {
    uploadSignedPrekey: jest.fn().mockResolvedValue({}),
    uploadPrekeys: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock("../../../theme", () => ({
  colors: {
    text: { light: "#fff" },
    primary: { main: "#6200ee" },
    ui: { error: "#f00" },
  },
  spacing: { xl: 24, xs: 4, md: 16, lg: 20, sm: 8, xxxl: 40 },
  typography: { fontSize: { xl: 24, base: 14, sm: 12, lg: 18 } },
}));

const mockedAuthService = AuthService as jest.Mocked<typeof AuthService>;
const mockedTokenService = TokenService as jest.Mocked<typeof TokenService>;

describe("OtpScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders verify button", () => {
    const { getByText } = render(<OtpScreen />);
    expect(getByText("auth.verify")).toBeTruthy();
  });

  it("renders back button", () => {
    const { getByText } = render(<OtpScreen />);
    expect(getByText("←")).toBeTruthy();
  });

  it("navigates back on back press", () => {
    const { getByText } = render(<OtpScreen />);
    fireEvent.press(getByText("←"));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("auto-submits and navigates to ConversationsList on successful login", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({ verified: true });
    mockedAuthService.login.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "ref",
    });
    mockedTokenService.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);

    const { getAllByDisplayValue } = render(<OtpScreen />);

    // Paste all 6 digits at once into the first input — triggers auto-submit
    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "123456");
    });

    await waitFor(
      () => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: "ConversationsList" }],
        });
      },
      { timeout: 8000 },
    );
  }, 10000);

  it("shows error on wrong code", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({
      verified: false,
    });

    const { getAllByDisplayValue, getByText } = render(<OtpScreen />);

    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "999999");
    });

    await waitFor(
      () => {
        expect(getByText("auth.codeIncorrect")).toBeTruthy();
      },
      { timeout: 8000 },
    );
  }, 10000);

  it("navigue vers TwoFactorVerifyLogin quand requires2FA est true", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({
      verified: true,
      requires2FA: true,
    });

    const { getAllByDisplayValue } = render(<OtpScreen />);

    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "123456");
    });

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith(
          "TwoFactorVerifyLogin",
          expect.objectContaining({ verificationId: "vid123" }),
        );
      },
      { timeout: 8000 },
    );
    // login ne doit PAS être appelé
    expect(mockedAuthService.login).not.toHaveBeenCalled();
  }, 10000);

  it("flow normal login quand requires2FA est absent", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({ verified: true });
    mockedAuthService.login.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "ref",
    });
    mockedTokenService.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);

    const { getAllByDisplayValue } = render(<OtpScreen />);

    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "123456");
    });

    await waitFor(
      () => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: "ConversationsList" }],
        });
      },
      { timeout: 8000 },
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(
      "TwoFactorVerifyLogin",
      expect.anything(),
    );
  }, 10000);

  it("redirige vers RecoveryCodes mode resume si recovery_codes_acknowledged est false", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({ verified: true });
    mockedAuthService.login.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "ref",
      recovery_codes_acknowledged: false,
    } as any);
    mockedTokenService.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);

    const { getAllByDisplayValue } = render(<OtpScreen />);

    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "123456");
    });

    await waitFor(
      () => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: "RecoveryCodes", params: { mode: "resume" } }],
        });
      },
      { timeout: 8000 },
    );
  }, 10000);

  it("flow normal si recovery_codes_acknowledged est true", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({ verified: true });
    mockedAuthService.login.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "ref",
      recovery_codes_acknowledged: true,
    } as any);
    mockedTokenService.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);

    const { getAllByDisplayValue } = render(<OtpScreen />);

    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "123456");
    });

    await waitFor(
      () => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: "ConversationsList" }],
        });
      },
      { timeout: 8000 },
    );
  }, 10000);

  it("compat: champ absent dans la response → flow normal (default true)", async () => {
    mockedAuthService.confirmVerification.mockResolvedValue({ verified: true });
    // Pas de recovery_codes_acknowledged dans la response
    mockedAuthService.login.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "ref",
    });
    mockedTokenService.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);

    const { getAllByDisplayValue } = render(<OtpScreen />);

    await act(async () => {
      fireEvent.changeText(getAllByDisplayValue("")[0], "123456");
    });

    await waitFor(
      () => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [{ name: "ConversationsList" }],
        });
      },
      { timeout: 8000 },
    );
  }, 10000);
});
