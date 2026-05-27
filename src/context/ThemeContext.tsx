/**
 * ThemeContext - Global Theme, Language, and Font Size Management
 * Provides centralized theme, language, and font size management across the app
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
  useCallback,
} from "react";
import { AppState, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { colors } from "../theme/colors";
import { detectImageFormatFromUri } from "../utils/imageCompression";
import { TokenService } from "../services/TokenService";
import { MediaService } from "../services/MediaService";
import {
  UserService,
  type UserProfile,
  type UserVisualPreferences,
} from "../services/UserService";
import { getApiBaseUrl } from "../services/apiBase";
import { localizeText } from "../i18n/strings";

// Types
export type Theme = "light" | "dark" | "auto";
export type Language = "fr" | "en";
export type FontSize = "small" | "medium" | "large";
export type BackgroundPreset =
  | "whispr"
  | "midnight"
  | "sunset"
  | "aurora"
  | "custom";

type BackgroundGradient = readonly [string, string, string];

export interface GlobalSettings {
  theme: Theme;
  language: Language;
  fontSize: FontSize;
  backgroundPreset: BackgroundPreset;
  customBackgroundUri?: string | null;
  customBackgroundVersion?: number;
  customBackgroundRemoteMediaId?: string | null;
  customBackgroundRemoteUrl?: string | null;
  remoteSyncUpdatedAt?: string | null;
}

interface ThemeContextType {
  settings: GlobalSettings;
  updateSettings: (
    newSettings: Partial<GlobalSettings>,
    options?: {
      skipRemoteSync?: boolean;
      preserveRemoteSyncTimestamp?: boolean;
    },
  ) => Promise<void>;
  saveCustomBackground: (sourceUri: string) => Promise<void>;
  clearCustomBackground: () => Promise<void>;
  getThemeColors: () => ThemeColors;
  getFontSize: (
    size: "xs" | "sm" | "base" | "lg" | "xl" | "xxl" | "xxxl",
  ) => number;
  getLocalizedText: (key: string) => string;
}

interface ThemeColors {
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    gradient: readonly [string, string, ...string[]];
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  primary: string;
  secondary: string;
  error: string;
  success: string;
  warning: string;
  info: string;
}

const STORAGE_KEY = "whispr.globalSettings.v1";
const VISUAL_CACHE_KEY = "whispr.globalSettings.visual-cache.v1";
const REMOTE_VISUAL_SYNC_DEBOUNCE_MS = 750;
const REMOTE_VISUAL_POLL_INTERVAL_MS = 60_000;
const REMOTE_VISUAL_FETCH_MIN_INTERVAL_MS = 15_000;

export const BACKGROUND_PRESET_GRADIENTS: Record<
  BackgroundPreset,
  BackgroundGradient
> = {
  whispr: ["#0B1124", "#3C2E7C", "#FE7A5C"],
  midnight: ["#050816", "#172554", "#312E81"],
  sunset: ["#1A102C", "#7C2D12", "#FE7A5C"],
  aurora: ["#06141F", "#0F766E", "#6774BD"],
  custom: [
    "rgba(6, 12, 24, 0.22)",
    "rgba(34, 28, 62, 0.14)",
    "rgba(254, 122, 92, 0.1)",
  ],
};

const CUSTOM_BACKGROUND_DIR = "whispr-backgrounds";
const CUSTOM_BACKGROUND_BASENAME = "current-background";
const CUSTOM_BACKGROUND_VARIANTS = [
  "jpg",
  "gif",
  "png",
  "webp",
  "heic",
  "heif",
];

function isBackgroundPreset(value: unknown): value is BackgroundPreset {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BACKGROUND_PRESET_GRADIENTS, value)
  );
}

function normalizeSettings(
  stored: Partial<GlobalSettings> | null | undefined,
): GlobalSettings {
  const backgroundPreset = isBackgroundPreset(stored?.backgroundPreset)
    ? stored.backgroundPreset
    : defaultSettings.backgroundPreset;
  const customBackgroundUri =
    typeof stored?.customBackgroundUri === "string"
      ? stored.customBackgroundUri
      : null;
  const customBackgroundVersion =
    typeof stored?.customBackgroundVersion === "number"
      ? stored.customBackgroundVersion
      : 0;
  const remoteSyncUpdatedAt =
    typeof stored?.remoteSyncUpdatedAt === "string"
      ? stored.remoteSyncUpdatedAt
      : null;

  return {
    ...defaultSettings,
    ...(stored ?? {}),
    backgroundPreset:
      backgroundPreset === "custom" && !customBackgroundUri
        ? defaultSettings.backgroundPreset
        : backgroundPreset,
    customBackgroundUri,
    customBackgroundVersion,
    customBackgroundRemoteMediaId:
      typeof stored?.customBackgroundRemoteMediaId === "string"
        ? stored.customBackgroundRemoteMediaId
        : null,
    customBackgroundRemoteUrl:
      typeof stored?.customBackgroundRemoteUrl === "string"
        ? stored.customBackgroundRemoteUrl
        : null,
    remoteSyncUpdatedAt,
  };
}

function shouldPersistVisualCache(settings: GlobalSettings) {
  return (
    settings.theme !== defaultSettings.theme ||
    settings.backgroundPreset !== defaultSettings.backgroundPreset ||
    !!settings.customBackgroundUri
  );
}

function buildVisualCachePayload(
  settings: GlobalSettings,
): Partial<GlobalSettings> {
  return {
    theme: settings.theme,
    backgroundPreset: settings.backgroundPreset,
    customBackgroundUri: settings.customBackgroundUri ?? null,
    customBackgroundVersion: settings.customBackgroundVersion ?? 0,
    customBackgroundRemoteMediaId:
      settings.customBackgroundRemoteMediaId ?? null,
    customBackgroundRemoteUrl: settings.customBackgroundRemoteUrl ?? null,
    remoteSyncUpdatedAt: settings.remoteSyncUpdatedAt ?? null,
  };
}

export function shouldSyncVisualPreferences(
  settings: GlobalSettings,
  updates: Partial<GlobalSettings>,
) {
  const touchesVisualPreference =
    updates.theme !== undefined ||
    updates.language !== undefined ||
    updates.fontSize !== undefined ||
    updates.backgroundPreset !== undefined;

  if (!touchesVisualPreference) {
    return false;
  }

  if (
    settings.backgroundPreset === "custom" &&
    !settings.customBackgroundRemoteMediaId &&
    !settings.customBackgroundRemoteUrl
  ) {
    return false;
  }

  return true;
}

async function persistSettingsCaches(settings: GlobalSettings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  if (shouldPersistVisualCache(settings)) {
    await AsyncStorage.setItem(
      VISUAL_CACHE_KEY,
      JSON.stringify(buildVisualCachePayload(settings)),
    );
    return;
  }
  await AsyncStorage.removeItem(VISUAL_CACHE_KEY).catch(() => {});
}

function applyRuntimeBackgroundGradient(gradient: BackgroundGradient) {
  const appGradient = colors.background.gradient.app as unknown as string[];
  const authGradient = colors.background.gradient.auth as unknown as string[];
  appGradient.splice(0, appGradient.length, ...gradient);
  authGradient.splice(0, authGradient.length, ...gradient);
}

function getCustomBackgroundTargetUri(extension = "jpg") {
  const root = FileSystem.documentDirectory as string | undefined;
  if (!root) {
    throw new Error("No persistent file-system directory available");
  }
  return `${root}${CUSTOM_BACKGROUND_DIR}/${CUSTOM_BACKGROUND_BASENAME}.${extension}`;
}

async function deleteAllCustomBackgroundVariants() {
  await Promise.all(
    CUSTOM_BACKGROUND_VARIANTS.map((ext) =>
      FileSystem.deleteAsync(getCustomBackgroundTargetUri(ext), {
        idempotent: true,
      }).catch(() => {}),
    ),
  );
}

async function findExistingCustomBackgroundUri(): Promise<string | null> {
  for (const ext of CUSTOM_BACKGROUND_VARIANTS) {
    const candidate = getCustomBackgroundTargetUri(ext);
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (info.exists) return candidate;
    } catch {
      // Ignore a single variant probe and keep scanning the others.
    }
  }
  return null;
}

async function resolvePersistedSettings(
  rawSettings: Partial<GlobalSettings> | null | undefined,
): Promise<GlobalSettings> {
  const normalized = normalizeSettings(rawSettings);
  if (normalized.backgroundPreset !== "custom") {
    return normalized;
  }

  const targetUri = normalized.customBackgroundUri;
  if (!targetUri) {
    const fallbackUri = await findExistingCustomBackgroundUri();
    if (fallbackUri) {
      return {
        ...normalized,
        backgroundPreset: "custom",
        customBackgroundUri: fallbackUri,
      };
    }
    return {
      ...normalized,
      backgroundPreset: defaultSettings.backgroundPreset,
      customBackgroundUri: null,
      customBackgroundVersion: 0,
      customBackgroundRemoteMediaId: normalized.customBackgroundRemoteMediaId,
      customBackgroundRemoteUrl: normalized.customBackgroundRemoteUrl,
    };
  }
  try {
    const info = await FileSystem.getInfoAsync(targetUri);
    if (info.exists) {
      return {
        ...normalized,
        customBackgroundUri: targetUri,
      };
    }
  } catch (error) {
    console.warn("Failed to inspect persisted custom background", error);
  }

  const fallbackUri = await findExistingCustomBackgroundUri();
  if (fallbackUri) {
    return {
      ...normalized,
      backgroundPreset: "custom",
      customBackgroundUri: fallbackUri,
    };
  }

  return {
    ...normalized,
    backgroundPreset: defaultSettings.backgroundPreset,
    customBackgroundUri: null,
    customBackgroundVersion: 0,
    customBackgroundRemoteMediaId: normalized.customBackgroundRemoteMediaId,
    customBackgroundRemoteUrl: normalized.customBackgroundRemoteUrl,
  };
}

function getFileMimeType(uri: string) {
  const format = detectImageFormatFromUri(uri);
  switch (format) {
    case "gif":
      return "image/gif";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

function buildRemoteBackgroundBlobUrl(mediaId: string) {
  return `${getApiBaseUrl()}/media/v1/${encodeURIComponent(mediaId)}/blob`;
}

function sanitizeRemoteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const wrappers: Array<[string, string]> = [
    ["`", "`"],
    ['"', '"'],
    ["'", "'"],
  ];
  for (const [start, end] of wrappers) {
    if (
      trimmed.startsWith(start) &&
      trimmed.endsWith(end) &&
      trimmed.length > 2
    )
      return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function ensureMediaServiceStreamUrl(value: string): string {
  if (!value.includes("/media/v1/")) return value;
  if (!value.includes("/blob") && !value.includes("/thumbnail")) return value;
  if (/([?&])stream=1(&|$)/.test(value)) return value;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}stream=1`;
}

async function downloadRemoteBackgroundToLocal(
  mediaId: string | null | undefined,
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  const cleanedRemoteUrl = sanitizeRemoteUrl(remoteUrl);
  const sourceUrlRaw =
    cleanedRemoteUrl ||
    (mediaId ? buildRemoteBackgroundBlobUrl(mediaId) : null);
  const sourceUrl = sourceUrlRaw
    ? ensureMediaServiceStreamUrl(sourceUrlRaw)
    : null;
  mediaId ? buildRemoteBackgroundBlobUrl(mediaId) : null;
  if (!sourceUrl) return null;

  const extension = mediaId ? "jpg" : "jpg";
  const targetUri = getCustomBackgroundTargetUri(extension);
  const tmpUri = `${targetUri}.tmp`;
  const token = await TokenService.getAccessToken().catch(() => null);
  const targetDir = targetUri.slice(0, targetUri.lastIndexOf("/"));

  await FileSystem.makeDirectoryAsync(targetDir, {
    intermediates: true,
  }).catch(() => {});

  try {
    await FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
    await FileSystem.downloadAsync(sourceUrl, tmpUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    await deleteAllCustomBackgroundVariants();
    await FileSystem.moveAsync({ from: tmpUri, to: targetUri });
    return targetUri;
  } catch (error) {
    await FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
    console.warn(
      "Failed to restore custom background from remote media",
      error,
    );
    return null;
  }
}

function parseVisualTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildVisualPreferencesPayload(
  settings: GlobalSettings,
): UserVisualPreferences {
  const hasRemoteCustomBackground =
    settings.backgroundPreset === "custom" &&
    !!(
      settings.customBackgroundRemoteMediaId ||
      settings.customBackgroundRemoteUrl
    );

  return {
    theme: settings.theme,
    language: settings.language,
    fontSize: settings.fontSize,
    backgroundPreset: settings.backgroundPreset,
    backgroundMediaId: hasRemoteCustomBackground
      ? (settings.customBackgroundRemoteMediaId ?? null)
      : null,
    backgroundMediaUrl: hasRemoteCustomBackground
      ? (settings.customBackgroundRemoteUrl ?? null)
      : null,
    updatedAt: settings.remoteSyncUpdatedAt ?? null,
  };
}

export function extractProfileVisualPreferences(
  profile: UserProfile | null | undefined,
): UserVisualPreferences | null {
  if (!profile) return null;
  const visual = profile.visualPreferences;
  if (visual && Object.keys(visual).length > 0) {
    return {
      theme: visual.theme,
      language: visual.language,
      fontSize: visual.fontSize,
      backgroundPreset: visual.backgroundPreset,
      backgroundMediaId:
        typeof visual.backgroundMediaId === "string"
          ? visual.backgroundMediaId
          : visual.backgroundMediaId === null
            ? null
            : undefined,
      backgroundMediaUrl:
        typeof visual.backgroundMediaUrl === "string"
          ? visual.backgroundMediaUrl
          : visual.backgroundMediaUrl === null
            ? null
            : undefined,
      updatedAt:
        typeof visual.updatedAt === "string"
          ? visual.updatedAt
          : visual.updatedAt === null
            ? null
            : undefined,
    };
  }

  if (!profile.backgroundMediaId && !profile.backgroundMediaUrl) {
    return null;
  }

  return {
    backgroundPreset: "custom",
    backgroundMediaId: profile.backgroundMediaId ?? null,
    backgroundMediaUrl: profile.backgroundMediaUrl ?? null,
    updatedAt: profile.updatedAt ?? null,
  };
}

export function shouldApplyRemoteVisualPreferences(
  current: GlobalSettings,
  remote: UserVisualPreferences | null | undefined,
) {
  if (!remote) return false;
  const remoteUpdatedAt = parseVisualTimestamp(remote.updatedAt);
  const localUpdatedAt = parseVisualTimestamp(current.remoteSyncUpdatedAt);

  if (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt) {
    return true;
  }

  if (!localUpdatedAt) {
    return Boolean(
      remote.theme ||
      remote.language ||
      remote.fontSize ||
      remote.backgroundPreset ||
      remote.backgroundMediaId ||
      remote.backgroundMediaUrl,
    );
  }

  return false;
}

async function hydrateRemoteVisualPreferences(
  current: GlobalSettings,
  profile?: UserProfile | null,
): Promise<GlobalSettings> {
  const remoteVisualPreferences = extractProfileVisualPreferences(
    profile ?? null,
  ) ?? {
    backgroundPreset:
      current.customBackgroundRemoteMediaId || current.customBackgroundRemoteUrl
        ? "custom"
        : undefined,
    backgroundMediaId: current.customBackgroundRemoteMediaId ?? null,
    backgroundMediaUrl: current.customBackgroundRemoteUrl ?? null,
    updatedAt: current.remoteSyncUpdatedAt ?? null,
  };
  const remoteMediaId =
    remoteVisualPreferences.backgroundMediaId ??
    current.customBackgroundRemoteMediaId;
  const remoteUrl =
    remoteVisualPreferences.backgroundMediaUrl ??
    current.customBackgroundRemoteUrl;

  if (current.backgroundPreset === "custom" && current.customBackgroundUri) {
    try {
      const info = await FileSystem.getInfoAsync(current.customBackgroundUri);
      if (info.exists) {
        return {
          ...current,
          backgroundPreset: "custom",
          customBackgroundRemoteMediaId: remoteMediaId ?? null,
          customBackgroundRemoteUrl: remoteUrl ?? null,
          remoteSyncUpdatedAt:
            remoteVisualPreferences.updatedAt ??
            current.remoteSyncUpdatedAt ??
            null,
        };
      }
    } catch {
      // fall through
    }
  }

  if (remoteMediaId || remoteUrl) {
    const restoredUri = await downloadRemoteBackgroundToLocal(
      remoteMediaId,
      remoteUrl,
    );
    if (restoredUri) {
      return {
        ...current,
        backgroundPreset: "custom",
        customBackgroundUri: restoredUri,
        customBackgroundVersion: Date.now(),
        customBackgroundRemoteMediaId: remoteMediaId ?? null,
        customBackgroundRemoteUrl: remoteUrl ?? null,
        remoteSyncUpdatedAt:
          remoteVisualPreferences.updatedAt ??
          current.remoteSyncUpdatedAt ??
          null,
      };
    }
  }

  return {
    ...current,
    customBackgroundRemoteMediaId: remoteMediaId ?? null,
    customBackgroundRemoteUrl: remoteUrl ?? null,
    remoteSyncUpdatedAt:
      remoteVisualPreferences.updatedAt ?? current.remoteSyncUpdatedAt ?? null,
  };
}

async function mergeRemoteVisualPreferencesIntoSettings(
  current: GlobalSettings,
  remote: UserVisualPreferences,
): Promise<GlobalSettings> {
  const nextBase: GlobalSettings = normalizeSettings({
    ...current,
    theme: remote.theme ?? current.theme,
    language: remote.language ?? current.language,
    fontSize: remote.fontSize ?? current.fontSize,
    backgroundPreset:
      remote.backgroundPreset ??
      (remote.backgroundMediaId || remote.backgroundMediaUrl
        ? "custom"
        : current.backgroundPreset),
    customBackgroundRemoteMediaId:
      remote.backgroundMediaId ?? current.customBackgroundRemoteMediaId ?? null,
    customBackgroundRemoteUrl:
      remote.backgroundMediaUrl ?? current.customBackgroundRemoteUrl ?? null,
    remoteSyncUpdatedAt:
      remote.updatedAt ?? current.remoteSyncUpdatedAt ?? null,
  });

  if (
    (remote.backgroundPreset &&
      remote.backgroundPreset !== "custom" &&
      remote.backgroundPreset !== current.backgroundPreset) ||
    (remote.backgroundPreset &&
      remote.backgroundPreset !== "custom" &&
      current.backgroundPreset === "custom")
  ) {
    return {
      ...nextBase,
      customBackgroundUri: null,
      customBackgroundVersion: 0,
      customBackgroundRemoteMediaId: null,
      customBackgroundRemoteUrl: null,
    };
  }

  if (
    nextBase.backgroundPreset === "custom" ||
    remote.backgroundMediaId ||
    remote.backgroundMediaUrl
  ) {
    return hydrateRemoteVisualPreferences(nextBase);
  }

  return nextBase;
}

async function hydrateRemoteBackgroundFallback(
  current: GlobalSettings,
): Promise<GlobalSettings> {
  const token = await TokenService.getAccessToken().catch(() => null);
  if (!token) {
    return current;
  }

  try {
    const result = await UserService.getInstance().getProfile();
    if (!result.success || !result.profile) {
      return current;
    }

    const remoteVisualPreferences = extractProfileVisualPreferences(
      result.profile,
    );
    if (!shouldApplyRemoteVisualPreferences(current, remoteVisualPreferences)) {
      return current;
    }

    return mergeRemoteVisualPreferencesIntoSettings(
      current,
      remoteVisualPreferences as UserVisualPreferences,
    );
  } catch (error) {
    console.warn("Failed to hydrate visual preferences from backend", error);
    return current;
  }
}

// Default settings
const defaultSettings: GlobalSettings = {
  theme: "dark",
  language: "fr",
  fontSize: "medium",
  backgroundPreset: "whispr",
  customBackgroundUri: null,
  customBackgroundVersion: 0,
  customBackgroundRemoteMediaId: null,
  customBackgroundRemoteUrl: null,
  remoteSyncUpdatedAt: null,
};

// Theme color palettes
const lightThemeColors: ThemeColors = {
  background: {
    primary: "#FFFFFF",
    secondary: "#F6F6F6",
    tertiary: "#ABABAB",
    gradient: ["#FFFFFF", "#F6F6F6"] as const,
  },
  text: {
    primary: "#000000",
    secondary: "#545458",
    tertiary: "#767680",
  },
  primary: "#FE7A5C",
  secondary: "#6774BD",
  error: "#FF3B30",
  success: "#21C004",
  warning: "#F04882",
  info: "#6774BD",
};

const darkThemeColors: ThemeColors = {
  background: {
    primary: "#0B1124", // Dark navy from gradient
    secondary: "#1A1F3A", // Dark card color
    tertiary: "#212135", // Dark tertiary
    gradient: ["#0B1124", "#3C2E7C", "#FE7A5C"] as const,
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#ABABAB",
    tertiary: "#8E8E93",
  },
  primary: "#FE7A5C",
  secondary: "#6774BD",
  error: "#FF3B30",
  success: "#21C004",
  warning: "#F04882",
  info: "#6774BD",
};

// Font size multipliers
const fontSizeMultipliers: Record<FontSize, number> = {
  small: 0.9,
  medium: 1.0,
  large: 1.1,
};

// Base font sizes
const baseFontSizes = {
  xs: 10,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// WHISPR-1072: exported so the resolution logic can be covered by unit tests
// without mounting a full React Native renderer (useColorScheme needs the
// native event loop, which the Jest RN preset flakes on).
export const resolveThemeColors = (
  theme: Theme,
  systemColorScheme: "light" | "dark" | null | undefined,
): ThemeColors => {
  if (theme === "light") return lightThemeColors;
  if (theme === "dark") return darkThemeColors;
  // theme === "auto"
  return systemColorScheme === "light" ? lightThemeColors : darkThemeColors;
};

// Context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings);
  const settingsRef = useRef<GlobalSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const pendingRemoteVisualSyncRef = useRef<GlobalSettings | null>(null);
  const remoteVisualSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastRemoteVisualFetchAtRef = useRef(0);
  // WHISPR-1072: watch the OS-level color scheme so "auto" actually follows
  // the system preference instead of silently defaulting to dark.
  const systemColorScheme = useColorScheme();

  const applySettingsLocally = useCallback(
    async (nextSettings: GlobalSettings) => {
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      applyRuntimeBackgroundGradient(
        BACKGROUND_PRESET_GRADIENTS[nextSettings.backgroundPreset],
      );
      await persistSettingsCaches(nextSettings);
    },
    [],
  );

  const flushPendingRemoteVisualSync = useCallback(async () => {
    const pendingSettings = pendingRemoteVisualSyncRef.current;
    if (!pendingSettings) {
      return;
    }

    const token = await TokenService.getAccessToken().catch(() => null);
    if (!token) {
      return;
    }

    pendingRemoteVisualSyncRef.current = null;

    try {
      const response = await UserService.getInstance().updateVisualPreferences(
        buildVisualPreferencesPayload(pendingSettings),
      );

      if (!response.success) {
        pendingRemoteVisualSyncRef.current = pendingSettings;
        return;
      }

      const remoteVisualPreferences = extractProfileVisualPreferences(
        response.profile,
      );
      if (!remoteVisualPreferences) {
        return;
      }

      const merged = await mergeRemoteVisualPreferencesIntoSettings(
        settingsRef.current,
        remoteVisualPreferences,
      );
      await applySettingsLocally(merged);
    } catch (error) {
      pendingRemoteVisualSyncRef.current = pendingSettings;
      console.warn("Failed to sync visual preferences to backend", error);
    }
  }, [applySettingsLocally]);

  const scheduleRemoteVisualSync = useCallback(
    (nextSettings: GlobalSettings) => {
      pendingRemoteVisualSyncRef.current = nextSettings;
      if (remoteVisualSyncTimerRef.current) {
        clearTimeout(remoteVisualSyncTimerRef.current);
      }

      remoteVisualSyncTimerRef.current = setTimeout(() => {
        remoteVisualSyncTimerRef.current = null;
        flushPendingRemoteVisualSync().catch(() => {});
      }, REMOTE_VISUAL_SYNC_DEBOUNCE_MS);
    },
    [flushPendingRemoteVisualSync],
  );

  const syncRemoteVisualPreferences = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (
        !force &&
        now - lastRemoteVisualFetchAtRef.current <
          REMOTE_VISUAL_FETCH_MIN_INTERVAL_MS
      ) {
        return;
      }

      lastRemoteVisualFetchAtRef.current = now;

      const token = await TokenService.getAccessToken().catch(() => null);
      if (!token) {
        return;
      }

      try {
        const result = await UserService.getInstance().getProfile();
        if (!result.success || !result.profile) {
          return;
        }

        const remoteVisualPreferences = extractProfileVisualPreferences(
          result.profile,
        );
        if (
          !shouldApplyRemoteVisualPreferences(
            settingsRef.current,
            remoteVisualPreferences,
          )
        ) {
          return;
        }

        const merged = await mergeRemoteVisualPreferencesIntoSettings(
          settingsRef.current,
          remoteVisualPreferences as UserVisualPreferences,
        );
        await applySettingsLocally(merged);
      } catch (error) {
        console.warn("Failed to fetch remote visual preferences", error);
      }
    },
    [applySettingsLocally],
  );

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [[, visualCached], [, stored]] = await AsyncStorage.multiGet([
          VISUAL_CACHE_KEY,
          STORAGE_KEY,
        ]);
        const preferredSnapshot = visualCached || stored;
        if (preferredSnapshot) {
          let parsed = await resolvePersistedSettings(
            JSON.parse(preferredSnapshot) as Partial<GlobalSettings>,
          );
          parsed = await hydrateRemoteBackgroundFallback(parsed);
          applyRuntimeBackgroundGradient(
            BACKGROUND_PRESET_GRADIENTS[parsed.backgroundPreset],
          );
          await applySettingsLocally(parsed);
        } else {
          const hydrated =
            await hydrateRemoteBackgroundFallback(defaultSettings);
          applyRuntimeBackgroundGradient(
            BACKGROUND_PRESET_GRADIENTS[hydrated.backgroundPreset],
          );
          await applySettingsLocally(hydrated);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
        applyRuntimeBackgroundGradient(
          BACKGROUND_PRESET_GRADIENTS[defaultSettings.backgroundPreset],
        );
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, [applySettingsLocally]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const syncActiveDevice = async (force = false) => {
      await flushPendingRemoteVisualSync();
      await syncRemoteVisualPreferences(force);
    };

    syncActiveDevice(true).catch(() => {});

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncActiveDevice(true).catch(() => {});
      }
    });

    const pollId = setInterval(() => {
      if (AppState.currentState === "active") {
        syncActiveDevice(false).catch(() => {});
      }
    }, REMOTE_VISUAL_POLL_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(pollId);
    };
  }, [flushPendingRemoteVisualSync, isLoaded, syncRemoteVisualPreferences]);

  useEffect(() => {
    return () => {
      if (remoteVisualSyncTimerRef.current) {
        clearTimeout(remoteVisualSyncTimerRef.current);
      }
    };
  }, []);

  // Update settings
  const updateSettings = useCallback(
    async (
      newSettings: Partial<GlobalSettings>,
      options?: {
        skipRemoteSync?: boolean;
        preserveRemoteSyncTimestamp?: boolean;
      },
    ) => {
      const baseUpdated = normalizeSettings({
        ...settingsRef.current,
        ...newSettings,
      });
      const shouldQueueRemoteSync =
        !options?.skipRemoteSync &&
        shouldSyncVisualPreferences(baseUpdated, newSettings);
      const updated = shouldQueueRemoteSync
        ? {
            ...baseUpdated,
            remoteSyncUpdatedAt:
              options?.preserveRemoteSyncTimestamp &&
              baseUpdated.remoteSyncUpdatedAt
                ? baseUpdated.remoteSyncUpdatedAt
                : new Date().toISOString(),
          }
        : baseUpdated;

      try {
        await applySettingsLocally(updated);
        if (shouldQueueRemoteSync) {
          scheduleRemoteVisualSync(updated);
        }
      } catch (error) {
        console.error("Error saving settings:", error);
      }
    },
    [applySettingsLocally, scheduleRemoteVisualSync],
  );

  const saveCustomBackground = async (sourceUri: string) => {
    const format = detectImageFormatFromUri(sourceUri);
    const preserveAnimatedGif = format === "gif";
    const targetUri = getCustomBackgroundTargetUri(
      preserveAnimatedGif ? "gif" : "jpg",
    );
    const targetDir = targetUri.slice(0, targetUri.lastIndexOf("/"));

    await FileSystem.makeDirectoryAsync(targetDir, {
      intermediates: true,
    }).catch(() => {});
    await deleteAllCustomBackgroundVariants();

    let renderedUri = sourceUri;
    if (!preserveAnimatedGif) {
      const rendered = await ImageManipulator.manipulateAsync(sourceUri, [], {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      renderedUri = rendered.uri;
    }

    await FileSystem.copyAsync({
      from: renderedUri,
      to: targetUri,
    });
    if (renderedUri !== sourceUri) {
      await FileSystem.deleteAsync(renderedUri, {
        idempotent: true,
      }).catch(() => {});
    }

    await updateSettings(
      {
        backgroundPreset: "custom",
        customBackgroundUri: targetUri,
        customBackgroundVersion: Date.now(),
        remoteSyncUpdatedAt: new Date().toISOString(),
      },
      { skipRemoteSync: true },
    );

    try {
      const tokenPayload = TokenService.decodeAccessToken(
        (await TokenService.getAccessToken()) || "",
      );
      const ownerId = tokenPayload?.sub;
      if (!ownerId) return;

      const fileName =
        sourceUri.split("/").pop() ||
        `background.${preserveAnimatedGif ? "gif" : "jpg"}`;
      const uploadResult = await MediaService.uploadMedia(
        {
          uri: targetUri,
          name: fileName,
          type: getFileMimeType(targetUri),
        },
        undefined,
        {
          context: "message",
          ownerId,
        },
      );

      const remoteSettings: Partial<GlobalSettings> = {
        customBackgroundRemoteMediaId: uploadResult.id,
        customBackgroundRemoteUrl: uploadResult.url ?? null,
      };

      await updateSettings(remoteSettings, { skipRemoteSync: true });

      const response = await UserService.getInstance().updateProfileBackground(
        uploadResult.id,
        uploadResult.url ?? null,
      );
      const remoteVisualPreferences = extractProfileVisualPreferences(
        response.profile,
      );
      if (response.success && remoteVisualPreferences) {
        const merged = await mergeRemoteVisualPreferencesIntoSettings(
          settingsRef.current,
          remoteVisualPreferences,
        );
        await applySettingsLocally(merged);
      }
    } catch (error) {
      console.warn("Failed to sync custom background to backend", error);
    }
  };

  const clearCustomBackground = async () => {
    await deleteAllCustomBackgroundVariants();

    await updateSettings(
      {
        backgroundPreset: defaultSettings.backgroundPreset,
        customBackgroundUri: null,
        customBackgroundVersion: 0,
        customBackgroundRemoteMediaId: null,
        customBackgroundRemoteUrl: null,
      },
      { skipRemoteSync: true },
    );

    const response = await UserService.getInstance().updateProfileBackground(
      null,
      null,
    );
    const remoteVisualPreferences = extractProfileVisualPreferences(
      response.profile,
    );
    if (response.success && remoteVisualPreferences) {
      const merged = await mergeRemoteVisualPreferencesIntoSettings(
        settingsRef.current,
        remoteVisualPreferences,
      );
      await applySettingsLocally(merged);
    }
  };

  // Get theme colors based on current theme (delegates to the pure helper
  // so the resolution logic can be unit-tested without mounting RN).
  const getThemeColors = (): ThemeColors => {
    const resolved = resolveThemeColors(settings.theme, systemColorScheme);
    return {
      ...resolved,
      background: {
        ...resolved.background,
        gradient: BACKGROUND_PRESET_GRADIENTS[settings.backgroundPreset],
      },
    };
  };

  // Get font size with multiplier
  const getFontSize = (
    size: "xs" | "sm" | "base" | "lg" | "xl" | "xxl" | "xxxl",
  ): number => {
    const base = baseFontSizes[size];
    const multiplier = fontSizeMultipliers[settings.fontSize];
    return base * multiplier;
  };

  // Get localized text
  const getLocalizedText = (key: string): string => {
    return localizeText(settings.language, key);
  };

  const value: ThemeContextType = {
    settings,
    updateSettings,
    saveCustomBackground,
    clearCustomBackground,
    getThemeColors,
    getFontSize,
    getLocalizedText,
  };

  if (!isLoaded) {
    return null; // Or a loading screen
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

// Hook
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
