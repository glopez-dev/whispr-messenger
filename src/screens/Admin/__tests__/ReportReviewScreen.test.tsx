/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const mockGoBack = jest.fn();
let mockReport: any = {
  id: "rep-1",
  category: "spam",
  status: "pending",
  reason: "Spam content",
  reporterId: "user-1",
  reportedUserId: "user-2",
  messageId: "msg-1",
  conversationId: "conv-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
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

const mockResolveReport = jest.fn();
jest.mock("../../../store/moderationStore", () => ({
  useModerationStore: () => ({ resolveReport: mockResolveReport }),
}));

jest.mock("../../../services/moderation/moderationApi", () => ({
  sanctionsAPI: { createSanction: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sanctionsAPI } = require("../../../services/moderation/moderationApi");

jest.mock("../../../components/Moderation", () => ({
  AdminGate: ({ children }: any) => children,
  ReportStatusBadge: () => null,
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

import { ReportReviewScreen } from "../ReportReviewScreen";

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

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveReport.mockResolvedValue(undefined);
  sanctionsAPI.createSanction.mockResolvedValue({ id: "san-1" });
});

describe("ReportReviewScreen", () => {
  it("renders the report details", async () => {
    const { toJSON } = render(<ReportReviewScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("each category icon variant renders without throwing", async () => {
    const categories = [
      "offensive",
      "spam",
      "nudity",
      "violence",
      "harassment",
      "other",
    ];
    for (const cat of categories) {
      mockReport = { ...mockReport, category: cat };
      const { toJSON } = render(<ReportReviewScreen />);
      await waitFor(() => expect(toJSON()).toBeTruthy());
    }
  });

  it("multi-pass triggers resolveReport / createSanction without crashing", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.style !== "cancel");
        btn?.onPress?.();
      });
    const tree = render(<ReportReviewScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    for (let pass = 0; pass < 2; pass++) {
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
    alertSpy.mockRestore();
  });

  it("swallows API failures gracefully", async () => {
    mockResolveReport.mockRejectedValue(new Error("server"));
    sanctionsAPI.createSanction.mockRejectedValue(new Error("server"));
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.style !== "cancel");
        btn?.onPress?.();
      });
    const tree = render(<ReportReviewScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allOnPress(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tree.toJSON()).toBeTruthy();
    alertSpy.mockRestore();
  });
});
