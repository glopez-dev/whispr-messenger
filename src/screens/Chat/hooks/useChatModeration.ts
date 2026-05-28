import { useCallback, useEffect, useState } from "react";
import { MessageWithRelations } from "../../../types/messaging";
import { useModerationStore } from "../../../store/moderationStore";
import { appealsAPI } from "../../../services/moderation/moderationApi";
import { getSharedSocket } from "../../../services/messaging/websocket";
import { logger } from "../../../utils/logger";

const APPEAL_POLL_INTERVAL_MS = 10_000;

type SendMediaFn = (
  uri: string,
  type: "image" | "video" | "file" | "audio",
  replyToId?: string,
  caption?: string,
  opts?: {
    skipGate?: boolean;
    duration?: number;
    mimeType?: string;
    filename?: string;
  },
) => Promise<unknown>;

export interface AppealModalState {
  visible: boolean;
  imageUri: string;
  blockReason?: string;
  scores?: Record<string, number>;
  messageTempId: string;
}

export interface UseChatModerationOptions {
  userId: string;
  setMessages: React.Dispatch<React.SetStateAction<MessageWithRelations[]>>;
  handleSendMediaRef: React.MutableRefObject<SendMediaFn>;
}

export interface UseChatModerationReturn {
  appealModal: AppealModalState | null;
  setAppealModal: React.Dispatch<React.SetStateAction<AppealModalState | null>>;
  showReportSheet: boolean;
  setShowReportSheet: React.Dispatch<React.SetStateAction<boolean>>;
  reportSheetMessage: MessageWithRelations | null;
  setReportSheetMessage: React.Dispatch<
    React.SetStateAction<MessageWithRelations | null>
  >;
  applyBlockedImageDecision: (
    messageTempId: string,
    decision: "approved" | "rejected",
  ) => void;
}

export function useChatModeration({
  userId,
  setMessages,
  handleSendMediaRef,
}: UseChatModerationOptions): UseChatModerationReturn {
  const [appealModal, setAppealModal] = useState<AppealModalState | null>(null);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reportSheetMessage, setReportSheetMessage] =
    useState<MessageWithRelations | null>(null);

  const handleAppealDecision = useModerationStore(
    (s) => s.handleAppealDecision,
  );
  const cleanupAppeal = useModerationStore((s) => s.cleanupAppeal);

  // Applies an admin decision on a blocked-image appeal.
  // On approve: re-submit the original image bypassing the gate.
  // On reject: annotate the bubble so the user sees "Refusée par l'admin".
  const applyBlockedImageDecision = useCallback(
    (messageTempId: string, decision: "approved" | "rejected") => {
      const current =
        useModerationStore.getState().pendingAppeals[messageTempId];
      if (!current || current.status !== "pending") return;

      handleAppealDecision({ messageTempId, decision });

      // Prefer the base64 data URI when available (survives web logout) and
      // fall back to the native file URI.
      const replayUri = current?.localDataUri || current?.localUri;

      if (decision === "approved" && replayUri) {
        handleSendMediaRef
          .current(replayUri, "image", undefined, undefined, {
            skipGate: true,
          })
          .catch((err) =>
            logger.warn("ChatScreen", "re-submit after appeal failed", err),
          )
          .finally(() => {
            cleanupAppeal(messageTempId).catch(() => {});
          });
      } else if (decision === "rejected") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageTempId
              ? {
                  ...m,
                  metadata: {
                    ...(m.metadata || {}),
                    appealRejected: true,
                  },
                  content: "Refusée par l'admin",
                }
              : m,
          ),
        );
        cleanupAppeal(messageTempId).catch(() => {});
      }
    },
    [cleanupAppeal, handleAppealDecision, setMessages, handleSendMediaRef],
  );

  // WebSocket listener for admin decisions on blocked-image appeals.
  useEffect(() => {
    if (!userId) return;
    let socket: ReturnType<typeof getSharedSocket>;
    try {
      socket = getSharedSocket();
    } catch {
      return;
    }
    const channel = socket.channel(`user:${userId}`);
    const onDecision = (data: unknown) => {
      const payload = data as {
        messageTempId?: string;
        message_temp_id?: string;
        decision?: "approved" | "rejected";
      };
      const messageTempId = payload?.messageTempId || payload?.message_temp_id;
      const decision = payload?.decision;
      if (!messageTempId || !decision) return;

      applyBlockedImageDecision(messageTempId, decision);
    };
    channel.on("blocked_image_decision", onDecision);
    // Phoenix only routes broadcasts to channels that have actually joined
    // their topic. Without this, the backend `Endpoint.broadcast("user:<id>",
    // "blocked_image_decision", ...)` never reaches the callback.
    channel.join().catch((err) => {
      logger.warn("ChatScreen", "user channel join failed", err);
    });
    return () => {
      channel.off("blocked_image_decision", onDecision);
    };
  }, [userId, applyBlockedImageDecision]);

  // Polling fallback: if the WebSocket event is ever missed (connection loss,
  // backend hiccup, app relaunch before the broadcast lands), poll the user-
  // service for the status of every pending appeal and apply the decision as
  // if it had come over the socket.
  useEffect(() => {
    if (!userId) return;

    const statusToDecision = (
      status: string,
    ): "approved" | "rejected" | null =>
      status === "accepted"
        ? "approved"
        : status === "rejected"
          ? "rejected"
          : null;

    const pollOnce = async () => {
      const pending = useModerationStore.getState().pendingAppeals;
      const entries = Object.entries(pending).filter(
        ([, v]) => v.status === "pending",
      );
      if (entries.length === 0) return;

      await Promise.all(
        entries.map(async ([messageTempId, entry]) => {
          try {
            const appeal = await appealsAPI.getAppeal(entry.appealId);
            const decision = statusToDecision(appeal.status);
            if (decision) {
              applyBlockedImageDecision(messageTempId, decision);
            }
          } catch (err) {
            logger.warn("ChatScreen", "appeal poll failed", {
              appealId: entry.appealId,
              err,
            });
          }
        }),
      );
    };

    // Kick off an immediate check so a decision that landed while the app was
    // closed is picked up as soon as the chat opens.
    pollOnce().catch(() => {});
    const id = setInterval(() => {
      pollOnce().catch(() => {});
    }, APPEAL_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, applyBlockedImageDecision]);

  return {
    appealModal,
    setAppealModal,
    showReportSheet,
    setShowReportSheet,
    reportSheetMessage,
    setReportSheetMessage,
    applyBlockedImageDecision,
  };
}
