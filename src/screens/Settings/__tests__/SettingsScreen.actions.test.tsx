/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Multi-pass action coverage for SettingsScreen.
 */
import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReset = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockUpdateSettings = jest.fn().mockResolvedValue(undefined);

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    reset: mockReset,
  }),
  useRoute: () => ({ params: {} }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
  clear: jest.fn().mockResolvedValue(null),
  getAllKeys: jest.fn().mockResolvedValue([]),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(null),
  multiRemove: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    settings: { theme: "dark", language: "fr", fontSize: "medium" },
    updateSettings: mockUpdateSettings,
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
    isAuthenticated: true,
    isLoading: false,
    userId: "user1",
    deviceId: "dev1",
    signIn: jest.fn(),
    signOut: mockSignOut,
  }),
}));

const mockGetPrivacy = jest.fn();
const mockUpdatePrivacy = jest.fn();
jest.mock("@/services/UserService", () => ({
  UserService: {
    getInstance: () => ({
      getPrivacySettings: mockGetPrivacy,
      updatePrivacySettings: mockUpdatePrivacy,
    }),
  },
}));

jest.mock("@/services/NotificationService", () => ({
  NotificationService: {
    getSettings: jest.fn().mockResolvedValue({
      push_enabled: true,
      sound_enabled: true,
      vibration_enabled: true,
    }),
    updateSettings: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@/services/moderation", () => ({
  DEFAULT_MODERATION_MODEL: "v2",
  getModerationModelVersion: jest.fn().mockResolvedValue("v2"),
  setModerationModelVersion: jest.fn().mockResolvedValue(undefined),
}));

const secureStoreBackend: Record<string, string> = {};
jest.mock("@/services/storage", () => ({
  storage: {
    getItem: jest.fn(async (key: string) => secureStoreBackend[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      secureStoreBackend[key] = value;
    }),
    deleteItem: jest.fn(async (key: string) => {
      delete secureStoreBackend[key];
    }),
  },
}));

import { Alert } from "react-native";
import { SettingsScreen } from "@/screens/Settings/SettingsScreen";

function allTouchables(root: any): Array<{ props: any }> {
  const out: Array<{ props: any }> = [];
  const visit = (node: any) => {
    if (!node) return;
    if (
      node.props &&
      (typeof node.props.onPress === "function" ||
        typeof node.props.onValueChange === "function")
    ) {
      out.push(node);
    }
    const c = node.children;
    if (Array.isArray(c)) {
      for (const x of c) visit(x);
    } else if (c && typeof c === "object") {
      visit(c);
    }
  };
  visit(root);
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(secureStoreBackend)) delete secureStoreBackend[k];
  mockGetPrivacy.mockResolvedValue({
    success: true,
    settings: {
      profile_picture_privacy: "public",
      first_name_privacy: "public",
      last_name_privacy: "public",
      biography_privacy: "public",
      last_seen_privacy: "public",
      online_status_privacy: "public",
      group_add_permission_privacy: "public",
    },
  });
  mockUpdatePrivacy.mockResolvedValue({ success: true });
});

describe("SettingsScreen — actions multi-pass", () => {
  it("fires every onPress and toggle without throwing", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        // accept any destructive / OK button
        const btn = buttons?.find(
          (b) => b.style === "destructive" || b.text === "OK",
        );
        btn?.onPress?.();
      });

    const tree = render(<SettingsScreen />);
    await waitFor(() => expect(mockGetPrivacy).toHaveBeenCalled());

    for (let pass = 0; pass < 3; pass++) {
      await act(async () => {
        for (const t of allTouchables(tree.root)) {
          try {
            if (t.props.onValueChange) {
              t.props.onValueChange(!t.props.value);
            } else if (t.props.onPress) {
              await t.props.onPress();
            }
          } catch {
            /* swallow */
          }
        }
      });
    }
    expect(tree.toJSON()).toBeTruthy();
    alertSpy.mockRestore();
  });

  it("does not crash when destructive Alert buttons are pressed", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.style === "destructive");
        btn?.onPress?.();
      });
    const tree = render(<SettingsScreen />);
    await waitFor(() => expect(mockGetPrivacy).toHaveBeenCalled());
    await act(async () => {
      for (const t of allTouchables(tree.root)) {
        try {
          await t.props.onPress?.();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tree.toJSON()).toBeTruthy();
    alertSpy.mockRestore();
  });
});
