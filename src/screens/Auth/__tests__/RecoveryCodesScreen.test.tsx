import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { RecoveryCodesScreen } from "../RecoveryCodesScreen";
import { AuthService } from "../../../services/AuthService";

const mockReset = jest.fn();
let mockRouteParams: { mode?: string } = {};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ reset: mockReset }),
  useRoute: () => ({ params: mockRouteParams }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock("../../../context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      background: { gradient: ["#000", "#111"] },
    }),
    getFontSize: () => 16,
    getLocalizedText: (key: string) => key,
  }),
}));
jest.mock("../../../components", () => ({
  Button: ({ title, onPress, disabled }: any) => {
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        testID="cta-button"
      >
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));
jest.mock("../../../services/AuthService", () => ({
  AuthService: {
    fetchRecoveryCodes: jest.fn(),
    acknowledgeRecoveryCodes: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("../../../services/profileSetupFlag", () => ({
  profileSetupFlag: {
    markPending: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("../../../theme", () => ({
  colors: {
    text: { light: "#fff" },
    primary: { main: "#6200ee" },
    ui: { warning: "#f59e0b" },
  },
  spacing: { xl: 24, xs: 4, md: 16, lg: 20, sm: 8 },
  typography: { fontSize: { xs: 11, base: 14, sm: 12 } },
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

const mockedAuthService = AuthService as jest.Mocked<typeof AuthService>;

const CODES = [
  "AAAA-1111-XXXX",
  "BBBB-2222-YYYY",
  "CCCC-3333-ZZZZ",
  "DDDD-4444-AAAA",
  "EEEE-5555-BBBB",
  "FFFF-6666-CCCC",
  "GGGG-7777-DDDD",
  "HHHH-8888-EEEE",
];

describe("RecoveryCodesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  it("shows skeletons while loading", () => {
    mockedAuthService.fetchRecoveryCodes.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<RecoveryCodesScreen />);
    expect(getByText("auth.yourRecoveryCodes")).toBeTruthy();
  });

  it("displays codes after loading", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => {
      expect(getByText("AAAA-1111-XXXX")).toBeTruthy();
      expect(getByText("HHHH-8888-EEEE")).toBeTruthy();
    });
  });

  it("renders warning card", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => {
      expect(getByText("auth.recoveryCodesWarning")).toBeTruthy();
    });
  });

  it("renders copy button", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => {
      expect(getByText("auth.copyAllCodes")).toBeTruthy();
    });
  });

  it("pressing copy while loading does not crash", () => {
    mockedAuthService.fetchRecoveryCodes.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<RecoveryCodesScreen />);
    expect(() => fireEvent.press(getByText("auth.copyAllCodes"))).not.toThrow();
  });

  it("renders checkbox for save confirmation", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => {
      expect(getByText("auth.iSavedMyCodes")).toBeTruthy();
    });
  });

  it("CTA does not navigate when checkbox is unchecked", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByText("auth.continueToApp"));
    fireEvent.press(getByText("auth.continueToApp"));
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("enables CTA after checking the checkbox", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText, getByTestId } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByText("auth.iSavedMyCodes"));
    await act(async () => {
      fireEvent.press(getByText("auth.iSavedMyCodes"));
    });
    expect(getByTestId("cta-button").props.disabled).toBeFalsy();
  });

  it("navigates to ProfileSetup after confirming codes", async () => {
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByText("auth.iSavedMyCodes"));
    await act(async () => {
      fireEvent.press(getByText("auth.iSavedMyCodes"));
    });
    await act(async () => {
      fireEvent.press(getByText("auth.continueToApp"));
    });
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ProfileSetup" }],
      });
    });
  });

  it("handles fetch error gracefully", async () => {
    mockedAuthService.fetchRecoveryCodes.mockRejectedValue(new Error("net"));
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => {
      expect(getByText("auth.yourRecoveryCodes")).toBeTruthy();
    });
  });
});

describe("RecoveryCodesScreen — mode resume", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { mode: "resume" };
    mockedAuthService.fetchRecoveryCodes.mockResolvedValue(CODES);
  });

  it("affiche le banner d'avertissement fort en mode resume", async () => {
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => {
      expect(
        getByText(/Tu n'as pas encore sauvegardé tes codes/),
      ).toBeTruthy();
    });
  });

  it("n'affiche PAS le banner resume en mode normal", async () => {
    mockRouteParams = {};
    const { queryByText, getByText: getByTextLocal } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByTextLocal("auth.yourRecoveryCodes"));
    expect(
      queryByText(/Tu n'as pas encore sauvegardé tes codes/),
    ).toBeNull();
  });

  it("navigue vers ConversationsList en mode resume après confirmation", async () => {
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByText("auth.iSavedMyCodes"));
    await act(async () => {
      fireEvent.press(getByText("auth.iSavedMyCodes"));
    });
    await act(async () => {
      fireEvent.press(getByText("auth.continueToApp"));
    });
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ConversationsList" }],
      });
    });
  });

  it("appelle acknowledgeRecoveryCodes en mode resume", async () => {
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByText("auth.iSavedMyCodes"));
    await act(async () => {
      fireEvent.press(getByText("auth.iSavedMyCodes"));
    });
    await act(async () => {
      fireEvent.press(getByText("auth.continueToApp"));
    });
    await waitFor(() => {
      expect(mockedAuthService.acknowledgeRecoveryCodes).toHaveBeenCalledTimes(1);
    });
  });

  it("navigue quand même si acknowledgeRecoveryCodes échoue (erreur non-bloquante)", async () => {
    mockedAuthService.acknowledgeRecoveryCodes.mockRejectedValueOnce(
      new Error("network"),
    );
    const { getByText } = render(<RecoveryCodesScreen />);
    await waitFor(() => getByText("auth.iSavedMyCodes"));
    await act(async () => {
      fireEvent.press(getByText("auth.iSavedMyCodes"));
    });
    await act(async () => {
      fireEvent.press(getByText("auth.continueToApp"));
    });
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "ConversationsList" }],
      });
    });
  });
});
