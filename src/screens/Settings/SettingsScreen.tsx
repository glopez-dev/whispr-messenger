/**
 * SettingsScreen - Application Settings
 * WHISPR-133: Implement SettingsScreen with app configuration
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Platform,
  InteractionManager,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { AuthStackParamList } from "../../navigation/types";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import type { BackgroundPreset } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useIsStaff, useModerationStore } from "../../store/moderationStore";
import { UserService } from "../../services/UserService";
import {
  NotificationService,
  NotificationSettings,
} from "../../services/NotificationService";
import {
  STORAGE_KEYS,
  apiToNotification,
  apiToPrivacy,
  loadSecurityFromStorage,
  notificationToApi,
  persistSettingsCategory,
  privacyToApi,
} from "./helpers/settingsConverters";
import { SettingItem, SettingSection } from "./components/SettingsRows";
import { setReadReceiptsEnabled } from "../../services/messaging/readReceiptsPref";
import { setTypingIndicatorEnabled } from "../../services/messaging/typingIndicatorPref";
import { SettingsChoiceAlert } from "./SettingsChoiceAlert";
import { useTour } from "../../context/TourContext";
import { DangerConfirmModal } from "../../components/Common/DangerConfirmModal";
import { FLOATING_TAB_BAR_RESERVED_SPACE } from "../../components/Navigation/floatingTabBarLayout";
import {
  DEFAULT_MODERATION_MODEL,
  getModerationModelVersion,
  setModerationModelVersion,
  type ModerationModelVersion,
} from "../../services/moderation";

const PRIVACY_ALERT_TITLE: Record<string, string> = {
  profilePhoto: "Photo de profil",
  firstName: "Prénom",
  lastName: "Nom de famille",
  biography: "Biographie",
  lastSeen: "Dernière connexion",
  onlineStatus: "Statut en ligne",
  groupAdd: "Permission d'ajout aux groupes",
};

const PRIVACY_VALUE_LABELS: Record<string, string> = {
  Everyone: "Tout le monde",
  Contacts: "Mes contacts",
  Nobody: "Personne",
};

const translatePrivacyValue = (value: string | undefined): string =>
  value ? (PRIVACY_VALUE_LABELS[value] ?? value) : "";

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const {
    settings,
    updateSettings,
    saveCustomBackground,
    clearCustomBackground,
    getThemeColors,
    getFontSize,
    getLocalizedText,
  } = useTheme();
  const themeColors = getThemeColors();
  const { signOut, userId } = useAuth();
  const { fetchMyRole } = useModerationStore();
  const isStaff = useIsStaff();
  const insets = useSafeAreaInsets();
  const { isTourActive, replayTour, skipTour: disableTour } = useTour();

  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [showBackgroundImagePicker, setShowBackgroundImagePicker] =
    useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);
  const [showModerationModelModal, setShowModerationModelModal] =
    useState(false);
  const [moderationModel, setModerationModel] =
    useState<ModerationModelVersion>(DEFAULT_MODERATION_MODEL);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [selectedPrivacyItem, setSelectedPrivacyItem] = useState<string | null>(
    null,
  );
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Privacy settings
  const [privacySettings, setPrivacySettings] = useState({
    profilePhoto: "Everyone",
    firstName: "Everyone",
    lastName: "Contacts",
    biography: "Everyone",
    lastSeen: "Everyone",
    onlineStatus: "Everyone",
    groupAdd: "Everyone",
  });

  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    notifications: true,
    sound: true,
    mentions: true,
  });

  // Messaging settings
  const [messagingSettings, setMessagingSettings] = useState({
    readReceipts: true,
    typingIndicator: true,
  });

  // compteur de requestId pour le toggle des accuses de lecture. Si l'user
  // toggle plusieurs fois avant que le backend reponde, seule la derniere
  // requete a le droit de rollback - les precedentes deviennent obsoletes.
  const readReceiptsRequestIdRef = useRef(0);

  // Application settings
  const [appSettings, setAppSettings] = useState({
    autoPlayMedia: true,
  });

  // Security settings
  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: false,
    biometricAuth: false,
  });

  /**
   * Sync notification settings to the notification-service backend.
   * Uses a PATCH-style merge: reads current backend settings first, then
   * updates only the fields we manage locally, preserving backend-only
   * fields (marketing_push_enabled, message_email_enabled, quiet_hours_*).
   * Si le backend refuse, rollback vers previous et alerte l'utilisateur.
   */
  const syncNotificationsToBackend = useCallback(
    async (
      local: typeof notificationSettings,
      previous: typeof notificationSettings,
    ) => {
      if (!userId) return;
      const doRollback = () => {
        setNotificationSettings(previous);
        persistSettingsCategory(STORAGE_KEYS.notifications, previous);
        Alert.alert(
          "Erreur",
          "Impossible de synchroniser ce parametre. Veuillez reessayer.",
        );
      };
      try {
        let existing: Partial<NotificationSettings> = {};
        try {
          existing = await NotificationService.getSettings(userId);
        } catch {
          // si fetch echoue, on continue avec les champs locaux uniquement
        }
        const merged: Partial<NotificationSettings> = {
          ...existing,
          ...notificationToApi(local),
        };
        await NotificationService.updateSettings(userId, merged);
      } catch (error) {
        console.error("Error syncing notification settings to backend:", error);
        doRollback();
      }
    },
    [
      userId,
      notificationToApi,
      persistSettingsCategory,
      STORAGE_KEYS.notifications,
    ],
  );

  /**
   * Sync privacy settings to the backend API.
   * Si le backend refuse, rollback vers previous et alerte l'utilisateur.
   */
  const syncPrivacyToBackend = useCallback(
    async (
      localPrivacy: typeof privacySettings,
      previous: typeof privacySettings,
    ) => {
      const doRollback = () => {
        setPrivacySettings(previous);
        persistSettingsCategory(STORAGE_KEYS.privacy, previous);
        Alert.alert(
          "Erreur",
          "Impossible de synchroniser ce parametre. Veuillez reessayer.",
        );
      };
      try {
        const userService = UserService.getInstance();
        const apiSettings = privacyToApi(localPrivacy);
        const result = await userService.updatePrivacySettings(apiSettings);
        if (!result.success) {
          console.error("Failed to sync privacy settings:", result.message);
          doRollback();
        }
      } catch (error) {
        console.error("Error syncing privacy to backend:", error);
        doRollback();
      }
    },
    [privacyToApi, persistSettingsCategory, STORAGE_KEYS.privacy],
  );

  /**
   * Lit la categorie security depuis SecureStore. Si vide, regarde encore
   * AsyncStorage pour migrer les users existants, puis purge la cle legacy.
   */
  /**
   * Load all settings from storage and privacy from API on mount.
   *
   * fix(settings) Le flag local biometricAuth/twoFactorAuth ne suffit PAS
   * pour autoriser une action sensible. Toujours valider cote serveur (cf
   * endpoint /auth/v1/2fa/status). Le flag sert juste a piloter l UI.
   *
   * WHISPR-1359 — la categorie security est lue depuis SecureStore. Pour les
   * users existants qui ont encore la valeur dans AsyncStorage, on migre
   * doucement : fallback AsyncStorage si SecureStore vide, puis purge la
   * cle legacy.
   */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [privacyJson, notifJson, msgJson, appJson, secJson] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.privacy),
            AsyncStorage.getItem(STORAGE_KEYS.notifications),
            AsyncStorage.getItem(STORAGE_KEYS.messaging),
            AsyncStorage.getItem(STORAGE_KEYS.app),
            loadSecurityFromStorage(),
          ]);

        if (privacyJson) setPrivacySettings(JSON.parse(privacyJson));
        if (notifJson) setNotificationSettings(JSON.parse(notifJson));
        if (msgJson) {
          const parsedMsg = JSON.parse(msgJson);
          setMessagingSettings(parsedMsg);
          if (typeof parsedMsg.readReceipts === "boolean") {
            setReadReceiptsEnabled(parsedMsg.readReceipts);
          }
          if (typeof parsedMsg.typingIndicator === "boolean") {
            setTypingIndicatorEnabled(parsedMsg.typingIndicator);
          }
        }
        if (appJson) setAppSettings(JSON.parse(appJson));
        if (secJson) setSecuritySettings(JSON.parse(secJson));

        // Also fetch privacy settings from backend API (takes precedence over local)
        const userService = UserService.getInstance();
        const result = await userService.getPrivacySettings();
        if (result.success && result.settings) {
          const localPrivacy = apiToPrivacy(result.settings);
          setPrivacySettings(localPrivacy);
          await AsyncStorage.setItem(
            STORAGE_KEYS.privacy,
            JSON.stringify(localPrivacy),
          );
          // synchronise readReceipts depuis le backend pour coherence multi-device.
          // Si la cle est presente on met a jour le state messaging et le mirror
          // memoire utilise par useWebSocket.
          if (typeof result.settings.readReceipts === "boolean") {
            const readReceiptsValue = result.settings.readReceipts;
            setReadReceiptsEnabled(readReceiptsValue);
            setMessagingSettings((prev) => {
              const updated = { ...prev, readReceipts: readReceiptsValue };
              AsyncStorage.setItem(
                STORAGE_KEYS.messaging,
                JSON.stringify(updated),
              ).catch(() => {});
              return updated;
            });
          }
        }

        // Fetch notification settings from notification-service backend (takes precedence over local)
        if (userId) {
          try {
            const backendNotif = await NotificationService.getSettings(userId);
            const localNotif = apiToNotification(backendNotif);
            setNotificationSettings(localNotif);
            await AsyncStorage.setItem(
              STORAGE_KEYS.notifications,
              JSON.stringify(localNotif),
            );
          } catch (notifError) {
            // warn : échec réseau / API non alignée — évite l’overlay rouge LogBox en dev
            console.warn(
              "Notification settings: backend unavailable or rejected request",
              notifError,
            );
          }
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    };

    loadSettings();
    fetchMyRole();

    if (__DEV__ || process.env.EXPO_PUBLIC_ENV === "preprod") {
      getModerationModelVersion()
        .then((v) => setModerationModel(v))
        .catch(() => setModerationModel(DEFAULT_MODERATION_MODEL));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (category: string, key: string, value: boolean) => {
    switch (category) {
      case "notifications":
        setNotificationSettings((prev) => {
          const updated = { ...prev, [key]: value };
          persistSettingsCategory(STORAGE_KEYS.notifications, updated);
          syncNotificationsToBackend(updated, prev);
          return updated;
        });
        break;
      case "messaging":
        setMessagingSettings((prev) => {
          const updated = { ...prev, [key]: value };
          persistSettingsCategory(STORAGE_KEYS.messaging, updated);
          // indicateur de saisie : pas d'equivalent backend dans le DTO
          // privacy de user-service aujourd'hui, donc on se contente du
          // mirror local synchrone. useWebSocket le lit a chaque appel
          // de sendTyping via getTypingIndicatorEnabled() -> effet
          // immediat sans avoir a reload SettingsScreen ou la conversation.
          if (key === "typingIndicator") {
            setTypingIndicatorEnabled(value);
          }
          // accuses de lecture : symetrie WhatsApp punitive. On met a jour le
          // mirror memoire immediatement pour que useWebSocket le voie au
          // prochain markAsRead, puis on push au backend (privacy_settings).
          // Si le backend echoue on rollback : la coherence multi-device
          // depend de la valeur serveur.
          if (key === "readReceipts") {
            setReadReceiptsEnabled(value);
            const userService = UserService.getInstance();
            // increment + capture du requestId : si l'user re-toggle avant que
            // l'API reponde, ce requestId ne correspondra plus au courant et
            // on ignore le rollback (l'user a deja change d'avis).
            readReceiptsRequestIdRef.current += 1;
            const requestId = readReceiptsRequestIdRef.current;
            const previousValue = prev.readReceipts;
            userService
              .updatePrivacySettings({ readReceipts: value })
              .then((result) => {
                if (requestId !== readReceiptsRequestIdRef.current) return;
                if (!result.success) {
                  // rollback en memoire et en state
                  setReadReceiptsEnabled(previousValue);
                  setMessagingSettings((curr) => {
                    const reverted = {
                      ...curr,
                      readReceipts: previousValue,
                    };
                    persistSettingsCategory(STORAGE_KEYS.messaging, reverted);
                    return reverted;
                  });
                  Alert.alert(
                    "Erreur",
                    "Impossible de synchroniser ce parametre. Veuillez reessayer.",
                  );
                }
              })
              .catch(() => {
                if (requestId !== readReceiptsRequestIdRef.current) return;
                setReadReceiptsEnabled(previousValue);
                setMessagingSettings((curr) => {
                  const reverted = { ...curr, readReceipts: previousValue };
                  persistSettingsCategory(STORAGE_KEYS.messaging, reverted);
                  return reverted;
                });
                Alert.alert(
                  "Erreur reseau",
                  "Impossible de synchroniser ce parametre.",
                );
              });
          }
          return updated;
        });
        break;
      case "app":
        setAppSettings((prev) => {
          const updated = { ...prev, [key]: value };
          persistSettingsCategory(STORAGE_KEYS.app, updated);
          return updated;
        });
        break;
      case "security":
        if (key === "biometricAuth" && value) {
          void enableBiometric();
        } else {
          setSecuritySettings((prev) => {
            const updated = { ...prev, [key]: value };
            persistSettingsCategory(STORAGE_KEYS.security, updated);
            return updated;
          });
        }
        break;
    }
  };

  const enableBiometric = async () => {
    if (Platform.OS === "web") return;
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware) {
      Alert.alert("Non disponible", getLocalizedText("biometric.notAvailable"));
      return;
    }
    if (!isEnrolled) {
      Alert.alert("Non configuré", getLocalizedText("biometric.notEnrolled"));
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: getLocalizedText("biometric.enableConfirm"),
      cancelLabel: getLocalizedText("biometric.cancelLabel"),
      disableDeviceFallback: false,
    });
    if (result.success) {
      setSecuritySettings((prev) => {
        const updated = { ...prev, biometricAuth: true };
        persistSettingsCategory(STORAGE_KEYS.security, updated);
        return updated;
      });
    }
  };

  const handleBackgroundImagePicker = useCallback(async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission refusée",
          "L'accès à la galerie est requis pour choisir un arrière-plan.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        await saveCustomBackground(result.assets[0].uri);
        setShowBackgroundImagePicker(false);
      }
    } catch (error) {
      console.error("Error saving custom background:", error);
      Alert.alert(
        "Erreur",
        "Impossible d'utiliser cette image comme arrière-plan.",
      );
    }
  }, [saveCustomBackground]);

  const handleSelect = async (
    type: "theme" | "background" | "language" | "fontSize" | "privacy",
    value: string,
  ) => {
    try {
      if (type === "theme") {
        // Fermer le modal d'abord pour éviter les conflits de re-render
        setShowThemeModal(false);
        // Attendre un peu pour que le modal se ferme avant le changement de thème
        setTimeout(async () => {
          await updateSettings({ theme: value as "light" | "dark" | "auto" });
        }, 100);
      } else if (type === "background") {
        setShowBackgroundModal(false);
        if (value === "custom-upload") {
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              setShowBackgroundImagePicker(true);
            }, 150);
          });
        } else if (value === "custom-remove") {
          setTimeout(async () => {
            try {
              await clearCustomBackground();
            } catch (error) {
              console.error("Error clearing custom background:", error);
              Alert.alert(
                "Erreur",
                "Impossible de supprimer l'arrière-plan personnalisé.",
              );
            }
          }, 100);
        } else {
          setTimeout(async () => {
            await updateSettings({
              backgroundPreset: value as BackgroundPreset,
            });
          }, 100);
        }
      } else if (type === "language") {
        setShowLanguageModal(false);
        setTimeout(async () => {
          await updateSettings({ language: value as "fr" | "en" });
        }, 100);
      } else if (type === "fontSize") {
        setShowFontSizeModal(false);
        setTimeout(async () => {
          await updateSettings({
            fontSize: value as "small" | "medium" | "large",
          });
        }, 100);
      } else if (type === "privacy" && selectedPrivacyItem) {
        setPrivacySettings((prev) => {
          const updated = { ...prev, [selectedPrivacyItem]: value };
          persistSettingsCategory(STORAGE_KEYS.privacy, updated);
          syncPrivacyToBackend(updated, prev);
          return updated;
        });
        setShowPrivacyModal(false);
        setSelectedPrivacyItem(null);
      }
    } catch (error) {
      console.error("Error updating setting:", error);
    }
  };

  const handlePrivacyItemPress = (item: string) => {
    setSelectedPrivacyItem(item);
    setShowPrivacyModal(true);
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(getLocalizedText("notif.logoutConfirm"));
      if (confirmed) {
        signOut().then(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: "Welcome" as never }],
          });
        });
      }
      return;
    }
    Alert.alert(
      getLocalizedText("settings.logout"),
      getLocalizedText("notif.logoutConfirm"),
      [
        { text: getLocalizedText("common.cancel"), style: "cancel" },
        {
          text: getLocalizedText("settings.logout"),
          style: "destructive",
          onPress: async () => {
            await signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: "Welcome" }],
            });
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    setShowDeleteAccountModal(true);
  };

  const confirmDeleteAccount = async () => {
    // l'endpoint /users/me delete cote backend n'est pas encore livre,
    // on garde un placeholder mais l'UX du typed-confirm protege la future integration
    setDeletingAccount(true);
    try {
      if (Platform.OS === "web") {
        window.alert("Fonctionnalité à venir");
      } else {
        Alert.alert(
          getLocalizedText("settings.deleteAccount"),
          "Fonctionnalité à venir",
          [{ text: "OK" }],
        );
      }
    } finally {
      setDeletingAccount(false);
      setShowDeleteAccountModal(false);
    }
  };

  const backgroundPresetLabel =
    getLocalizedText(`settings.background.${settings.backgroundPreset}`) ||
    settings.backgroundPreset;
  const backgroundOptions = [
    {
      label: getLocalizedText("settings.background.whispr"),
      value: "whispr",
    },
    {
      label: getLocalizedText("settings.background.midnight"),
      value: "midnight",
    },
    {
      label: getLocalizedText("settings.background.sunset"),
      value: "sunset",
    },
    {
      label: getLocalizedText("settings.background.aurora"),
      value: "aurora",
    },
    {
      label: getLocalizedText("settings.background.upload"),
      value: "custom-upload",
    },
    ...(settings.customBackgroundUri
      ? [
          {
            label: getLocalizedText("settings.background.remove"),
            value: "custom-remove",
          },
        ]
      : []),
  ];

  // WHISPR-1202 (re-fix WHISPR-1199) : sur React Native Web, height:100% sur
  // le ScrollView ne suffit pas car la chaîne flex au-dessus n'est pas
  // toujours contrainte en pixels. On positionne le ScrollView en absolu
  // pour qu'il remplisse à coup sûr le LinearGradient (qu'on passe en
  // position:relative pour servir de référent).
  const webContainerStyle =
    Platform.OS === "web" ? { position: "relative" as const } : null;
  const webScrollStyle =
    Platform.OS === "web"
      ? {
          position: "absolute" as const,
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          overflowY: "auto" as const,
        }
      : null;

  return (
    <LinearGradient
      colors={themeColors.background.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, webContainerStyle]}
    >
      <ScrollView
        testID="settings-scroll"
        style={[styles.scrollView, webScrollStyle]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: 40 + insets.bottom + FLOATING_TAB_BAR_RESERVED_SPACE,
          },
        ]}
        showsVerticalScrollIndicator={__DEV__}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        {/* Account Settings */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.account")}
          icon="person-outline"
        >
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.myProfile")}
            subtitle={getLocalizedText("settings.myProfileSubtitle")}
            onPress={() => navigation.navigate("MyProfile")}
            rightComponent={
              <Ionicons
                name="chevron-forward"
                size={20}
                color={themeColors.text.tertiary}
              />
            }
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.logout")}
            subtitle="Se déconnecter de votre compte"
            onPress={handleLogout}
            rightComponent={
              <Ionicons
                name="chevron-forward"
                size={20}
                color={themeColors.text.tertiary}
              />
            }
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.deleteAccount")}
            subtitle="Fonctionnalité à venir"
            onPress={handleDeleteAccount}
            rightComponent={
              <Ionicons
                name="chevron-forward"
                size={20}
                color={themeColors.text.tertiary}
              />
            }
          />
        </SettingSection>

        {/* Privacy Section */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.privacy")}
          icon="shield-outline"
        >
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Photo de profil"
            value={translatePrivacyValue(privacySettings.profilePhoto)}
            onPress={() => handlePrivacyItemPress("profilePhoto")}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Prénom"
            value={translatePrivacyValue(privacySettings.firstName)}
            onPress={() => handlePrivacyItemPress("firstName")}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Nom de famille"
            value={translatePrivacyValue(privacySettings.lastName)}
            onPress={() => handlePrivacyItemPress("lastName")}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Biographie"
            value={translatePrivacyValue(privacySettings.biography)}
            onPress={() => handlePrivacyItemPress("biography")}
          />
          {/* WHISPR-1298 : 3 toggles ajoutés (lastSeen, onlineStatus,
              groupAdd) pour couvrir les fields backend orphelins. */}
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Dernière connexion"
            value={translatePrivacyValue(privacySettings.lastSeen)}
            onPress={() => handlePrivacyItemPress("lastSeen")}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Statut en ligne"
            value={translatePrivacyValue(privacySettings.onlineStatus)}
            onPress={() => handlePrivacyItemPress("onlineStatus")}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Permission d'ajout aux groupes"
            value={translatePrivacyValue(privacySettings.groupAdd)}
            onPress={() => handlePrivacyItemPress("groupAdd")}
          />
          {/* WHISPR-1056: entry point to the BlockedUsersScreen — the
              screen was already registered in AuthNavigator but unreachable
              from the settings UI. */}
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={
              getLocalizedText("settings.blockedUsers") ||
              "Utilisateurs bloqués"
            }
            subtitle={
              getLocalizedText("settings.blockedUsersSubtitle") ||
              "Voir et débloquer les utilisateurs que vous avez bloqués"
            }
            onPress={() => navigation.navigate("BlockedUsers")}
            icon="ban-outline"
          />
        </SettingSection>

        {/* Notifications Section */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.notifications")}
          icon="notifications-outline"
        >
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("base"),
                    },
                  ]}
                >
                  Notifications
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  Recevoir les notifications
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.notifications}
              onValueChange={(value) =>
                handleToggle("notifications", "notifications", value)
              }
              trackColor={{
                false: themeColors.text.tertiary,
                true: themeColors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("base"),
                    },
                  ]}
                >
                  Son
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  Son de notification
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.sound}
              onValueChange={(value) =>
                handleToggle("notifications", "sound", value)
              }
              trackColor={{
                false: themeColors.text.tertiary,
                true: themeColors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("base"),
                    },
                  ]}
                >
                  Mentions
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  Notifications de mention
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.mentions}
              onValueChange={(value) =>
                handleToggle("notifications", "mentions", value)
              }
              trackColor={{
                false: themeColors.text.tertiary,
                true: themeColors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
        </SettingSection>

        {/* Messaging Section */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.messaging")}
          icon="chatbubbles-outline"
        >
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("base"),
                    },
                  ]}
                >
                  Accusés de lecture
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  Confirmer la lecture des messages
                </Text>
              </View>
            </View>
            <Switch
              value={messagingSettings.readReceipts}
              onValueChange={(value) =>
                handleToggle("messaging", "readReceipts", value)
              }
              trackColor={{
                false: themeColors.text.tertiary,
                true: themeColors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("base"),
                    },
                  ]}
                >
                  Indicateur de saisie
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  Afficher « en train d'écrire »
                </Text>
              </View>
            </View>
            <Switch
              value={messagingSettings.typingIndicator}
              onValueChange={(value) =>
                handleToggle("messaging", "typingIndicator", value)
              }
              trackColor={{
                false: themeColors.text.tertiary,
                true: themeColors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
        </SettingSection>

        {/* Application Settings */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.application")}
          icon="settings-outline"
        >
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.theme")}
            value={
              settings.theme === "light"
                ? getLocalizedText("settings.theme.light")
                : settings.theme === "dark"
                  ? getLocalizedText("settings.theme.dark")
                  : getLocalizedText("settings.theme.auto")
            }
            onPress={() => setShowThemeModal(true)}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.background")}
            value={backgroundPresetLabel}
            onPress={() => setShowBackgroundModal(true)}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.language")}
            value={
              settings.language === "fr"
                ? getLocalizedText("settings.language.fr")
                : getLocalizedText("settings.language.en")
            }
            onPress={() => setShowLanguageModal(true)}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.fontSize")}
            value={
              settings.fontSize === "small"
                ? getLocalizedText("settings.fontSize.small")
                : settings.fontSize === "medium"
                  ? getLocalizedText("settings.fontSize.medium")
                  : getLocalizedText("settings.fontSize.large")
            }
            onPress={() => setShowFontSizeModal(true)}
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Tour guidé"
            subtitle="Afficher le tour de présentation"
            icon="compass-outline"
            onPress={() => (isTourActive ? disableTour() : replayTour())}
            rightComponent={
              <Switch
                value={isTourActive}
                onValueChange={(value) =>
                  value ? replayTour() : disableTour()
                }
                trackColor={{
                  false: themeColors.text.tertiary,
                  true: themeColors.primary,
                }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </SettingSection>

        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.aboutSection")}
          icon="document-text-outline"
        >
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.aboutWhispr")}
            subtitle={getLocalizedText("settings.aboutWhisprSubtitle")}
            onPress={() => navigation.navigate("AboutContent")}
            icon="information-circle-outline"
          />
        </SettingSection>

        {/* Security Settings */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.security")}
          icon="lock-closed-outline"
        >
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label="Clés de sécurité"
            subtitle="Gérer vos clés de chiffrement et vos appareils"
            onPress={() => navigation.navigate("SecurityKeys")}
            icon="key-outline"
          />
          {/* WHISPR-1055: session management — list connected devices + revoke. */}
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("devices.title") || "Mes appareils"}
            subtitle={
              getLocalizedText("devices.subtitle") ||
              "Voir et déconnecter les sessions actives"
            }
            onPress={() => navigation.navigate("Devices")}
            icon="phone-portrait-outline"
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("twoFactor.title")}
            subtitle={getLocalizedText("twoFactor.authenticationSubtitle")}
            onPress={() => navigation.navigate("TwoFactorAuth")}
            icon="shield-checkmark-outline"
          />
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.settingTextContainer}>
                <Text
                  style={[
                    styles.settingLabel,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("base"),
                    },
                  ]}
                >
                  Authentification biométrique
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  Déverrouiller avec l'empreinte ou le visage
                </Text>
              </View>
            </View>
            <Switch
              value={securitySettings.biometricAuth}
              onValueChange={(value) =>
                handleToggle("security", "biometricAuth", value)
              }
              disabled={Platform.OS === "web"}
              trackColor={{
                false: themeColors.text.tertiary,
                true: themeColors.primary,
              }}
              thumbColor="#FFFFFF"
            />
          </View>
        </SettingSection>

        {/* Moderation Section */}
        <SettingSection
          themeColors={themeColors}
          getFontSize={getFontSize}
          title={getLocalizedText("settings.moderation") || "Modération"}
          icon="flag-outline"
        >
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.myReports") || "Mes signalements"}
            subtitle={
              getLocalizedText("settings.myReportsSubtitle") ||
              "Historique de vos signalements"
            }
            onPress={() => navigation.navigate("ReportHistory")}
            icon="document-text-outline"
          />
          <SettingItem
            themeColors={themeColors}
            getFontSize={getFontSize}
            label={getLocalizedText("settings.mySanctions") || "Mes sanctions"}
            subtitle={
              getLocalizedText("settings.mySanctionsSubtitle") ||
              "Voir vos sanctions"
            }
            onPress={() => navigation.navigate("MySanctions")}
            icon="alert-circle-outline"
          />
          {isStaff && (
            <SettingItem
              themeColors={themeColors}
              getFontSize={getFontSize}
              label={
                getLocalizedText("settings.moderationDashboard") ||
                "Tableau de modération"
              }
              subtitle={
                getLocalizedText("settings.moderationDashboardSubtitle") ||
                "Gestion de la modération"
              }
              onPress={() => navigation.navigate("ModerationDashboard")}
              icon="shield-outline"
            />
          )}
        </SettingSection>

        {/* Administration - visible uniquement pour les admins/modérateurs */}
        {isStaff && (
          <SettingSection
            title="Administration"
            icon="flask-outline"
            themeColors={themeColors}
            getFontSize={getFontSize}
          >
            <SettingItem
              themeColors={themeColors}
              getFontSize={getFontSize}
              label="Demos IA (Admin)"
              subtitle="Demontrer les modeles IA Zeyou et Maya aux prospects"
              onPress={() => navigation.navigate("AdminDemos")}
              icon="cube-outline"
            />
          </SettingSection>
        )}

        {/* Developer / Debug - visible en dev local + en build preprod (jamais en prod) */}
        {(__DEV__ || process.env.EXPO_PUBLIC_ENV === "preprod") && (
          <SettingSection
            title="Debug"
            icon="bug-outline"
            themeColors={themeColors}
            getFontSize={getFontSize}
          >
            <SettingItem
              themeColors={themeColors}
              getFontSize={getFontSize}
              label="Modèle de modération"
              subtitle="v2 EfficientNet 9-classes · v3 MobileNetV3 3-classes (healthy/not_food/unhealthy) · v4 MobileNetV3 binary food/not_food"
              value={
                moderationModel === "v4"
                  ? "v4 · MobileNetV3 binary"
                  : moderationModel === "v3"
                    ? "v3 · MobileNetV3 3-classes"
                    : "v2 · EfficientNet 9-classes"
              }
              onPress={() => setShowModerationModelModal(true)}
              icon="cube-outline"
            />
            <SettingItem
              themeColors={themeColors}
              getFontSize={getFontSize}
              label="Moderation Test"
              subtitle="Run the on-device TFJS image gate"
              onPress={() => navigation.navigate("ModerationTest")}
              icon="image-outline"
              rightComponent={
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={themeColors.text.tertiary}
                />
              }
            />
            {__DEV__ && (
              <>
                <SettingItem
                  themeColors={themeColors}
                  getFontSize={getFontSize}
                  label="[DEV] Recovery Codes Screen"
                  subtitle="Preview écran codes de backup (données mockées)"
                  onPress={() => navigation.navigate("RecoveryCodes")}
                  icon="shield-checkmark-outline"
                  rightComponent={
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={themeColors.text.tertiary}
                    />
                  }
                />
                <SettingItem
                  themeColors={themeColors}
                  getFontSize={getFontSize}
                  label="[DEV] Recovery Code Entry"
                  subtitle="Preview saisie code de récupération"
                  onPress={() => navigation.navigate("RecoveryCodeEntry")}
                  icon="key-outline"
                  rightComponent={
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={themeColors.text.tertiary}
                    />
                  }
                />
              </>
            )}
          </SettingSection>
        )}
      </ScrollView>

      {/* Modals — alerte centrée style iOS (Application + Privacy) */}
      <SettingsChoiceAlert
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        title={getLocalizedText("settings.theme")}
        options={[
          { label: getLocalizedText("settings.theme.auto"), value: "auto" },
          { label: getLocalizedText("settings.theme.light"), value: "light" },
          { label: getLocalizedText("settings.theme.dark"), value: "dark" },
        ]}
        selectedValue={settings.theme}
        onSelect={(value) => handleSelect("theme", value)}
        cancelLabel={getLocalizedText("common.cancel")}
        layout="vertical"
      />

      <SettingsChoiceAlert
        visible={showBackgroundModal}
        onClose={() => setShowBackgroundModal(false)}
        title={getLocalizedText("settings.background")}
        options={backgroundOptions}
        selectedValue={settings.backgroundPreset}
        onSelect={(value) => handleSelect("background", value)}
        cancelLabel={getLocalizedText("common.cancel")}
        layout="vertical"
      />

      <Modal
        visible={showBackgroundImagePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBackgroundImagePicker(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Changer l'arrière-plan</Text>
            <Text style={styles.alertSubtitle}>Sélectionnez une option</Text>

            <TouchableOpacity
              style={styles.alertAction}
              onPress={() => {
                void handleBackgroundImagePicker();
              }}
            >
              <Ionicons
                name="image"
                size={18}
                color="#0A84FF"
                style={styles.alertIcon}
              />
              <Text style={styles.alertActionText}>
                Choisir depuis la galerie
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.alertCancel}
              onPress={() => setShowBackgroundImagePicker(false)}
            >
              <Text style={styles.alertCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SettingsChoiceAlert
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        title={getLocalizedText("settings.language")}
        options={[
          { label: getLocalizedText("settings.language.fr"), value: "fr" },
          { label: getLocalizedText("settings.language.en"), value: "en" },
        ]}
        selectedValue={settings.language}
        onSelect={(value) => handleSelect("language", value)}
        cancelLabel={getLocalizedText("common.cancel")}
        layout="auto"
      />

      {(__DEV__ || process.env.EXPO_PUBLIC_ENV === "preprod") && (
        <SettingsChoiceAlert
          visible={showModerationModelModal}
          onClose={() => setShowModerationModelModal(false)}
          title="Modèle de modération"
          options={[
            { label: "v2 · EfficientNet 9-classes", value: "v2" },
            { label: "v3 · MobileNetV3 3-classes (+ vidéo)", value: "v3" },
            { label: "v4 · MobileNetV3 binary food/not_food", value: "v4" },
          ]}
          selectedValue={moderationModel}
          onSelect={async (value) => {
            const next = value as ModerationModelVersion;
            setModerationModel(next);
            setShowModerationModelModal(false);
            try {
              await setModerationModelVersion(next);
            } catch (e) {
              console.warn("Failed to persist moderation model", e);
            }
          }}
          cancelLabel={getLocalizedText("common.cancel")}
          layout="vertical"
        />
      )}

      <SettingsChoiceAlert
        visible={showFontSizeModal}
        onClose={() => setShowFontSizeModal(false)}
        title={getLocalizedText("settings.fontSize")}
        options={[
          {
            label: getLocalizedText("settings.fontSize.small"),
            value: "small",
          },
          {
            label: getLocalizedText("settings.fontSize.medium"),
            value: "medium",
          },
          {
            label: getLocalizedText("settings.fontSize.large"),
            value: "large",
          },
        ]}
        selectedValue={settings.fontSize}
        onSelect={(value) => handleSelect("fontSize", value)}
        cancelLabel={getLocalizedText("common.cancel")}
        layout="vertical"
      />

      {selectedPrivacyItem && (
        <SettingsChoiceAlert
          visible={showPrivacyModal}
          onClose={() => {
            setShowPrivacyModal(false);
            setSelectedPrivacyItem(null);
          }}
          title={
            PRIVACY_ALERT_TITLE[selectedPrivacyItem] ?? selectedPrivacyItem
          }
          options={[
            { label: "Tout le monde", value: "Everyone" },
            { label: "Mes contacts", value: "Contacts" },
            { label: "Personne", value: "Nobody" },
          ]}
          selectedValue={
            privacySettings[
              selectedPrivacyItem as keyof typeof privacySettings
            ] as string
          }
          onSelect={(value) => handleSelect("privacy", value)}
          cancelLabel={getLocalizedText("common.cancel")}
          layout="vertical"
        />
      )}

      <DangerConfirmModal
        visible={showDeleteAccountModal}
        title={getLocalizedText("confirm.deleteAccount.title")}
        description={getLocalizedText("confirm.deleteAccount.description")}
        expectedText={getLocalizedText("confirm.expectedDelete")}
        actionLabel={getLocalizedText("confirm.deleteAccount.action")}
        actionVariant="destructive"
        loading={deletingAccount}
        onCancel={() => setShowDeleteAccountModal(false)}
        onConfirm={confirmDeleteAccount}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontWeight: "500",
  },
  settingSubtitle: {
    marginTop: 2,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  alertCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },
  alertSubtitle: {
    fontSize: 14,
    color: "#545458",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 16,
  },
  alertAction: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },
  alertIcon: {
    marginRight: 16,
  },
  alertActionText: {
    fontSize: 16,
    color: "#000",
  },
  alertCancel: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  alertCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A84FF",
  },
});

export default SettingsScreen;
