import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { BiometricLockScreen } from "../BiometricLockScreen";

const mockAuthenticate = jest.fn();
jest.mock("expo-local-authentication", () => ({
  authenticateAsync: (opts: any) => mockAuthenticate(opts),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("../../../context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      background: { gradient: ["#000", "#111"] },
      text: { primary: "#fff", secondary: "#aaa" },
      primary: "#6200ee",
    }),
    getLocalizedText: (key: string) => key,
  }),
}));
jest.mock("../../../components", () => ({ Logo: () => null }));
jest.mock("../../../theme", () => ({
  colors: { text: { light: "#fff" }, primary: { main: "#6200ee" } },
  spacing: { xl: 24, md: 16, xxl: 32 },
  typography: { fontSize: { xxxl: 32, md: 16 } },
}));

describe("BiometricLockScreen", () => {
  const onUnlock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ success: false });
  });

  it("renders the unlock button", () => {
    const { getByText } = render(<BiometricLockScreen onUnlock={onUnlock} />);
    expect(getByText("biometric.unlockButton")).toBeTruthy();
  });

  it("triggers biometric prompt on mount", async () => {
    render(<BiometricLockScreen onUnlock={onUnlock} />);
    await waitFor(() => {
      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          promptMessage: "biometric.promptMessage",
          cancelLabel: "biometric.cancelLabel",
        }),
      );
    });
  });

  it("calls onUnlock when biometric succeeds", async () => {
    mockAuthenticate.mockResolvedValue({ success: true });
    render(<BiometricLockScreen onUnlock={onUnlock} />);
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });

  it("does not call onUnlock when biometric fails", async () => {
    mockAuthenticate.mockResolvedValue({ success: false });
    render(<BiometricLockScreen onUnlock={onUnlock} />);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalled());
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("re-prompts biometric when unlock button is pressed", async () => {
    mockAuthenticate.mockResolvedValue({ success: false });
    const { getByText } = render(<BiometricLockScreen onUnlock={onUnlock} />);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
    fireEvent.press(getByText("biometric.unlockButton"));
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(2));
  });

  it("calls onUnlock when button press triggers successful auth", async () => {
    mockAuthenticate
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });
    const { getByText } = render(<BiometricLockScreen onUnlock={onUnlock} />);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
    fireEvent.press(getByText("biometric.unlockButton"));
    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });
});
