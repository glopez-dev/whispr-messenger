import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import {
  Conversation,
  Message,
  MessageWithRelations,
} from "../../../types/messaging";
import type { MediaUploadPhase } from "../../../types/mediaUpload";
import { messagingAPI } from "../../../services/messaging/api";
import { E2EEService } from "../../../services/E2EEService";
import { MediaService } from "../../../services/MediaService";
import {
  gateChatImageBeforeSend,
  gateChatVideoBeforeSend,
} from "../../../services/moderation";
import { offlineQueue, QueuedMessage } from "../../../services/offlineQueue";
import { useConversationsStore } from "../../../store/conversationsStore";
import { generateClientRandom } from "../../../utils/crypto";
import { logger } from "../../../utils/logger";
import { showAlert } from "../../../utils/alert";
import { canonicalizeMimeType, resolveMimeType } from "../../../utils/mime";
import {
  forceAudioUploadIdentity,
  remapAudioUploadUri,
} from "../../../utils/audioUpload";
import { convertHeicToJpeg } from "../../../utils/imageCompression";
import { extractVideoPoster } from "../../../utils/videoPoster";
import { mapMediaUploadError } from "../../../utils/mapMediaUploadError";
import { resolveConversationMemberIds } from "../../../utils/resolveMembers";
import type { AppealModalState } from "./useChatModeration";

const DEFAULT_MEDIA_CAPTION: Record<
  "image" | "video" | "audio" | "file",
  string
> = {
  image: "Photo",
  video: "Vidéo",
  audio: "Message vocal",
  file: "Fichier",
};

export type SendMediaType = "image" | "video" | "file" | "audio";

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
  // Media-send dependencies
  e2eeEnabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allConversations: any[];
  conversationMembers: Array<{ id: string }>;
  setAppealModal: React.Dispatch<React.SetStateAction<AppealModalState | null>>;
}

export interface UseChatComposerReturn {
  /** ref-lock shared with media send so a double-tap can't fire twice. */
  sendingRef: React.MutableRefObject<boolean>;
  handleSendMessage: (
    content: string,
    replyToId?: string,
    mentions?: string[],
  ) => Promise<void>;
  handleSendMedia: (
    uri: string,
    type: SendMediaType,
    replyToId?: string,
    caption?: string,
    opts?: {
      skipGate?: boolean;
      duration?: number;
      mimeType?: string;
      filename?: string;
    },
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
  e2eeEnabled,
  allConversations,
  conversationMembers,
  setAppealModal,
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

  const handleSendMedia = useCallback(
    async (
      uri: string,
      type: SendMediaType,
      replyToId?: string,
      caption?: string,
      opts?: {
        skipGate?: boolean;
        duration?: number;
        mimeType?: string;
        filename?: string;
      },
    ) => {
      // Stop typing indicator
      sendTyping(conversationId, false);

      // Use caption if provided, otherwise use default text
      const messageContent = caption?.trim() || DEFAULT_MEDIA_CAPTION[type];

      // Derive filename and MIME type from the local URI
      const rawFilename = opts?.filename || uri.split("/").pop() || "media";
      const extension = rawFilename.split(".").pop()?.toLowerCase() || "";
      const rawMimeType = canonicalizeMimeType(
        opts?.mimeType || resolveMimeType(extension, type),
      );
      const { filename, mimeType } =
        type === "audio"
          ? forceAudioUploadIdentity(rawFilename, rawMimeType)
          : { filename: rawFilename, mimeType: rawMimeType };
      const uploadUri =
        type === "audio"
          ? await remapAudioUploadUri(uri, filename, mimeType)
          : uri;
      const audioDuration =
        type === "audio" && typeof opts?.duration === "number"
          ? Math.max(1, Math.round(opts.duration))
          : undefined;

      // Create optimistic message with local URI for instant preview
      const tempMessageId = `temp-${Date.now()}`;
      const tempMessage: MessageWithRelations = {
        id: tempMessageId,
        conversation_id: conversationId,
        sender_id: userId,
        message_type: "media",
        content: messageContent,
        metadata: {
          media_type: type,
          media_url: uploadUri,
          thumbnail_url: uploadUri,
          duration: audioDuration,
          localUri: uploadUri,
          uploadPhase: "moderation" as MediaUploadPhase,
        },
        // crypto random Uint32 pour eviter birthday collision sur dedup serveur
        client_random: generateClientRandom(),
        sent_at: new Date().toISOString(),
        is_deleted: false,
        delete_for_everyone: false,
        status: "sending",
        reply_to_id: replyToId,
        reply_to: replyingTo || undefined,
        attachments: [
          {
            id: `att-temp-${Date.now()}`,
            message_id: tempMessageId,
            media_id: `media-temp-${Date.now()}`,
            media_type: type,
            metadata: {
              filename,
              media_url: uploadUri,
              thumbnail_url: uploadUri,
              mime_type: mimeType,
              duration: audioDuration,
            },
            created_at: new Date().toISOString(),
          },
        ],
      };

      setMessages((prev) => [tempMessage, ...prev]);
      setReplyingTo(null);
      useConversationsStore
        .getState()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .applyNewMessage(tempMessage as any, userId)
        .catch(() => {});
      useConversationsStore.getState().resetUnreadCount(conversationId);

      // Scroll to bottom so the newly sent media message is visible
      setTimeout(() => {
        scrollToBottom();
      }, 50);

      // Kick off the authoritative member fetch in parallel with the upload.
      // RLS on media-service requires the recipient to be in shared_with, so
      // we MUST have the right IDs before calling shareMedia. Starting this
      // fetch now hides the network round-trip behind upload latency.
      // Wrap into a settled-result promise so a rejection is never an
      // unhandled rejection if we exit early (gate block, upload error).
      const membersFetchSettled: Promise<{
        ok: boolean;
        value?: Array<{ id: string }>;
      }> = messagingAPI
        .getConversationMembers(conversationId)
        .then((value) => ({ ok: true, value }))
        .catch((err) => {
          logger.warn(
            "ChatScreen.handleSendMedia",
            "getConversationMembers failed; will fall back to in-memory IDs",
            err,
          );
          return { ok: false };
        });

      try {
        // Gate check: block inappropriate images / videos before upload.
        // gateChatVideoBeforeSend is a no-op when the selected moderation
        // model is v2 (which has no video training signal).
        if ((type === "image" || type === "video") && !opts?.skipGate) {
          const gateResult =
            type === "image"
              ? await gateChatImageBeforeSend(uploadUri)
              : await gateChatVideoBeforeSend(uploadUri);
          if (!gateResult.ok) {
            const blockedReason =
              gateResult.reason || "Contenu bloqué par la modération";
            // Keep message in chat but mark as blocked, and annotate
            // metadata so the bubble can offer a "Contester" action.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempMessageId
                  ? {
                      ...m,
                      status: "failed" as const,
                      content: blockedReason,
                      metadata: {
                        ...(m.metadata || {}),
                        blockedByModeration: true,
                        blockReason: blockedReason,
                        scores: gateResult.scores,
                        localUri: uploadUri,
                      },
                    }
                  : m,
              ),
            );
            // Open the appeal modal so the user can contest immediately.
            setAppealModal({
              visible: true,
              imageUri: uploadUri,
              blockReason: blockedReason,
              scores: gateResult.scores,
              messageTempId: tempMessageId,
            });
            return;
          }
        }

        const patchTempUploadMeta = (
          meta: Record<string, unknown>,
          extra?: Partial<MessageWithRelations>,
        ) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempMessageId
                ? {
                    ...m,
                    ...extra,
                    metadata: { ...(m.metadata || {}), ...meta },
                  }
                : m,
            ),
          );
        };

        patchTempUploadMeta({
          uploadPhase: "uploading",
          uploadProgress: 0,
        });

        // Conversion HEIC → JPEG avant upload : les navigateurs Chrome/Firefox
        // ne décodent pas HEIC nativement → carré noir côté receveur sur PWA.
        // On convertit ici, avant E2EE, pour que le ciphertext porte du JPEG.
        let finalUri = uploadUri;
        let finalFilename = filename;
        let finalMimeType = mimeType;
        if (type === "image") {
          const heicResult = await convertHeicToJpeg(uploadUri, filename);
          if (heicResult != null) {
            finalUri = heicResult.uri;
            finalMimeType = heicResult.mimeType;
            finalFilename = heicResult.filename;
          } else if (
            mimeType === "image/heic" ||
            mimeType === "image/heif" ||
            filename.match(/\.(heic|heif)$/i)
          ) {
            // Conversion échouée sur un fichier HEIC confirmé : log + fallback HEIC
            logger.warn(
              "ChatScreen.handleSendMedia",
              "HEIC→JPEG conversion failed, uploading original HEIC (may render black on Chrome/Firefox)",
            );
          }
        }

        // E2EE for media: blind the server
        const shouldEncrypt = e2eeEnabled || conversation?.type === "direct";
        let finalUploadUri = finalUri;
        let uploadMimeType = finalMimeType;
        let e2eeMediaMeta: { key: string; nonce: string } | undefined;

        if (shouldEncrypt) {
          try {
            const encMedia = await E2EEService.encryptMediaFile(finalUri);
            finalUploadUri = encMedia.encryptedUri;
            e2eeMediaMeta = { key: encMedia.key, nonce: encMedia.nonce };
            // The ciphertext no longer matches the original image/video magic
            // bytes, so the server-side magic-bytes validator rejects it as 415
            // when declared as image/jpeg etc. Upload as opaque octet-stream;
            // the real MIME stays in the message attachment metadata for the
            // recipient to decode after decryption.
            uploadMimeType = "application/octet-stream";
          } catch (encErr) {
            logger.warn(
              "ChatScreen",
              "E2EE media encryption failed, falling back to cleartext unless mandatory",
              encErr,
            );
            if (e2eeEnabled) throw encErr;
          }
        }

        // WHISPR-fix-video-preview-hevc-ios : pour les vidéos, on extrait
        // un poster JPEG côté client. Sinon le composant MediaMessage tente
        // <Video> sur le blob déchiffré pour générer la preview de liste,
        // ce qui casse iOS sur HEVC/.mov avec AVErrorFileFormatNotRecognized
        // (-11828). Le poster est uploadé séparément ; en E2EE il est chiffré
        // avec sa propre clé/nonce.
        let posterUpload:
          | {
              id: string;
              url: string;
              key?: string;
              nonce?: string;
            }
          | undefined;
        if (type === "video") {
          try {
            const poster = await extractVideoPoster(uploadUri, finalFilename);
            if (poster) {
              let posterUploadUri = poster.uri;
              let posterMime: string = poster.mimeType;
              let posterE2ee: { key: string; nonce: string } | undefined;
              if (shouldEncrypt) {
                try {
                  const encPoster = await E2EEService.encryptMediaFile(
                    poster.uri,
                  );
                  posterUploadUri = encPoster.encryptedUri;
                  posterE2ee = { key: encPoster.key, nonce: encPoster.nonce };
                  posterMime = "application/octet-stream";
                } catch (posterEncErr) {
                  logger.warn(
                    "ChatScreen.handleSendMedia",
                    "Poster encryption failed, falling back to plaintext poster",
                    posterEncErr,
                  );
                }
              }
              const posterResult = await MediaService.uploadMedia(
                {
                  uri: posterUploadUri,
                  name: poster.filename,
                  type: posterMime,
                },
                undefined,
                { context: "message", ownerId: userId },
              );
              posterUpload = {
                id: posterResult.id,
                url: posterResult.url,
                key: posterE2ee?.key,
                nonce: posterE2ee?.nonce,
              };
            }
          } catch (posterErr) {
            logger.warn(
              "ChatScreen.handleSendMedia",
              "Video poster extraction/upload failed, falling back to placeholder preview",
              posterErr,
            );
          }
        }

        // 1. Upload file to media-service (encrypted or plain)
        const uploadResult = await MediaService.uploadMedia(
          { uri: finalUploadUri, name: finalFilename, type: uploadMimeType },
          (percent) => {
            patchTempUploadMeta({
              uploadPhase: "uploading",
              uploadProgress: percent,
            });
          },
          { context: "message", ownerId: userId },
        );

        // Build metadata with the remote URLs from the upload result
        let resolvedDuration = audioDuration;
        if (type === "audio" && resolvedDuration == null) {
          resolvedDuration =
            (uploadResult as typeof uploadResult & { duration?: number })
              .duration ?? undefined;
          if (resolvedDuration == null) {
            try {
              const uploadedMetadata = await MediaService.getMediaMetadata(
                uploadResult.id,
              );
              if (typeof uploadedMetadata.duration === "number") {
                resolvedDuration = Math.max(
                  1,
                  Math.round(uploadedMetadata.duration),
                );
              }
            } catch (durationError) {
              logger.warn(
                "ChatScreen.handleSendMedia",
                "Unable to fetch uploaded audio duration",
                durationError,
              );
            }
          }
        }

        const mediaMetadata: Record<string, unknown> = {
          media_type: type,
          media_id: uploadResult.id,
          media_url: uploadResult.url,
          thumbnail_url: posterUpload
            ? posterUpload.url
            : uploadResult.thumbnail_url || uploadResult.url,
          filename: uploadResult.filename || finalFilename,
          mime_type: uploadResult.mime_type || finalMimeType,
          size: uploadResult.size,
          duration: resolvedDuration,
        };
        // WHISPR-fix-video-preview-hevc-ios : si on a réussi à uploader un
        // poster séparé, on attache son id et (en E2EE) sa clé/nonce. Le
        // récepteur s'en sert pour rendre une <Image> au lieu de tenter
        // <Video> sur le blob déchiffré.
        if (posterUpload) {
          mediaMetadata.thumbnail_id = posterUpload.id;
          if (posterUpload.key && posterUpload.nonce) {
            mediaMetadata.thumbnail_key = posterUpload.key;
            mediaMetadata.thumbnail_nonce = posterUpload.nonce;
          }
        }

        // Update optimistic message with remote URLs so preview uses the hosted image
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessageId
              ? {
                  ...msg,
                  metadata: mediaMetadata,
                  attachments: msg.attachments?.map((att) => ({
                    ...att,
                    media_id: uploadResult.id,
                    metadata: {
                      ...att.metadata,
                      media_url: uploadResult.url,
                      thumbnail_url:
                        uploadResult.thumbnail_url || uploadResult.url,
                      mime_type: uploadResult.mime_type || finalMimeType,
                      duration: resolvedDuration,
                    },
                  })),
                }
              : msg,
          ),
        );

        patchTempUploadMeta({
          uploadPhase: "sharing",
          uploadProgress: undefined,
        });

        // 2. Share media with all conversation participants so they can access it.
        // The fetch was started before upload (see membersFetchSettled above)
        // so it has either already resolved or is about to.
        const fetchPromise: Promise<Array<{ id: string }>> =
          membersFetchSettled.then((r) => {
            if (!r.ok || !r.value) {
              throw new Error("getConversationMembers failed");
            }
            return r.value;
          });
        const { memberIds } = await resolveConversationMemberIds(
          {
            conversation,
            allConversations,
            conversationMembers,
            conversationId,
          },
          fetchPromise,
          {
            selfId: userId,
            fetchMembers: (id) => messagingAPI.getConversationMembers(id),
          },
        );

        if (memberIds.length === 0) {
          // No recipients found anywhere — surface this to the user, the
          // recipient will not be able to open the media without a share.
          logger.error(
            "ChatScreen.handleSendMedia",
            "No recipients resolved for conversation, media will be inaccessible",
            { conversationId, mediaId: uploadResult.id },
          );
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempMessageId
                ? {
                    ...msg,
                    metadata: {
                      ...(msg.metadata || {}),
                      shareWarning: true,
                    },
                  }
                : msg,
            ),
          );
          showAlert(
            "Partage du média",
            "Impossible de partager le média avec les destinataires. Ils ne pourront peut-être pas l'ouvrir.",
          );
        } else {
          try {
            await MediaService.shareMediaWithRetry(uploadResult.id, memberIds);
          } catch (err) {
            logger.error(
              "ChatScreen.handleSendMedia",
              "shareMedia failed after retries",
              err,
            );
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempMessageId
                  ? {
                      ...msg,
                      metadata: {
                        ...(msg.metadata || {}),
                        shareWarning: true,
                      },
                    }
                  : msg,
              ),
            );
            showAlert(
              "Partage du média",
              "Le média a été envoyé mais le partage a échoué. Le destinataire pourrait ne pas pouvoir l'ouvrir.",
            );
          }
        }

        patchTempUploadMeta({
          uploadPhase: "sending",
          uploadProgress: undefined,
        });

        // 3. Send message via messaging-service with remote media URLs
        let finalContent = messageContent;

        if (e2eeMediaMeta) {
          const memberIdsForEnc =
            conversation?.member_user_ids ||
            conversation?.members?.map((m: { user_id: string }) => m.user_id);
          const otherUserIds =
            memberIdsForEnc?.filter((id: string) => id !== userId) || [];

          if (otherUserIds.length > 0) {
            try {
              const mediaPayload = JSON.stringify({
                caption: messageContent,
                media_key: e2eeMediaMeta.key,
                media_nonce: e2eeMediaMeta.nonce,
                // WHISPR-fix-video-preview-hevc-ios : la clé/nonce du poster
                // doivent transiter chiffrées (jamais en clair côté serveur).
                ...(posterUpload?.key && posterUpload?.nonce
                  ? {
                      thumbnail_key: posterUpload.key,
                      thumbnail_nonce: posterUpload.nonce,
                    }
                  : {}),
              });
              const enc = await E2EEService.encryptMessageForConversation({
                conversationId,
                plaintext: mediaPayload,
                clientRandom: tempMessage.client_random as number,
                recipientUserIds: otherUserIds,
              });
              finalContent = enc.content;
            } catch (encErr) {
              logger.warn(
                "ChatScreen",
                "E2EE media message encryption failed",
                encErr,
              );
              if (e2eeEnabled) throw encErr;
            }
          }
        }

        const sentMessage = await messagingAPI.sendMessage(conversationId, {
          content: finalContent,
          message_type: "media",
          client_random: tempMessage.client_random as number,
          metadata: {
            ...mediaMetadata,
            e2ee: !!e2eeMediaMeta,
          },
          reply_to_id: replyToId,
        });

        // 4. Attach media record to the message (non-blocking — message already has metadata)
        messagingAPI
          .addAttachment(sentMessage.id, {
            media_id: uploadResult.id,
            media_type: type,
            metadata: {
              filename: uploadResult.filename || finalFilename,
              size: uploadResult.size,
              mime_type: uploadResult.mime_type || finalMimeType,
              media_url: uploadResult.url,
              thumbnail_url: uploadResult.thumbnail_url || uploadResult.url,
              duration: resolvedDuration,
            },
          })
          .catch((err) =>
            logger.warn(
              "ChatScreen.handleSendMedia",
              "addAttachment failed (non-blocking)",
              err,
            ),
          );

        // 5. Update optimistic message with the real server ID
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessageId
              ? {
                  ...msg,
                  id: sentMessage.id,
                  status: "sent" as const,
                }
              : msg,
          ),
        );
        useConversationsStore
          .getState()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .applyNewMessage(sentMessage as any, userId)
          .catch(() => {});
        useConversationsStore.getState().resetUnreadCount(conversationId);
      } catch (error) {
        logger.error(
          "ChatScreen.handleSendMedia",
          "Error sending media",
          error,
        );
        const { userMessage } = mapMediaUploadError(error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessageId
              ? {
                  ...msg,
                  status: "failed" as const,
                  content: userMessage,
                  metadata: {
                    ...(msg.metadata || {}),
                    localUri: uploadUri,
                    uploadPhase: undefined,
                    uploadProgress: undefined,
                  },
                }
              : msg,
          ),
        );
      }
    },
    [
      conversationId,
      userId,
      sendTyping,
      replyingTo,
      conversation,
      allConversations,
      conversationMembers,
      e2eeEnabled,
      setMessages,
      setReplyingTo,
      setAppealModal,
      scrollToBottom,
    ],
  );

  return { sendingRef, handleSendMessage, handleSendMedia };
}
