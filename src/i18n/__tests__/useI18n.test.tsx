/**
 * useI18n consumes the real ThemeProvider — the hook reads
 * settings.language from useTheme(). We mock just enough of the
 * provider's external dependencies (storage, file system, native
 * services) for it to mount without side-effects.
 */

jest.mock("@react-native-async-storage/async-storage", () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    clear: jest.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
});

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "/tmp/",
  cacheDirectory: "/tmp/cache/",
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest
    .fn()
    .mockResolvedValue({ status: 200, uri: "/tmp/x.jpg" }),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: "/tmp/x.jpg" }),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));
jest.mock("@/utils/imageCompression", () => ({
  detectImageFormatFromUri: jest.fn(() => "jpg"),
}));
jest.mock("@/services/UserService", () => ({
  UserService: {
    getInstance: () => ({
      getProfile: jest.fn(),
      updateVisualPreferences: jest.fn(),
    }),
  },
}));
jest.mock("@/services/MediaService", () => ({
  MediaService: { uploadMedia: jest.fn() },
}));
jest.mock("@/services/TokenService", () => ({
  TokenService: {
    getAccessToken: jest.fn().mockResolvedValue("at"),
  },
}));
jest.mock("@/services/apiBase", () => ({
  getApiBaseUrl: () => "https://api.test",
}));

import React from "react";
import { Text } from "react-native";
import { render, waitFor, act } from "@testing-library/react-native";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/i18n/useI18n";

const Probe: React.FC = () => {
  const { language, t } = useI18n();
  return (
    <Text testID="probe">
      {language}|{t("common.cancel")}|{t("does.not.exist")}
    </Text>
  );
};

describe("useI18n", () => {
  it("exposes the current language and translates keys via the strings table", async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId("probe").props.children).toEqual([
        "fr",
        "|",
        "Annuler",
        "|",
        "does.not.exist",
      ]);
    });
  });

  it("re-renders translations when the language changes", async () => {
    const LanguageSwitcher: React.FC = () => {
      const { settings, updateSettings } = useTheme();
      const { t, language } = useI18n();
      return (
        <>
          <Text testID="i18n-language">{language}</Text>
          <Text testID="i18n-text">{t("common.cancel")}</Text>
          <Text
            testID="switch"
            onPress={() =>
              updateSettings({
                language: settings.language === "fr" ? "en" : "fr",
              })
            }
          />
        </>
      );
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <LanguageSwitcher />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(getByTestId("i18n-text").props.children).toBe("Annuler");
    });
    await act(async () => {
      getByTestId("switch").props.onPress();
    });
    await waitFor(() => {
      expect(getByTestId("i18n-text").props.children).toBe("Cancel");
      expect(getByTestId("i18n-language").props.children).toBe("en");
    });
  });
});
