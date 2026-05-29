import { useCallback, useState } from "react";
import { MessageWithRelations, PinnedMessage } from "@/types/messaging";
import { messagingAPI } from "@/services/messaging/api";
import { logger } from "@/utils/logger";

export interface UsePinnedMessagesOptions {
  conversationId: string;
  selectedMessage: MessageWithRelations | null;
  setMessages: React.Dispatch<React.SetStateAction<MessageWithRelations[]>>;
}

export interface UsePinnedMessagesReturn {
  pinnedMessages: PinnedMessage[];
  setPinnedMessages: React.Dispatch<React.SetStateAction<PinnedMessage[]>>;
  showPinnedBar: boolean;
  setShowPinnedBar: React.Dispatch<React.SetStateAction<boolean>>;
  loadPinnedMessages: () => Promise<void>;
  handlePinMessage: () => Promise<void>;
}

export function usePinnedMessages({
  conversationId,
  selectedMessage,
  setMessages,
}: UsePinnedMessagesOptions): UsePinnedMessagesReturn {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [showPinnedBar, setShowPinnedBar] = useState(true);

  const loadPinnedMessages = useCallback(async () => {
    try {
      const pinned = await messagingAPI.getPinnedMessages(conversationId);
      setPinnedMessages(pinned);
    } catch (error) {
      logger.error("ChatScreen", "Error loading pinned messages", error);
      setPinnedMessages([]);
    }
  }, [conversationId]);

  const handlePinMessage = useCallback(async () => {
    if (!selectedMessage) return;

    try {
      const isCurrentlyPinned = pinnedMessages.some(
        (m) => (m.messageId ?? m.message?.id) === selectedMessage.id,
      );

      if (isCurrentlyPinned) {
        // Optimistically remove from the pinned bar so the banner disappears
        // immediately, even if the refresh below races the server.
        setPinnedMessages((prev) =>
          prev.filter(
            (m) => (m.messageId ?? m.message?.id) !== selectedMessage.id,
          ),
        );
        await messagingAPI.unpinMessage(conversationId, selectedMessage.id);
      } else {
        await messagingAPI.pinMessage(conversationId, selectedMessage.id);
        // Re-open the bar when the user just pinned a new message after
        // having manually closed it.
        setShowPinnedBar(true);
      }

      await loadPinnedMessages();

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === selectedMessage.id
            ? { ...msg, is_pinned: !isCurrentlyPinned }
            : msg,
        ),
      );
    } catch (error) {
      const isCurrentlyPinned = pinnedMessages.some(
        (m) => (m.messageId ?? m.message?.id) === selectedMessage.id,
      );
      logger.error(
        "ChatScreen",
        `Error ${isCurrentlyPinned ? "unpinning" : "pinning"} message`,
        error,
      );
    }
  }, [
    selectedMessage,
    conversationId,
    pinnedMessages,
    loadPinnedMessages,
    setMessages,
  ]);

  return {
    pinnedMessages,
    setPinnedMessages,
    showPinnedBar,
    setShowPinnedBar,
    loadPinnedMessages,
    handlePinMessage,
  };
}
