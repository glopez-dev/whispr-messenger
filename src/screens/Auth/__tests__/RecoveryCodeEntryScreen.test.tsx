import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { RecoveryCodeEntryScreen } from "../RecoveryCodeEntryScreen";
import { AuthService } from "../../../services/AuthService";
import { TokenService } from "../../../services/TokenService";

const mockGoBack = jest.fn();
const mockReset = jest.fn();
const mockSignIn = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, reset: mockReset }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock("../../../context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({ background: { gradient: ["#000", "#111"] } }),
    getFontSize: () => 16,
    getLocalizedText: (key: string) => key,
  }),
}));
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    signIn: mockSignIn,
  }),
}));
jest.mock("../../../services/AuthService", () => ({
  AuthService: {
    redeemRecoveryCode: jest.fn(),
  },
}));
jest.mock("../../../services/TokenService", () => ({
  TokenService: {
    decodeAccessToken: jest.fn(),
  },
}));
jest.mock("../../../components", () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        testID="redeem-button"
      >
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));
jest.mock("../../../theme", () => ({
  colors: {
    text: { light: "#fff" },
    primary: { main: "#6200ee" },
    ui: { error: "#f00" },
  },
  spacing: { xl: 24, xs: 4, md: 16, lg: 20, sm: 8 },
  typography: { fontSize: { base: 14, sm: 12, xs: 11 } },
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

const mockedAuthService = AuthService as jest.Mocked<typeof AuthService>;
const mockedTokenService = TokenService as jest.Mocked<typeof TokenService>;

describe("RecoveryCodeEntryScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the title", () => {
    const { getByText } = render(<RecoveryCodeEntryScreen />);
    expect(getByText("auth.enterRecoveryCode")).toBeTruthy();
  });

  it("renders the redeem button", () => {
    const { getByText } = render(<RecoveryCodeEntryScreen />);
    expect(getByText("auth.redeemCode")).toBeTruthy();
  });

  it("renders the back button", () => {
    const { getByText } = render(<RecoveryCodeEntryScreen />);
    expect(getByText("←")).toBeTruthy();
  });

  it("navigates back on back press", () => {
    const { getByText } = render(<RecoveryCodeEntryScreen />);
    fireEvent.press(getByText("←"));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("pressing redeem without code does not call service", async () => {
    const { getByText } = render(<RecoveryCodeEntryScreen />);
    fireEvent.press(getByText("auth.redeemCode"));
    await waitFor(() => {
      expect(mockedAuthService.redeemRecoveryCode).not.toHaveBeenCalled();
    });
  });

  it("input field is present and accepts text", () => {
    const { getByPlaceholderText } = render(<RecoveryCodeEntryScreen />);
    const input = getByPlaceholderText("auth.recoveryCodePlaceholder");
    fireEvent.changeText(input, "AAAA-1111-XXXX");
    expect(input.props.value).toBe("AAAA-1111-XXXX");
  });

  it("navigates to ConversationsList on successful redeem", async () => {
    mockedAuthService.redeemRecoveryCode.mockResolvedValue({
      accessToken: "tok",
      refreshToken: "ref",
    });
    mockedTokenService.decodeAccessToken.mockReturnValue({
      sub: "user1",
      deviceId: "dev1",
    } as any);

    const { getByText, getByPlaceholderText } = render(
      <RecoveryCodeEntryScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("auth.recoveryCodePlaceholder"),
      "AAAA-1111-XXXX",
    );
    await act(async () => {
      fireEvent.press(getByText("auth.redeemCode"));
    });

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ConversationsList" }],
      });
    });
  });

  it("shows invalid code error on failure", async () => {
    const err = Object.assign(new Error("bad"), { status: 400 });
    mockedAuthService.redeemRecoveryCode.mockRejectedValue(err);

    const { getByText, getByPlaceholderText } = render(
      <RecoveryCodeEntryScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("auth.recoveryCodePlaceholder"),
      "BAD-CODE-XXXX",
    );
    await act(async () => {
      fireEvent.press(getByText("auth.redeemCode"));
    });

    await waitFor(() => {
      expect(getByText("auth.invalidRecoveryCode")).toBeTruthy();
    });
  });

  it("shows rate limit error on 429", async () => {
    const err = Object.assign(new Error("rate"), { status: 429 });
    mockedAuthService.redeemRecoveryCode.mockRejectedValue(err);

    const { getByText, getByPlaceholderText } = render(
      <RecoveryCodeEntryScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("auth.recoveryCodePlaceholder"),
      "AAAA-1111-XXXX",
    );
    await act(async () => {
      fireEvent.press(getByText("auth.redeemCode"));
    });

    await waitFor(() => {
      expect(getByText("auth.recoveryCodeRateLimit")).toBeTruthy();
    });
  });

  it("clears error when user edits the code", async () => {
    const err = Object.assign(new Error("bad"), { status: 400 });
    mockedAuthService.redeemRecoveryCode.mockRejectedValue(err);

    const { getByText, getByPlaceholderText, queryByText } = render(
      <RecoveryCodeEntryScreen />,
    );
    const input = getByPlaceholderText("auth.recoveryCodePlaceholder");
    fireEvent.changeText(input, "BAD-CODE-XXXX");
    await act(async () => {
      fireEvent.press(getByText("auth.redeemCode"));
    });
    await waitFor(() => getByText("auth.invalidRecoveryCode"));

    fireEvent.changeText(input, "NEW-CODE-XXXX");
    expect(queryByText("auth.invalidRecoveryCode")).toBeNull();
  });
});
