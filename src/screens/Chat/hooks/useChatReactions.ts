import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { MessageReaction, MessageWithRelations } from "@/types/messaging";
import { messagingAPI } from "@/services/messaging/api";
import { logger } from "@/utils/logger";
import { showAlert } from "@/utils/alert";
import {
  checkReactionLimits,
  userHasReaction,
  validateReactionEmoji,
} from "@/utils/reactionEmoji";

export interface ChatMemberLike {
  id: string;
  display_name?: string | null;
}

export interface UseChatReactionsOptions {
  conversationId: string;
  userId: string;
  messages: MessageWithRelations[];
  conversationMembers: ChatMemberLike[];
  setMessages: React.Dispatch<React.SetStateAction<MessageWithRelations[]>>;
}

export interface UseChatReactionsReturn {
  showReactionPicker: boolean;
  setShowReactionPicker: React.Dispatch<React.SetStateAction<boolean>>;
  reactionPickerMessageId: string | null;
  setReactionPickerMessageId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  reactionReactorsModal: { messageId: string; emoji: string } | null;
  setReactionReactorsModal: React.Dispatch<
    React.SetStateAction<{ messageId: string; emoji: string } | null>
  >;
  reactionModalList: MessageReaction[];
  resolveReactorDisplayName: (uid: string) => string;
  handleReactionPress: (messageId: string, emoji: string) => Promise<void>;
  handleReactionDetailsPress: (messageId: string, emoji: string) => void;
  handleReactionSelectFromPicker: (emoji: string) => Promise<void>;
}

export function useChatReactions({
  conversationId: _conversationId,
  userId,
  messages,
  conversationMembers,
  setMessages,
}: UseChatReactionsOptions): UseChatReactionsReturn {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<
    string | null
  >(null);
  const [reactionReactorsModal, setReactionReactorsModal] = useState<{
    messageId: string;
    emoji: string;
  } | null>(null);

  const resolveReactorDisplayName = useCallback(
    (uid: string) => {
      if (uid === userId) return "Vous";
      const m = conversationMembers.find((x) => x.id === uid);
      if (m?.display_name) return m.display_name;
      return "Utilisateur";
    },
    [userId, conversationMembers],
  );

  const reactionModalList = useMemo(() => {
    if (!reactionReactorsModal) return [];
    const msg = messages.find((m) => m.id === reactionReactorsModal.messageId);
    return (msg?.reactions ?? []).filter(
      (r) => r.reaction === reactionReactorsModal.emoji,
    );
  }, [reactionReactorsModal, messages]);

  const handleReactionPress = useCallback(
    async (messageId: string, emoji: string) => {
      const validated = validateReactionEmoji(emoji);
      if (!validated.ok) {
        showAlert("Emoji non supporté", validated.reason);
        return;
      }

      const msg = messages.find((m) => m.id === messageId);
      const reactions = msg?.reactions ?? [];
      const already = userHasReaction(reactions, userId, emoji);

      try {
        if (already) {
          await messagingAPI.removeReaction(messageId, userId, emoji);
        } else {
          const limits = checkReactionLimits(reactions, userId, emoji);
          if (!limits.ok) {
            showAlert("Réaction impossible", limits.reason);
            return;
          }
          await messagingAPI.addReaction(messageId, userId, emoji);
        }

        const reactionData = await messagingAPI.getMessageReactions(messageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  reactions: Array.isArray(reactionData)
                    ? reactionData
                    : reactionData?.reactions || [],
                }
              : m,
          ),
        );
      } catch (error: unknown) {
        const e = error as { message?: string };
        showAlert(
          "Réaction",
          e.message || "Impossible de mettre à jour la réaction.",
        );
        logger.error("ChatScreen", "Error toggling reaction", error);
      }
    },
    [userId, messages, setMessages],
  );

  const handleReactionDetailsPress = useCallback(
    (messageId: string, emoji: string) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setReactionReactorsModal({ messageId, emoji });
    },
    [],
  );

  const handleReactionSelectFromPicker = useCallback(
    async (emoji: string) => {
      if (reactionPickerMessageId) {
        await handleReactionPress(reactionPickerMessageId, emoji);
        setShowReactionPicker(false);
        setReactionPickerMessageId(null);
      }
    },
    [reactionPickerMessageId, handleReactionPress],
  );

  return {
    showReactionPicker,
    setShowReactionPicker,
    reactionPickerMessageId,
    setReactionPickerMessageId,
    reactionReactorsModal,
    setReactionReactorsModal,
    reactionModalList,
    resolveReactorDisplayName,
    handleReactionPress,
    handleReactionDetailsPress,
    handleReactionSelectFromPicker,
  };
}
