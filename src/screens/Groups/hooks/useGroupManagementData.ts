import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { groupsAPI, GroupDetails, GroupMember } from "@/services/groups/api";
import { logger } from "@/utils/logger";

export interface UseGroupManagementDataOptions {
  groupId: string;
  conversationId: string;
  /** Fired once per successful load so the screen can seed the
   * name/description edit fields from the freshly fetched details. */
  onLoaded?: (details: GroupDetails) => void;
}

export interface UseGroupManagementDataReturn {
  groupDetails: GroupDetails | null;
  setGroupDetails: React.Dispatch<React.SetStateAction<GroupDetails | null>>;
  members: GroupMember[];
  setMembers: React.Dispatch<React.SetStateAction<GroupMember[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  refreshing: boolean;
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  loadGroupData: () => Promise<void>;
  handleRefresh: () => void;
}

export function useGroupManagementData({
  groupId,
  conversationId,
  onLoaded,
}: UseGroupManagementDataOptions): UseGroupManagementDataReturn {
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Keep onLoaded in a ref so callers can pass an inline lambda without
  // re-triggering loadGroupData on every render.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const loadGroupData = useCallback(async () => {
    try {
      setLoading(true);
      const [details, membersData] = await Promise.all([
        groupsAPI.getGroupDetails(groupId, conversationId),
        groupsAPI.getGroupMembers(groupId, { conversationId }),
      ]);

      setGroupDetails(details);
      setMembers(membersData.members);
      onLoadedRef.current?.(details);
    } catch (error) {
      logger.error("GroupManagementScreen", "Error loading group data", error);
      Alert.alert("Erreur", "Impossible de charger les informations du groupe");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, conversationId]);

  useEffect(() => {
    loadGroupData();
  }, [loadGroupData]);

  const handleRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadGroupData();
  }, [loadGroupData]);

  return {
    groupDetails,
    setGroupDetails,
    members,
    setMembers,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    loadGroupData,
    handleRefresh,
  };
}
