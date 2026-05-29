import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { AccountRecoveredScreen } from "@/screens/Auth/AccountRecoveredScreen";

const mockReset = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ reset: mockReset }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      background: { gradient: ["#1a1a2e", "#16213e"] },
      text: { secondary: "rgba(255,255,255,0.7)" },
    }),
    getFontSize: (size: string) => ({ xxxl: 32, base: 16, sm: 13 })[size] ?? 14,
    getLocalizedText: (key: string) => key,
  }),
}));
jest.mock("@/components", () => ({
  Button: ({ title, onPress }: any) => {
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity onPress={onPress} testID="cta-button">
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: any) => {
    const { Text } = require("react-native");
    return <Text testID={`icon-${name}`}>{name}</Text>;
  },
}));
jest.mock("@/theme", () => ({
  colors: {
    text: { light: "#ffffff" },
    primary: { main: "#7c3aed" },
  },
  spacing: { xxxl: 40, xl: 24, lg: 20, md: 16, sm: 8, xs: 4 },
  typography: { fontSize: { base: 16, sm: 13 } },
}));

describe("AccountRecoveredScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders without crashing", () => {
    const { toJSON } = render(<AccountRecoveredScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("displays the title", () => {
    const { getByText } = render(<AccountRecoveredScreen />);
    expect(getByText("auth.accountRecoveredTitle")).toBeTruthy();
  });

  it("displays the subtitle", () => {
    const { getByText } = render(<AccountRecoveredScreen />);
    expect(getByText("auth.accountRecoveredSubtitle")).toBeTruthy();
  });

  it("displays encryption keys info", () => {
    const { getByText } = render(<AccountRecoveredScreen />);
    expect(getByText("auth.accountRecoveredKeysInfo")).toBeTruthy();
  });

  it("displays devices disconnected info", () => {
    const { getByText } = render(<AccountRecoveredScreen />);
    expect(getByText("auth.accountRecoveredDevicesInfo")).toBeTruthy();
  });

  it("displays the CTA button", () => {
    const { getByText } = render(<AccountRecoveredScreen />);
    expect(getByText("auth.accountRecoveredCta")).toBeTruthy();
  });

  it("navigates to ConversationsList on CTA press", () => {
    const { getByText } = render(<AccountRecoveredScreen />);
    fireEvent.press(getByText("auth.accountRecoveredCta"));
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: "ConversationsList" }],
    });
  });

  it("renders checkmark icon", () => {
    const { getByTestId } = render(<AccountRecoveredScreen />);
    expect(getByTestId("icon-checkmark")).toBeTruthy();
  });

  it("renders key icon in info card", () => {
    const { getByTestId } = render(<AccountRecoveredScreen />);
    expect(getByTestId("icon-key-outline")).toBeTruthy();
  });

  it("renders phone icon in info card", () => {
    const { getByTestId } = render(<AccountRecoveredScreen />);
    expect(getByTestId("icon-phone-portrait-outline")).toBeTruthy();
  });
});
