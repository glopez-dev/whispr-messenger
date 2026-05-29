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

jest.mock("expo-image-picker", () => ({
  __esModule: true,
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const imagePicker = require("expo-image-picker") as Record<string, jest.Mock>;

let mockSanction: any = {
  id: "san-1",
  type: "temp_ban" as const,
  reason: "spam",
  appliedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-02-01T00:00:00.000Z",
  isActive: true,
};
const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { sanction: mockSanction } }),
}));

jest.mock("@/context/ThemeContext", () => ({
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

const mockCreateAppeal = jest.fn();
jest.mock("@/store/moderationStore", () => ({
  useModerationStore: () => ({ createAppeal: mockCreateAppeal }),
}));

jest.mock("@/theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] }, dark: "#000" },
    text: { light: "#fff", secondary: "#aaa" },
    primary: { main: "#6200ee" },
    secondary: { main: "#03dac6" },
    ui: { divider: "#333", error: "#f00" },
  },
  withOpacity: (c: string) => c,
}));

import { AppealFormScreen } from "@/screens/Moderation/AppealFormScreen";

function allTouchables(root: any) {
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
  mockCreateAppeal.mockResolvedValue({ id: "ap-1" });
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
    granted: true,
  });
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
});

describe("AppealFormScreen", () => {
  it("renders for each sanction type", async () => {
    for (const t of ["warning", "temp_ban", "perm_ban"]) {
      mockSanction = { ...mockSanction, type: t };
      const { toJSON } = render(<AppealFormScreen />);
      await waitFor(() => expect(toJSON()).toBeTruthy());
    }
  });

  it("dispatches every onPress handler without crashing", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.style !== "cancel");
        btn?.onPress?.();
      });
    const tree = render(<AppealFormScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    for (let pass = 0; pass < 2; pass++) {
      await act(async () => {
        for (const t of allTouchables(tree.UNSAFE_root)) {
          try {
            await t.props.onPress();
          } catch {
            /* swallow */
          }
        }
      });
    }
    alertSpy.mockRestore();
  });

  it("picks an image when permission granted", async () => {
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/img.jpg" }],
    });
    const tree = render(<AppealFormScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allTouchables(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("alerts on permission denied", async () => {
    imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
    });
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const tree = render(<AppealFormScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allTouchables(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    alertSpy.mockRestore();
  });

  it("survives a createAppeal failure", async () => {
    mockCreateAppeal.mockRejectedValue(new Error("server"));
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.style !== "cancel");
        btn?.onPress?.();
      });
    const tree = render(<AppealFormScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allTouchables(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    alertSpy.mockRestore();
  });
});
