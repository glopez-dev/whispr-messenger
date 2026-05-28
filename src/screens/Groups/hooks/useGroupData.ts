import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import {
  groupsAPI,
  GroupDetails,
  GroupMember,
  GroupSettings,
} from "../../../services/groups/api";
import { logger } from "../../../utils/logger";

export interface UseGroupDataOptions {
  groupId: string;
  conversationKey: string;
  /** Display name from route params — used as fallback when getGroupDetails
   * fails so the header still renders something readable. */
  conversationName?: string;
}

export interface UseGroupDataReturn {
  groupDetails: GroupDetails | null;
  setGroupDetails: React.Dispatch<React.SetStateAction<GroupDetails | null>>;
  members: GroupMember[];
  setMembers: React.Dispatch<React.SetStateAction<GroupMember[]>>;
  settings: GroupSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<GroupSettings | null>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  refreshing: boolean;
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  loadGroupData: () => Promise<void>;
  handleRefresh: () => void;
}

export function useGroupData({
  groupId,
  conversationKey,
  conversationName,
}: UseGroupDataOptions): UseGroupDataReturn {
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGroupData = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        groupsAPI.getGroupDetails(groupId, conversationKey),
        groupsAPI.getGroupMembers(groupId, {
          conversationId: conversationKey,
        }),
        groupsAPI.getGroupSettings(groupId, {
          conversationId: conversationKey,
        }),
      ]);

      const [detailsR, membersR, settingsR] = results;

      if (detailsR.status === "fulfilled") {
        setGroupDetails(detailsR.value);
      } else {
        logger.warn(
          "GroupDetailsScreen",
          "getGroupDetails failed, falling back to route params",
          detailsR.reason,
        );
        // Fallback so the header can still render the group name when the
        // backend endpoint is unavailable (e.g. legacy /user/v1/groups/:id 404).
        setGroupDetails((prev) => {
          if (prev) return prev;
          const fallbackName = conversationName ?? "";
          return {
            id: groupId,
            name: fallbackName,
            created_by: "",
            created_at: "",
            updated_at: "",
            is_active: true,
            conversation_id: conversationKey,
          } as GroupDetails;
        });
      }

      if (membersR.status === "fulfilled") {
        setMembers(membersR.value.members);
      } else {
        logger.warn(
          "GroupDetailsScreen",
          "getGroupMembers failed",
          membersR.reason,
        );
      }

      if (settingsR.status === "fulfilled") {
        setSettings(settingsR.value);
      } else {
        logger.warn(
          "GroupDetailsScreen",
          "getGroupSettings failed",
          settingsR.reason,
        );
      }

      // If every call failed, surface a single user-facing error.
      if (results.every((r) => r.status === "rejected")) {
        logger.error(
          "GroupDetailsScreen",
          "All group data requests failed",
          results,
        );
        Alert.alert(
          "Erreur",
          "Impossible de charger les informations du groupe",
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, conversationKey, conversationName]);

  useEffect(() => {
    loadGroupData().catch((err) => {
      logger.error("GroupDetailsScreen", "loadGroupData effect failed", err);
    });
  }, [loadGroupData]);

  const handleRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRefreshing(true);
    loadGroupData().catch((err) => {
      logger.error("GroupDetailsScreen", "loadGroupData refresh failed", err);
    });
  }, [loadGroupData]);

  return {
    groupDetails,
    setGroupDetails,
    members,
    setMembers,
    settings,
    setSettings,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    loadGroupData,
    handleRefresh,
  };
}
