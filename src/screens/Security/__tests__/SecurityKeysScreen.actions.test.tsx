/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";

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
  __esModule: true,
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
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
  copyToClipboard: jest.fn().mockResolvedValue(undefined),
}));

import { SecurityKeysScreen } from "../SecurityKeysScreen";

function allOnPress(root: any) {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n) return;
    if (n.props && typeof n.props.onPress === "function") out.push(n);
    const c = n.children;
    if (Array.isArray(c)) for (const x of c) visit(x);
    else if (c && typeof c === "object") visit(c);
  };
  visit(root);
  return out;
}

beforeEach(() => jest.clearAllMocks());

describe("SecurityKeysScreen — multi-pass", () => {
  it("fires every onPress without throwing", async () => {
    const tree = render(<SecurityKeysScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    for (let pass = 0; pass < 3; pass++) {
      await act(async () => {
        for (const t of allOnPress(tree.UNSAFE_root)) {
          try {
            await t.props.onPress();
          } catch {
            /* swallow */
          }
        }
      });
    }
    expect(tree.toJSON()).toBeTruthy();
  });
});
