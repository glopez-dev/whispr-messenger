/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

let mockReport: any = {
  id: "rep-1",
  category: "spam",
  status: "pending",
  reason: "Spam content",
  reporterId: "user-1",
  reportedUserId: "user-2",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { report: mockReport } }),
}));

jest.mock("../../../context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      background: { primary: "#000", secondary: "#111", tertiary: "#222" },
      text: { primary: "#fff", secondary: "#aaa", tertiary: "#555" },
      primary: "#fff",
      secondary: "#000",
      error: "#f00",
      success: "#0f0",
      warning: "#ff0",
      info: "#00f",
    }),
  }),
}));

jest.mock("../../../theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] }, dark: "#000" },
    text: { light: "#fff", secondary: "#aaa" },
    primary: { main: "#6200ee" },
    secondary: { main: "#03dac6" },
    ui: { divider: "#333", error: "#f00" },
  },
  withOpacity: (c: string) => c,
}));

import { ReportDetailScreen } from "../ReportDetailScreen";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ReportDetailScreen", () => {
  it("renders without crashing", async () => {
    const { toJSON } = render(<ReportDetailScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("renders every category branch without crashing", async () => {
    for (const cat of [
      "offensive",
      "spam",
      "nudity",
      "violence",
      "harassment",
      "other",
    ]) {
      mockReport = { ...mockReport, category: cat };
      const { toJSON } = render(<ReportDetailScreen />);
      await waitFor(() => expect(toJSON()).toBeTruthy());
    }
  });

  it("renders every status branch (pending, resolved variants)", async () => {
    for (const status of [
      "pending",
      "resolved_dismissed",
      "resolved_warning",
      "resolved_mute",
      "resolved_ban",
      "rejected",
    ]) {
      mockReport = { ...mockReport, status };
      const { toJSON } = render(<ReportDetailScreen />);
      await waitFor(() => expect(toJSON()).toBeTruthy());
    }
  });

  it("renders with optional fields populated (messageId, conversationId, adminNotes)", async () => {
    mockReport = {
      ...mockReport,
      messageId: "msg-1",
      conversationId: "conv-1",
      adminNotes: "Decided to dismiss",
      resolvedBy: "admin-1",
      resolvedAt: "2026-01-02T00:00:00.000Z",
    };
    const { toJSON } = render(<ReportDetailScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("back button dispatches navigation.goBack", async () => {
    const { UNSAFE_root } = render(<ReportDetailScreen />);
    await waitFor(() => expect(UNSAFE_root).toBeTruthy());
    const walk = (node: any): any => {
      if (node.props?.onPress) return node;
      const c = node.children;
      if (Array.isArray(c)) {
        for (const x of c) {
          const r = walk(x);
          if (r) return r;
        }
      }
      return null;
    };
    walk(UNSAFE_root)?.props.onPress?.();
    expect(mockGoBack).toHaveBeenCalled();
  });
});
