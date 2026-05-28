import React, { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { groupsAPI, GroupMember } from "../../../services/groups/api";
import { contactsAPI, Contact } from "../../../services/contacts/api";
import { messagingAPI } from "../../../services/messaging/api";
import { logger } from "../../../utils/logger";

/** Blocked when the only admin tries to demote themselves. */
export function isSelfDemotionBlocked(
  role: "admin" | "member",
  targetUserId: string,
  currentUserId: string,
  isLastAdmin: boolean,
): boolean {
  return role === "member" && targetUserId === currentUserId && isLastAdmin;
}

export function getChangeRoleErrorMessage(
  error: { status?: number; message?: string } | null | undefined,
): { title: string; message: string } {
  if (error?.status === 403) {
    return {
      title: "Non autorisé",
      message: "Seul un administrateur peut modifier les rôles.",
    };
  }
  if (error?.status === 404 || error?.status === 405) {
    return {
      title: "Fonctionnalité indisponible",
      message:
        "Le changement de rôle n'est pas encore disponible côté serveur.",
    };
  }
  return {
    title: "Erreur",
    message: error?.message || "Impossible de changer le rôle",
  };
}

export interface UseGroupMemberActionsOptions {
  conversationId: string;
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  isLastAdmin: boolean;
  loadGroupData: () => Promise<void> | void;
}

export interface UseGroupMemberActionsReturn {
  showAddMemberModal: boolean;
  setShowAddMemberModal: React.Dispatch<React.SetStateAction<boolean>>;
  contacts: Contact[];
  loadingContacts: boolean;
  contactSearch: string;
  setContactSearch: React.Dispatch<React.SetStateAction<string>>;
  addingMember: boolean;
  memberActionFor: GroupMember | null;
  setMemberActionFor: React.Dispatch<React.SetStateAction<GroupMember | null>>;
  memberActionLoading: boolean;
  pickerContacts: Contact[];
  loadContactsForPicker: () => Promise<void>;
  openAddMemberModal: () => void;
  handlePickContact: (contact: Contact) => Promise<void>;
  handleRemoveMember: (member: GroupMember) => void;
  handleChangeRole: (
    member: GroupMember,
    role: "admin" | "member",
  ) => Promise<void>;
}

export function useGroupMemberActions({
  conversationId,
  groupId,
  members,
  currentUserId,
  isLastAdmin,
  loadGroupData,
}: UseGroupMemberActionsOptions): UseGroupMemberActionsReturn {
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberActionFor, setMemberActionFor] = useState<GroupMember | null>(
    null,
  );
  const [memberActionLoading, setMemberActionLoading] = useState(false);

  const loadContactsForPicker = useCallback(async () => {
    try {
      setLoadingContacts(true);
      const result = await contactsAPI.getContacts();
      setContacts(result.contacts);
    } catch (error) {
      logger.error("GroupDetailsScreen", "Error loading contacts", error);
      Alert.alert("Erreur", "Impossible de charger les contacts");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const openAddMemberModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setContactSearch("");
    setShowAddMemberModal(true);
    if (contacts.length === 0) {
      loadContactsForPicker().catch((err) => {
        logger.error(
          "GroupDetailsScreen",
          "loadContactsForPicker rejected",
          err,
        );
      });
    }
  }, [contacts.length, loadContactsForPicker]);

  const existingMemberIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members],
  );

  const pickerContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      const userId = c.contact_user?.id ?? c.contact_id;
      if (!userId || existingMemberIds.has(userId)) return false;
      if (!q) return true;
      const nick = c.nickname?.toLowerCase() || "";
      const uname = c.contact_user?.username?.toLowerCase() || "";
      const fn = c.contact_user?.first_name?.toLowerCase() || "";
      const ln = c.contact_user?.last_name?.toLowerCase() || "";
      return (
        nick.includes(q) ||
        uname.includes(q) ||
        fn.includes(q) ||
        ln.includes(q)
      );
    });
  }, [contacts, contactSearch, existingMemberIds]);

  const handlePickContact = useCallback(
    async (contact: Contact) => {
      const userId = contact.contact_user?.id ?? contact.contact_id;
      if (!userId) return;
      try {
        setAddingMember(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await messagingAPI.addGroupMembers(conversationId, [userId]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Membre ajouté", "Le membre a été ajouté au groupe.");
        setShowAddMemberModal(false);
        loadGroupData();
      } catch (error: unknown) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const e = error as { status?: number; message?: string };
        if (e?.status === 403) {
          Alert.alert(
            "Non autorisé",
            "Seul un administrateur peut ajouter un membre.",
          );
        } else {
          Alert.alert("Erreur", e?.message || "Impossible d'ajouter ce membre");
        }
      } finally {
        setAddingMember(false);
      }
    },
    [conversationId, loadGroupData],
  );

  const handleRemoveMember = useCallback(
    (member: GroupMember) => {
      Alert.alert(
        "Retirer du groupe",
        `Retirer ${member.display_name} du groupe ?`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Retirer",
            style: "destructive",
            onPress: async () => {
              try {
                setMemberActionLoading(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                await messagingAPI.removeGroupMember(
                  conversationId,
                  member.user_id,
                );
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                setMemberActionFor(null);
                loadGroupData();
              } catch (error: unknown) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error,
                );
                const e = error as { status?: number; message?: string };
                if (e?.status === 403) {
                  Alert.alert(
                    "Non autorisé",
                    "Seul un administrateur peut retirer un membre.",
                  );
                } else {
                  Alert.alert(
                    "Erreur",
                    e?.message || "Impossible de retirer ce membre",
                  );
                }
              } finally {
                setMemberActionLoading(false);
              }
            },
          },
        ],
      );
    },
    [conversationId, loadGroupData],
  );

  const handleChangeRole = useCallback(
    async (member: GroupMember, role: "admin" | "member") => {
      if (
        isSelfDemotionBlocked(role, member.user_id, currentUserId, isLastAdmin)
      ) {
        Alert.alert(
          "Action impossible",
          "Tu es le seul admin. Promeus quelqu'un d'autre avant de te rétrograder, ou quitte le groupe (un membre sera auto-promu).",
        );
        return;
      }
      try {
        setMemberActionLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // préférer les endpoints dédiés user-service (PR #151), repli messaging
        if (role === "admin") {
          try {
            await groupsAPI.promoteMember(groupId, member.user_id);
          } catch (e: unknown) {
            const err = e as { status?: number };
            if (err?.status === 404 || err?.status === 405) {
              await messagingAPI.updateGroupMemberRole(
                conversationId,
                member.user_id,
                "admin",
              );
            } else {
              throw e;
            }
          }
        } else {
          try {
            await groupsAPI.demoteMember(groupId, member.user_id);
          } catch (e: unknown) {
            const err = e as { status?: number };
            if (err?.status === 409) {
              // dernier admin - ne devrait pas arriver ici vu isSelfDemotionBlocked,
              // mais on le gère quand même pour les races conditions
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                "Impossible",
                "Tu ne peux pas retirer le dernier admin",
              );
              return;
            }
            if (err?.status === 404 || err?.status === 405) {
              await messagingAPI.updateGroupMemberRole(
                conversationId,
                member.user_id,
                "member",
              );
            } else {
              throw e;
            }
          }
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setMemberActionFor(null);
        loadGroupData();
      } catch (error: unknown) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const { title, message } = getChangeRoleErrorMessage(
          error as { status?: number; message?: string },
        );
        Alert.alert(title, message);
      } finally {
        setMemberActionLoading(false);
      }
    },
    [currentUserId, conversationId, groupId, isLastAdmin, loadGroupData],
  );

  return {
    showAddMemberModal,
    setShowAddMemberModal,
    contacts,
    loadingContacts,
    contactSearch,
    setContactSearch,
    addingMember,
    memberActionFor,
    setMemberActionFor,
    memberActionLoading,
    pickerContacts,
    loadContactsForPicker,
    openAddMemberModal,
    handlePickContact,
    handleRemoveMember,
    handleChangeRole,
  };
}
