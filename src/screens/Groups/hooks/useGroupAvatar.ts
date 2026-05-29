import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { groupsAPI, GroupDetails } from "@/services/groups/api";
import { MediaService } from "@/services/MediaService";
import { Conversation } from "@/types/messaging";
import { logger } from "@/utils/logger";

export interface UseGroupAvatarOptions {
  groupId: string;
  conversationId: string;
  isAdmin: boolean;
  currentUserId: string;
  conversation: Conversation | null | undefined;
  applyConversationUpdate: (conversation: Conversation) => void;
  refreshConversations: () => Promise<void> | void;
  loadGroupData: () => Promise<void> | void;
  setGroupDetails: React.Dispatch<React.SetStateAction<GroupDetails | null>>;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseGroupAvatarReturn {
  uploadGroupIcon: (localUri: string, assetMimeType?: string) => Promise<void>;
  handleChangePhoto: () => Promise<void>;
}

export function useGroupAvatar({
  groupId,
  conversationId,
  isAdmin,
  currentUserId,
  conversation,
  applyConversationUpdate,
  refreshConversations,
  loadGroupData,
  setGroupDetails,
  setSaving,
}: UseGroupAvatarOptions): UseGroupAvatarReturn {
  const uploadGroupIcon = useCallback(
    async (localUri: string, assetMimeType?: string) => {
      const fileName = localUri.split("/").pop() || "group-icon.jpg";
      const lower = fileName.toLowerCase();
      const fileType =
        assetMimeType ??
        (lower.endsWith(".png")
          ? "image/png"
          : lower.endsWith(".gif")
            ? "image/gif"
            : lower.endsWith(".webp")
              ? "image/webp"
              : lower.endsWith(".heic") || lower.endsWith(".heif")
                ? "image/heic"
                : "image/jpeg");

      const doUpload = async (
        context: "group_icon" | "avatar" | "message",
        ownerId: string | undefined,
      ) =>
        MediaService.uploadMedia(
          { uri: localUri, name: fileName, type: fileType },
          undefined,
          { context, ownerId },
        );

      const retryUpload = async (
        context: "group_icon" | "avatar" | "message",
        ownerId: string | undefined,
      ) => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await doUpload(context, ownerId);
          } catch (err) {
            lastError = err;
            const status =
              typeof (err as { status?: number })?.status === "number"
                ? (err as { status?: number }).status
                : null;
            if (!status || status < 500 || attempt === 2) break;
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
        throw lastError;
      };

      let upload: { id: string };
      try {
        upload = await retryUpload("group_icon", currentUserId || undefined);
      } catch (err) {
        const status =
          typeof (err as { status?: number })?.status === "number"
            ? (err as { status?: number }).status
            : null;
        const msg = String((err as Error)?.message ?? "");
        if (
          status === 503 &&
          /group authorization service unavailable/i.test(msg)
        ) {
          upload = await retryUpload("avatar", currentUserId || undefined);
        } else {
          throw err;
        }
      }

      const updated = await groupsAPI.updateGroup(
        groupId,
        { picture_url: upload.id },
        conversationId,
      );

      setGroupDetails(updated);
      if (conversation) {
        const nextMeta = {
          ...(conversation.metadata ?? {}),
          group_avatar_url: upload.id,
          avatar_url: upload.id,
          picture_url: upload.id,
          group_icon_url: upload.id,
        };
        applyConversationUpdate({
          ...conversation,
          avatar_url: upload.id,
          metadata: nextMeta,
        });
      }
      await refreshConversations();
    },
    [
      applyConversationUpdate,
      conversation,
      conversationId,
      currentUserId,
      groupId,
      refreshConversations,
      setGroupDetails,
    ],
  );

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission requise", "L'accès à la galerie est nécessaire");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const asset = result.assets[0];
      setGroupDetails((prev) =>
        prev ? { ...prev, picture_url: asset.uri } : prev,
      );
      await uploadGroupIcon(asset.uri, asset.mimeType ?? undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [uploadGroupIcon, setGroupDetails, setSaving]);

  const handleChangePhoto = useCallback(async () => {
    if (!isAdmin) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Alert.alert multi-button ne fonctionne pas sur web — ouvrir directement la galerie
    if (Platform.OS === "web") {
      try {
        await pickFromLibrary();
      } catch (error) {
        logger.error("GroupManagementScreen", "Error selecting photo", error);
        await loadGroupData();
        Alert.alert("Erreur", "Impossible de sélectionner la photo");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSaving(false);
      }
      return;
    }

    Alert.alert(
      "Changer la photo",
      "Choisissez une option",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Galerie",
          onPress: async () => {
            try {
              await pickFromLibrary();
            } catch (error) {
              logger.error(
                "GroupManagementScreen",
                "Error selecting photo",
                error,
              );
              await loadGroupData();
              Alert.alert("Erreur", "Impossible de sélectionner la photo");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setSaving(false);
            }
          },
        },
        {
          text: "Appareil photo",
          onPress: async () => {
            try {
              const { status } =
                await ImagePicker.requestCameraPermissionsAsync();
              if (status !== "granted") {
                Alert.alert(
                  "Permission requise",
                  "L'accès à l'appareil photo est nécessaire",
                );
                return;
              }

              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                setSaving(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const asset = result.assets[0];
                setGroupDetails((prev) =>
                  prev ? { ...prev, picture_url: asset.uri } : prev,
                );
                await uploadGroupIcon(asset.uri, asset.mimeType ?? undefined);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            } catch (error) {
              logger.error(
                "GroupManagementScreen",
                "Error taking photo",
                error,
              );
              await loadGroupData();
              Alert.alert("Erreur", "Impossible de prendre la photo");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setSaving(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [
    isAdmin,
    loadGroupData,
    pickFromLibrary,
    uploadGroupIcon,
    setGroupDetails,
    setSaving,
  ]);

  return { uploadGroupIcon, handleChangePhoto };
}
