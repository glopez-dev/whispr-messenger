import { PrivacySettings, UserService } from "../../../services/UserService";
import { NotificationSettings } from "../../../services/NotificationService";

export const STORAGE_KEYS = {
  privacy: "@whispr_settings_privacy",
  notifications: "@whispr_settings_notifications",
  messaging: "@whispr_settings_messaging",
  app: "@whispr_settings_app",
  security: "whispr_settings_security",
} as const;

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
