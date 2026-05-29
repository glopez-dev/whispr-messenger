import AsyncStorage from "@react-native-async-storage/async-storage";
import { PrivacySettings, UserService } from "@/services/UserService";
import { NotificationSettings } from "@/services/NotificationService";
import { storage as secureStorage } from "@/services/storage";

export const STORAGE_KEYS = {
  privacy: "@whispr_settings_privacy",
  notifications: "@whispr_settings_notifications",
  messaging: "@whispr_settings_messaging",
  app: "@whispr_settings_app",
  security: "whispr_settings_security",
} as const;

/**
 * Persist a settings category. The security category is routed through
 * SecureStore (Keychain iOS / Keystore Android, encrypted vault on web —
 * WHISPR-1359) so the local 2FA / biometric UI flags can not be tampered
 * with by a rooted device or an unencrypted ADB backup. Everything else
 * goes to AsyncStorage. Never throws — logs and swallows.
 */
export async function persistSettingsCategory(
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  try {
    if (key === STORAGE_KEYS.security) {
      await secureStorage.setItem(key, JSON.stringify(value));
      return;
    }
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Error persisting settings:", error);
  }
}

/**
 * Read the security category from SecureStore. If empty, fall back to
 * AsyncStorage to migrate existing users, then purge the legacy key
 * (WHISPR-1359). Returns the raw JSON string or null.
 */
export async function loadSecurityFromStorage(): Promise<string | null> {
  try {
    const secureRaw = await secureStorage.getItem(STORAGE_KEYS.security);
    if (secureRaw !== null) return secureRaw;
    const legacyRaw = await AsyncStorage.getItem(STORAGE_KEYS.security);
    if (legacyRaw === null) return null;
    await secureStorage.setItem(STORAGE_KEYS.security, legacyRaw);
    await AsyncStorage.removeItem(STORAGE_KEYS.security);
    return legacyRaw;
  } catch {
    return null;
  }
}

export interface LocalPrivacySettings {
  profilePhoto: string;
  firstName: string;
  lastName: string;
  biography: string;
  lastSeen: string;
  onlineStatus: string;
  groupAdd: string;
}

export interface LocalNotificationSettings {
  notifications: boolean;
  sound: boolean;
  mentions: boolean;
}

/** Map local privacy values (Everyone/Contacts/Nobody) to API format. */
function toVisibility(
  val: string | undefined,
): "everyone" | "contacts" | "nobody" {
  const v = (val ?? "everyone").toLowerCase();
  if (v === "contacts" || v === "nobody") return v;
  return "everyone";
}

export function privacyToApi(local: LocalPrivacySettings): PrivacySettings {
  return {
    profilePictureVisibility: toVisibility(local.profilePhoto),
    firstNameVisibility: toVisibility(local.firstName),
    lastNameVisibility: toVisibility(local.lastName),
    biographyVisibility: toVisibility(local.biography),
    lastSeenVisibility: toVisibility(local.lastSeen),
    onlineStatusVisibility: toVisibility(local.onlineStatus),
    groupAddPermission: toVisibility(local.groupAdd),
    searchVisibility: true,
    phoneNumberSearch: "everyone",
  };
}

export function apiToPrivacy(api: PrivacySettings): LocalPrivacySettings {
  const capitalize = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  return {
    profilePhoto: capitalize(api.profilePictureVisibility),
    firstName: capitalize(api.firstNameVisibility),
    lastName: capitalize(api.lastNameVisibility),
    biography: capitalize(api.biographyVisibility),
    lastSeen: capitalize(api.lastSeenVisibility),
    onlineStatus: capitalize(api.onlineStatusVisibility),
    groupAdd: capitalize(api.groupAddPermission),
  };
}

export function notificationToApi(
  local: LocalNotificationSettings,
): Partial<NotificationSettings> {
  return {
    message_push_enabled: local.notifications,
    system_push_enabled: local.sound,
    mentions_only: local.mentions,
  };
}

export function apiToNotification(
  api: NotificationSettings,
): LocalNotificationSettings {
  return {
    notifications: api.message_push_enabled,
    sound: api.system_push_enabled,
    mentions: api.mentions_only,
  };
}

// Re-export so consumers can keep a single import.
export { UserService };
