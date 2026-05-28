import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import {
  Conversation,
  Message,
  MessageWithRelations,
} from "../../../types/messaging";
import { messagingAPI } from "../../../services/messaging/api";
import { E2EEService } from "../../../services/E2EEService";
import { offlineQueue, QueuedMessage } from "../../../services/offlineQueue";
import { useConversationsStore } from "../../../store/conversationsStore";
import { generateClientRandom } from "../../../utils/crypto";
import { logger } from "../../../utils/logger";

export interface UseChatComposerOptions {
  conversationId: string;
  userId: string;
  conversation: Conversation | null;
  connectionState: string;
  editingMessage: MessageWithRelations | null;
  replyingTo: Message | null;
  e2eeEnabledRef: React.MutableRefObject<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<MessageWithRelations[]>>;
  setEditingMessage: React.Dispatch<
    React.SetStateAction<MessageWithRelations | null>
  >;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  sendTyping: (conversationId: string, typing: boolean) => void;
  scrollToBottom: () => void;
  getLocalizedText: (key: string) => string;
}

export interface UseChatComposerReturn {
  /** ref-lock shared with media send so a double-tap can't fire twice. */
  sendingRef: React.MutableRefObject<boolean>;
  handleSendMessage: (
    content: string,
    replyToId?: string,
    mentions?: string[],
  ) => Promise<void>;
}

export function useChatComposer({
  conversationId,
  userId,
  conversation,
  connectionState,
  editingMessage,
  replyingTo,
  e2eeEnabledRef,
  setMessages,
  setEditingMessage,
  setReplyingTo,
  sendTyping,
  scrollToBottom,
  getLocalizedText,
}: UseChatComposerOptions): UseChatComposerReturn {
  const sendingRef = useRef(false);

  const handleSendMessage = useCallback(
    async (content: string, replyToId?: string, _mentions?: string[]) => {
      // ref-lock : sur connexion lente, un double-tap genererait 2 messages
      // avec des client_random differents (donc pas dedup serveur). On ignore
      // les calls concurrents sans desactiver le bouton (UX intacte).
      if (sendingRef.current) return;
      sendingRef.current = true;
      try {
        // Stop typing indicator
        sendTyping(conversationId, false);

        // If editing, update the message
        if (editingMessage) {
          try {
            let outgoingEditContent = content;
            if (e2eeEnabledRef.current) {
              const memberIds =
                conversation?.member_user_ids ||
                conversation?.members?.map(
                  (m: { user_id: string }) => m.user_id,
                );
              const otherUserId = memberIds?.find(
                (id: string) => id !== userId,
              );
              if (conversation?.type === "direct" && otherUserId) {
                const enc = await E2EEService.encryptDirectTextMessage({
                  conversationId,
                  plaintext: content,
                  clientRandom:
                    typeof editingMessage.client_random === "number"
                      ? editingMessage.client_random
                      : generateClientRandom(),
                  recipientUserId: otherUserId,
                });
                outgoingEditContent = enc.content;
              }
            }
            const updated = await messagingAPI.editMessage(
              editingMessage.id,
              conversationId,
              outgoingEditContent,
            );
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === editingMessage.id
                  ? {
                      ...msg,
                      ...updated,
                      content,
                      edited_at: updated.edited_at,
                    }
                  : msg,
              ),
            );
            setEditingMessage(null);
            useConversationsStore
              .getState()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .applyMessageUpdated({ ...(updated as any), content } as any);
          } catch (error) {
            logger.error("ChatScreen", "Error editing message", error);
            Alert.alert(
              getLocalizedText("notif.error"),
              getLocalizedText("chat.errorEditMessage"),
            );
            setEditingMessage(null);
          }
          return;
        }

        const tempMessage: MessageWithRelations = {
          id: `temp-${Date.now()}`,
          conversation_id: conversationId,
          sender_id: userId,
          message_type: "text",
          content,
          metadata: {},
          // crypto random Uint32 pour eviter birthday collision sur dedup serveur
          client_random: generateClientRandom(),
          sent_at: new Date().toISOString(),
          is_deleted: false,
          delete_for_everyone: false,
          status: "sending",
          reply_to_id: replyToId,
          reply_to: replyingTo || undefined,
        };

        setMessages((prev) => [tempMessage, ...prev]);
        setReplyingTo(null);
        useConversationsStore
          .getState()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .applyNewMessage(tempMessage as any, userId)
          .catch(() => {});
        useConversationsStore.getState().resetUnreadCount(conversationId);

        // Scroll to bottom so the newly sent text message is visible
        setTimeout(() => {
          scrollToBottom();
        }, 50);

        // If offline, queue the message for later delivery
        if (connectionState !== "connected") {
          const queued: QueuedMessage = {
            id: tempMessage.id,
            conversation_id: conversationId,
            content,
            message_type: "text",
            client_random: tempMessage.client_random as number,
            reply_to_id: replyToId,
            queued_at: new Date().toISOString(),
          };
          await offlineQueue.enqueue(queued);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempMessage.id ? { ...m, status: "queued" as const } : m,
            ),
          );
          useConversationsStore
            .getState()
            .applyNewMessage(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { ...tempMessage, status: "queued" } as any,
              userId,
            )
            .catch(() => {});
          useConversationsStore.getState().resetUnreadCount(conversationId);
          return;
        }

        try {
          let outgoingContent = content;

          // Blind the server: always use E2EE for direct chats if possible,
          // or if explicitly enabled via metadata (for groups).
          const shouldEncrypt =
            conversation?.metadata?.e2ee?.enabled === true ||
            (conversation?.type === "direct" &&
              !conversation?.metadata?.e2ee?.disabled);

          if (shouldEncrypt) {
            const memberIds =
              conversation?.member_user_ids ||
              conversation?.members?.map((m: { user_id: string }) => m.user_id);
            const otherUserIds =
              memberIds?.filter((id: string) => id !== userId) || [];

            if (otherUserIds.length > 0) {
              try {
                const enc = await E2EEService.encryptMessageForConversation({
                  conversationId,
                  plaintext: content,
                  clientRandom: tempMessage.client_random as number,
                  recipientUserIds: otherUserIds,
                });
                outgoingContent = enc.content;
              } catch (encErr: unknown) {
                logger.warn(
                  "ChatScreen",
                  "E2EE encryption failed, falling back to cleartext if not mandatory",
                  encErr,
                );
                // If metadata explicitly REQUIRES E2EE, we must fail
                if (conversation?.metadata?.e2ee?.enabled === true) {
                  let userMsg = "Impossible de chiffrer le message.";
                  const encMsg = (encErr as { message?: string })?.message;
                  if (encMsg === "RECIPIENT_NO_DEVICES") {
                    userMsg =
                      "Le destinataire n'a pas encore configuré le chiffrement E2E.";
                  } else if (encMsg === "NO_IDENTITY_KEY") {
                    userMsg =
                      "Vos clés de chiffrement ne sont pas encore prêtes. Réessayez dans un instant.";
                  }
                  Alert.alert("Erreur E2EE", userMsg);
                  throw encErr;
                }
                // Otherwise (auto-e2ee for 1v1), we fallback to cleartext
                // if the recipient is not E2EE-ready yet.
                outgoingContent = content;
              }
            }
          }

          const sent = await messagingAPI.sendMessage(conversationId, {
            content: outgoingContent,
            message_type: "text",
            client_random: tempMessage.client_random as number,
            metadata: {},
            reply_to_id: replyToId,
          });

          setMessages((prev) => {
            const next: MessageWithRelations[] = prev.map((m) => {
              if (
                m.id.startsWith("temp-") &&
                m.client_random === tempMessage.client_random
              ) {
                const updated: MessageWithRelations = {
                  ...(sent as MessageWithRelations),
                  content,
                  status: "sent" as const,
                  reply_to: tempMessage.reply_to,
                };
                return updated;
              }
              return m;
            });
            return next;
          });
          useConversationsStore
            .getState()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .applyNewMessage({ ...(sent as any), content } as any, userId)
            .catch(() => {});
          useConversationsStore.getState().resetUnreadCount(conversationId);
        } catch (error: unknown) {
          logger.error("ChatScreen", "Error sending message", error);
          const errBody = (error as { body?: unknown })?.body;
          if (errBody) {
            logger.error("ChatScreen", "Send 422 body", errBody);
          }
          setMessages((prev) => {
            return prev.map((m) => {
              if (m.id === tempMessage.id) {
                return { ...m, status: "failed" };
              }
              return m;
            });
          });
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [
      conversationId,
      userId,
      conversation,
      sendTyping,
      editingMessage,
      replyingTo,
      connectionState,
      e2eeEnabledRef,
      setMessages,
      setEditingMessage,
      setReplyingTo,
      scrollToBottom,
      getLocalizedText,
    ],
  );

  return { sendingRef, handleSendMessage };
}
