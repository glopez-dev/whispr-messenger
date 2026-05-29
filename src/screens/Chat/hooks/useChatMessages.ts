import { useCallback, useRef, useState } from "react";
import {
  Message,
  MessageAttachment,
  MessageReaction,
  MessageWithRelations,
} from "@/types/messaging";
import { messagingAPI } from "@/services/messaging/api";
import { cacheService } from "@/services/messaging/cache";
import { E2EEService } from "@/services/E2EEService";
import { logger } from "@/utils/logger";

const MESSAGES_PAGE_SIZE = 50;

export interface UseChatMessagesOptions {
  conversationId: string;
  /** Called once when the initial page is loaded so the sender of the
   * newest message gets a read receipt. */
  markAsRead: (conversationId: string, messageId: string) => void;
}

export interface UseChatMessagesReturn {
  messages: MessageWithRelations[];
  setMessages: React.Dispatch<React.SetStateAction<MessageWithRelations[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loadingMore: boolean;
  setLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  hasMore: boolean;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  pendingNewCount: number;
  setPendingNewCount: React.Dispatch<React.SetStateAction<number>>;
  pendingNewCountRef: React.MutableRefObject<number>;
  /** Debounced cache-write timer ID. Owned by callers that batch writes. */
  cacheWriteTimerRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  loadMessages: (before?: string) => Promise<void>;
  loadMoreMessages: () => void;
}

export function useChatMessages({
  conversationId,
  markAsRead,
}: UseChatMessagesOptions): UseChatMessagesReturn {
  // Seed from the synchronous cache so the FlatList paints in one frame
  // while the API/decrypt path runs.
  const [messages, setMessages] = useState<MessageWithRelations[]>(
    () => cacheService.getMessagesSync(conversationId) ?? [],
  );
  const [loading, setLoading] = useState(
    () => (cacheService.getMessagesSync(conversationId) ?? []).length === 0,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const pendingNewCountRef = useRef(0);
  const cacheWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMessages = useCallback(
    async (before?: string) => {
      try {
        if (before) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const data = await messagingAPI.getMessages(conversationId, {
          limit: MESSAGES_PAGE_SIZE,
          before,
        });

        // Load reactions and enrich messages
        const messagesWithRelations: MessageWithRelations[] = await Promise.all(
          data
            .filter(
              (msg) =>
                msg &&
                (msg.content ||
                  msg.is_deleted ||
                  msg.message_type === "media" ||
                  msg.message_type === "system"),
            ) // Include all message types
            .map(async (msg) => {
              let displayContent = msg.content;
              let e2eeMetadata: Record<string, unknown> = {};
              if (
                typeof msg.content === "string" &&
                E2EEService.isEncryptedPayload(msg.content)
              ) {
                const decrypted = await E2EEService.decryptTextMessage({
                  conversationId,
                  content: msg.content,
                });
                if (decrypted === null) {
                  displayContent = "Message chiffré";
                } else if (msg.message_type === "media") {
                  try {
                    const parsed = JSON.parse(decrypted);
                    if (parsed.media_key && parsed.media_nonce) {
                      displayContent = parsed.caption || "";
                      e2eeMetadata = {
                        media_key: parsed.media_key,
                        media_nonce: parsed.media_nonce,
                        e2ee: true,
                        // WHISPR-fix-video-preview-hevc-ios
                        ...(parsed.thumbnail_key && parsed.thumbnail_nonce
                          ? {
                              thumbnail_key: parsed.thumbnail_key,
                              thumbnail_nonce: parsed.thumbnail_nonce,
                            }
                          : {}),
                      };
                    } else {
                      displayContent = decrypted;
                    }
                  } catch {
                    displayContent = decrypted;
                  }
                } else {
                  displayContent = decrypted;
                }
              }
              // WHISPR-1074: the backend may ship the enriched shape
              // (delivery_statuses + status). Widen once instead of
              // per-field casts below.
              const enriched = msg as MessageWithRelations;
              // Derive delivery status: prefer explicit status, then check delivery_statuses array
              let status: NonNullable<MessageWithRelations["status"]> =
                enriched.status || ("sent" as const);
              if (status === "sent" && enriched.delivery_statuses?.length) {
                const ds = enriched.delivery_statuses;
                if (ds.some((d) => d.read_at)) {
                  status = "read";
                } else if (ds.some((d) => d.delivered_at)) {
                  status = "delivered";
                }
              }

              // Load reactions for this message
              let reactions: MessageReaction[] = [];
              try {
                const reactionData = await messagingAPI.getMessageReactions(
                  msg.id,
                );
                reactions = Array.isArray(reactionData)
                  ? reactionData
                  : reactionData?.reactions || [];
              } catch (error) {
                // Ignore errors for reactions
              }

              // Load attachments for this message
              let attachments: MessageAttachment[] = [];
              try {
                attachments = await messagingAPI.getAttachments(msg.id);
              } catch (error) {
                // Ignore errors for attachments
              }

              // reply_to is resolved against the full merged list below so
              // replies whose parent lives in a different page or is already
              // in state still render their preview. Only the parent id is
              // kept here.
              return {
                ...msg,
                content: displayContent,
                metadata: { ...(msg.metadata || {}), ...e2eeMetadata },
                status,
                reactions,
                attachments,
                reply_to: undefined,
              } as MessageWithRelations;
            }),
        );

        // Resolve reply_to against both the freshly fetched batch and the
        // already-loaded messages so paginated history (older batch arrives
        // later) doesn't drop the reply preview.
        const resolveReplies = (
          batch: MessageWithRelations[],
          pool: MessageWithRelations[],
        ): MessageWithRelations[] => {
          if (batch.length === 0) return batch;
          const lookup = new Map<string, Message>();
          for (const m of pool) lookup.set(m.id, m);
          for (const m of batch) lookup.set(m.id, m);
          return batch.map((m) =>
            m.reply_to_id && !m.reply_to
              ? { ...m, reply_to: lookup.get(m.reply_to_id) }
              : m,
          );
        };

        if (before) {
          // Loading older messages — merge, deduplicate and re-sort desc
          // so the inverted FlatList always renders newest at bottom.
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const deduped = messagesWithRelations.filter(
              (m) => !existingIds.has(m.id),
            );
            const withReplies = resolveReplies(deduped, prev);
            // Some already-loaded newer messages may reply to a message that
            // just arrived in this older batch — resolve those too so the
            // preview appears on scroll up.
            const newIds = new Set(withReplies.map((m) => m.id));
            const updatedPrev = prev.map((m) =>
              m.reply_to_id && !m.reply_to && newIds.has(m.reply_to_id)
                ? {
                    ...m,
                    reply_to: withReplies.find((n) => n.id === m.reply_to_id),
                  }
                : m,
            );
            return [...updatedPrev, ...withReplies].sort(
              (a, b) =>
                new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
            );
          });
          setHasMore(messagesWithRelations.length === MESSAGES_PAGE_SIZE);
        } else {
          // Initial load — merge with any messages already received via WS.
          // API versions take priority over cache so decrypted content
          // replaces any encrypted placeholders loaded from cache. When the
          // cache already holds the exact same fields the bubble cares about,
          // reuse its reference so memo(MessageBubble) can skip the re-render.
          setMessages((prev) => {
            const prevById = new Map(prev.map((m) => [m.id, m]));
            const reconciled = messagesWithRelations.map((api) => {
              const cached = prevById.get(api.id);
              if (!cached) return api;
              const sameContent = cached.content === api.content;
              const sameStatus = cached.status === api.status;
              const sameEdited = cached.edited_at === api.edited_at;
              const sameDeleted = cached.is_deleted === api.is_deleted;
              const sameMessageType = cached.message_type === api.message_type;
              const sameForwarded =
                cached.forwarded_from_id === api.forwarded_from_id;
              const cachedMeta = cached.metadata as
                | Record<string, any>
                | undefined;
              const apiMeta = api.metadata as Record<string, any> | undefined;
              const sameMeta =
                cachedMeta?.media_url === apiMeta?.media_url &&
                cachedMeta?.blockedByModeration ===
                  apiMeta?.blockedByModeration &&
                cachedMeta?.appealRejected === apiMeta?.appealRejected &&
                cachedMeta?.forwarded === apiMeta?.forwarded &&
                cachedMeta?.media_key === apiMeta?.media_key &&
                cachedMeta?.media_nonce === apiMeta?.media_nonce &&
                cachedMeta?.e2ee === apiMeta?.e2ee &&
                (cachedMeta?.link_preview as { url?: string } | undefined)
                  ?.url ===
                  (apiMeta?.link_preview as { url?: string } | undefined)?.url;
              // `undefined` and `[]` are semantically the same here: the
              // preload writes messages without reactions/attachments, so the
              // cache may store `undefined` while the API normalizes to `[]`.
              const cachedReactions = cached.reactions ?? [];
              const apiReactions = api.reactions ?? [];
              const sameReactions =
                JSON.stringify(cachedReactions) ===
                JSON.stringify(apiReactions);
              // Same approach for attachments — compare structurally rather
              // than by reference because the API always builds new objects.
              // Catches "attachments arrived from the API but were missing
              // from the preload-served cache entry".
              const cachedAttachments = cached.attachments ?? [];
              const apiAttachments = api.attachments ?? [];
              const sameAttachments =
                JSON.stringify(cachedAttachments) ===
                JSON.stringify(apiAttachments);
              if (
                sameContent &&
                sameStatus &&
                sameEdited &&
                sameDeleted &&
                sameMessageType &&
                sameForwarded &&
                sameMeta &&
                sameReactions &&
                sameAttachments
              ) {
                return cached;
              }
              return api;
            });
            const apiById = new Map(reconciled.map((m) => [m.id, m]));
            const wsOnly = prev.filter((m) => !apiById.has(m.id));
            const withReplies = resolveReplies(
              [...reconciled, ...wsOnly],
              [...reconciled, ...wsOnly],
            );
            return withReplies.sort(
              (a, b) =>
                new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
            );
          });
          setHasMore(messagesWithRelations.length === MESSAGES_PAGE_SIZE);
          // Mark the newest message as read so the sender gets a read receipt
          if (messagesWithRelations.length > 0) {
            markAsRead(conversationId, messagesWithRelations[0].id);
          }
        }
      } catch (error) {
        logger.error("ChatScreen", "Error loading messages", error);
        if (!before) {
          setMessages([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [conversationId, markAsRead],
  );

  const loadMoreMessages = useCallback(() => {
    if (loadingMore || !hasMore || messages.length === 0) {
      return;
    }

    const oldestMessage = messages[messages.length - 1];
    void loadMessages(oldestMessage.sent_at);
  }, [messages, loadingMore, hasMore, loadMessages]);

  return {
    messages,
    setMessages,
    loading,
    setLoading,
    loadingMore,
    setLoadingMore,
    hasMore,
    setHasMore,
    pendingNewCount,
    setPendingNewCount,
    pendingNewCountRef,
    cacheWriteTimerRef,
    loadMessages,
    loadMoreMessages,
  };
}
