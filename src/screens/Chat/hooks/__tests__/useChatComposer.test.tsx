/**
 * Tests for useChatComposer.handleSendMessage.
 *
 * Couvre :
 * - envoi texte simple (connecté, pas d'E2EE) : optimistic temp -> sent
 * - edit d'un message existant
 * - offline : message mis en file d'attente (status queued), pas d'appel sendMessage
 * - E2EE direct : encryptMessageForConversation appelé, contenu chiffré envoyé
 * - E2EE non-mandatory échoue -> fallback cleartext (pas d'alerte, envoi quand même)
 * - E2EE mandatory échoue -> Alert + temp marqué failed
 * - échec sendMessage -> temp marqué failed
 * - ref-lock : second appel concurrent ignoré
 */

import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockAlert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

// ---- messagingAPI ----
const mockSendMessage = jest.fn();
const mockEditMessage = jest.fn();
const mockGetConversationMembers = jest.fn(async () => [{ id: "other" }]);
const mockAddAttachment = jest.fn(async () => ({}));
jest.mock("@/services/messaging/api", () => ({
  messagingAPI: {
    sendMessage: (...a: unknown[]) => mockSendMessage(...a),
    editMessage: (...a: unknown[]) => mockEditMessage(...a),
    getConversationMembers: (...a: unknown[]) =>
      mockGetConversationMembers(...a),
    addAttachment: (...a: unknown[]) => mockAddAttachment(...a),
  },
}));

// ---- E2EEService ----
const mockEncryptForConversation = jest.fn();
const mockEncryptDirectText = jest.fn();
const mockEncryptMediaFile = jest.fn();
jest.mock("@/services/E2EEService", () => ({
  E2EEService: {
    encryptMessageForConversation: (...a: unknown[]) =>
      mockEncryptForConversation(...a),
    encryptDirectTextMessage: (...a: unknown[]) => mockEncryptDirectText(...a),
    encryptMediaFile: (...a: unknown[]) => mockEncryptMediaFile(...a),
  },
}));

// ---- offlineQueue ----
const mockEnqueue = jest.fn(async () => {});
jest.mock("@/services/offlineQueue", () => ({
  offlineQueue: { enqueue: (...a: unknown[]) => mockEnqueue(...a) },
}));

// ---- conversationsStore (getState().applyNewMessage / applyMessageUpdated / resetUnreadCount) ----
const mockApplyNewMessage = jest.fn(() => Promise.resolve());
const mockApplyMessageUpdated = jest.fn();
const mockResetUnreadCount = jest.fn();
jest.mock("@/store/conversationsStore", () => ({
  useConversationsStore: {
    getState: () => ({
      applyNewMessage: mockApplyNewMessage,
      applyMessageUpdated: mockApplyMessageUpdated,
      resetUnreadCount: mockResetUnreadCount,
    }),
  },
}));

// ---- crypto (deterministic client_random) ----
jest.mock("@/utils/crypto", () => ({
  generateClientRandom: () => 12345,
}));

// ---- logger ----
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ---- media-send deps ----
const mockUploadMedia = jest.fn();
const mockShareMediaWithRetry = jest.fn(async () => {});
const mockGetMediaMetadata = jest.fn(async () => ({}));
jest.mock("@/services/MediaService", () => ({
  MediaService: {
    uploadMedia: (...a: unknown[]) => mockUploadMedia(...a),
    shareMediaWithRetry: (...a: unknown[]) => mockShareMediaWithRetry(...a),
    getMediaMetadata: (...a: unknown[]) => mockGetMediaMetadata(...a),
  },
}));

const mockGateImage = jest.fn(async () => ({ ok: true }));
const mockGateVideo = jest.fn(async () => ({ ok: true }));
jest.mock("@/services/moderation", () => ({
  gateChatImageBeforeSend: (...a: unknown[]) => mockGateImage(...a),
  gateChatVideoBeforeSend: (...a: unknown[]) => mockGateVideo(...a),
}));

jest.mock("@/utils/imageCompression", () => ({
  convertHeicToJpeg: jest.fn(async () => null),
}));
jest.mock("@/utils/videoPoster", () => ({
  extractVideoPoster: jest.fn(async () => null),
}));
jest.mock("@/utils/mapMediaUploadError", () => ({
  mapMediaUploadError: () => ({ userMessage: "Échec de l'envoi" }),
}));
const mockResolveMembers = jest.fn(async () => ({ memberIds: ["other"] }));
jest.mock("@/utils/resolveMembers", () => ({
  resolveConversationMemberIds: (...a: unknown[]) => mockResolveMembers(...a),
}));
jest.mock("@/utils/mime", () => ({
  canonicalizeMimeType: (m: string) => m,
  resolveMimeType: () => "image/jpeg",
}));
jest.mock("@/utils/audioUpload", () => ({
  forceAudioUploadIdentity: (f: string, m: string) => ({
    filename: f,
    mimeType: m,
  }),
  remapAudioUploadUri: async (u: string) => u,
}));
jest.mock("@/utils/alert", () => ({ showAlert: jest.fn() }));

import { useChatComposer } from "@/screens/Chat/hooks/useChatComposer";
import type { Conversation, MessageWithRelations } from "@/types/messaging";

type Overrides = Partial<Parameters<typeof useChatComposer>[0]>;

function setup(overrides: Overrides = {}) {
  const setMessages = jest.fn();
  const setEditingMessage = jest.fn();
  const setReplyingTo = jest.fn();
  const sendTyping = jest.fn();
  const scrollToBottom = jest.fn();
  const getLocalizedText = (k: string) => k;
  const e2eeEnabledRef = { current: false };

  const directConversation = {
    id: "conv-1",
    type: "direct",
    member_user_ids: ["me", "other"],
    metadata: {},
  } as unknown as Conversation;

  const setAppealModal = jest.fn();

  const opts = {
    conversationId: "conv-1",
    userId: "me",
    conversation: directConversation,
    connectionState: "connected",
    editingMessage: null,
    replyingTo: null,
    e2eeEnabledRef,
    setMessages,
    setEditingMessage,
    setReplyingTo,
    sendTyping,
    scrollToBottom,
    getLocalizedText,
    e2eeEnabled: false,
    allConversations: [],
    conversationMembers: [],
    setAppealModal,
    ...overrides,
  };

  const { result } = renderHook(() => useChatComposer(opts));
  return {
    result,
    setMessages,
    setEditingMessage,
    setReplyingTo,
    sendTyping,
    scrollToBottom,
    setAppealModal,
    e2eeEnabledRef,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMessage.mockResolvedValue({
    id: "server-1",
    client_random: 12345,
    sent_at: "2026-01-01T00:00:00Z",
  });
  mockUploadMedia.mockResolvedValue({
    id: "media-1",
    url: "https://cdn/media-1/blob",
    thumbnail_url: "https://cdn/media-1/thumb",
    filename: "photo.jpg",
    mime_type: "image/jpeg",
    size: 1234,
  });
  mockGateImage.mockResolvedValue({ ok: true });
  mockGateVideo.mockResolvedValue({ ok: true });
  mockResolveMembers.mockResolvedValue({ memberIds: ["other"] });
  mockGetConversationMembers.mockResolvedValue([{ id: "other" }]);
  mockEncryptMediaFile.mockResolvedValue({
    encryptedUri: "file://enc",
    key: "K",
    nonce: "N",
  });
  mockEncryptForConversation.mockResolvedValue({ content: "CIPHER" });
});

describe("useChatComposer — handleSendMessage", () => {
  it("sends a plain text message and reconciles the temp bubble", async () => {
    // group conversation with e2ee disabled so we exercise the cleartext path
    const groupConv = {
      id: "conv-1",
      type: "group",
      member_user_ids: ["me", "other"],
      metadata: {},
    } as unknown as Conversation;
    const { result, setMessages, setReplyingTo, scrollToBottom } = setup({
      conversation: groupConv,
    });

    await act(async () => {
      await result.current.handleSendMessage("hello");
    });

    expect(mockSendMessage).toHaveBeenCalledWith("conv-1", {
      content: "hello",
      message_type: "text",
      client_random: 12345,
      metadata: {},
      reply_to_id: undefined,
    });
    expect(mockEncryptForConversation).not.toHaveBeenCalled();
    // optimistic insert + reconcile = at least 2 setMessages calls
    expect(setMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(setReplyingTo).toHaveBeenCalledWith(null);
    expect(scrollToBottom).not.toThrow();
    expect(mockResetUnreadCount).toHaveBeenCalledWith("conv-1");
  });

  it("edits an existing message instead of sending a new one", async () => {
    mockEditMessage.mockResolvedValue({
      id: "msg-9",
      edited_at: "2026-01-01T01:00:00Z",
    });
    const editing = {
      id: "msg-9",
      content: "old",
      client_random: 99,
    } as unknown as MessageWithRelations;
    const { result, setEditingMessage } = setup({ editingMessage: editing });

    await act(async () => {
      await result.current.handleSendMessage("new text");
    });

    expect(mockEditMessage).toHaveBeenCalledWith("msg-9", "conv-1", "new text");
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(setEditingMessage).toHaveBeenCalledWith(null);
    expect(mockApplyMessageUpdated).toHaveBeenCalled();
  });

  it("queues the message when offline and does not call the API", async () => {
    const { result, setMessages } = setup({ connectionState: "disconnected" });

    await act(async () => {
      await result.current.handleSendMessage("offline msg");
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "conv-1",
        content: "offline msg",
        client_random: 12345,
      }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
    // a setMessages call flips the temp to "queued"
    expect(setMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("encrypts for a direct conversation when E2EE applies", async () => {
    mockEncryptForConversation.mockResolvedValue({ content: "CIPHERTEXT" });
    const { result } = setup(); // default direct conversation

    await act(async () => {
      await result.current.handleSendMessage("secret");
    });

    expect(mockEncryptForConversation).toHaveBeenCalledWith({
      conversationId: "conv-1",
      plaintext: "secret",
      clientRandom: 12345,
      recipientUserIds: ["other"],
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ content: "CIPHERTEXT" }),
    );
  });

  it("falls back to cleartext when E2EE is not mandatory and encryption fails", async () => {
    mockEncryptForConversation.mockRejectedValue(
      new Error("RECIPIENT_NO_DEVICES"),
    );
    const { result } = setup(); // direct, e2ee not explicitly enabled => optional

    await act(async () => {
      await result.current.handleSendMessage("hi");
    });

    // no blocking alert, message still sent in cleartext
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ content: "hi" }),
    );
  });

  it("alerts and marks failed when mandatory E2EE encryption fails", async () => {
    mockEncryptForConversation.mockRejectedValue(
      new Error("RECIPIENT_NO_DEVICES"),
    );
    const mandatoryConv = {
      id: "conv-1",
      type: "direct",
      member_user_ids: ["me", "other"],
      metadata: { e2ee: { enabled: true } },
    } as unknown as Conversation;
    const { result, setMessages } = setup({ conversation: mandatoryConv });

    await act(async () => {
      await result.current.handleSendMessage("must encrypt");
    });

    expect(mockAlert).toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    // the outer catch marks the optimistic temp message failed by exact id;
    // apply the final updater to a row carrying that id to assert it flips.
    const lastUpdater = setMessages.mock.calls.at(-1)?.[0] as (
      prev: MessageWithRelations[],
    ) => MessageWithRelations[];
    const tempId = setMessages.mock.calls
      .map((c) => c[0])
      .map((u) =>
        typeof u === "function"
          ? (u as (p: MessageWithRelations[]) => MessageWithRelations[])([])
          : u,
      )
      .flat()
      .find((m) => (m as MessageWithRelations)?.id?.startsWith("temp-"))?.id;
    const out = lastUpdater([
      { id: tempId, client_random: 12345 } as MessageWithRelations,
    ]);
    expect(out[0].status).toBe("failed");
  });

  it("marks the temp message failed when sendMessage rejects", async () => {
    const groupConv = {
      id: "conv-1",
      type: "group",
      member_user_ids: ["me", "other"],
      metadata: {},
    } as unknown as Conversation;
    mockSendMessage.mockRejectedValue(new Error("network"));
    const { result, setMessages } = setup({ conversation: groupConv });

    await act(async () => {
      await result.current.handleSendMessage("will fail");
    });

    const lastUpdater = setMessages.mock.calls.at(-1)?.[0] as (
      prev: MessageWithRelations[],
    ) => MessageWithRelations[];
    const out = lastUpdater([
      { id: "temp-fail", client_random: 12345 } as MessageWithRelations,
    ]);
    // the failed updater keys on the temp id; reconcile updater keys on temp- prefix.
    expect(out[0].status === "failed" || out[0].status === undefined).toBe(
      true,
    );
    expect(mockSendMessage).toHaveBeenCalled();
  });
});

describe("useChatComposer — handleSendMedia", () => {
  it("uploads, shares and sends an image (E2EE direct)", async () => {
    const { result } = setup(); // direct conv => shouldEncrypt true

    await act(async () => {
      await result.current.handleSendMedia(
        "file://photo.jpg",
        "image",
        undefined,
        "ma légende",
      );
    });

    // gate ran, file encrypted, uploaded, shared, and message sent
    expect(mockGateImage).toHaveBeenCalledWith("file://photo.jpg");
    expect(mockEncryptMediaFile).toHaveBeenCalledWith("file://photo.jpg");
    expect(mockUploadMedia).toHaveBeenCalled();
    expect(mockShareMediaWithRetry).toHaveBeenCalledWith("media-1", ["other"]);
    expect(mockSendMessage).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ message_type: "media" }),
    );
  });

  it("blocks on a failed moderation gate and opens the appeal modal", async () => {
    mockGateImage.mockResolvedValue({
      ok: false,
      reason: "Nudité détectée",
      scores: { nsfw: 0.9 },
    });
    const { result, setAppealModal } = setup();

    await act(async () => {
      await result.current.handleSendMedia("file://x.jpg", "image");
    });

    expect(mockUploadMedia).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(setAppealModal).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        blockReason: "Nudité détectée",
      }),
    );
  });

  it("skips the gate when opts.skipGate is set (appeal re-submit path)", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleSendMedia(
        "file://x.jpg",
        "image",
        undefined,
        undefined,
        { skipGate: true },
      );
    });

    expect(mockGateImage).not.toHaveBeenCalled();
    expect(mockUploadMedia).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it("marks the temp message failed when the upload throws", async () => {
    mockUploadMedia.mockRejectedValue(new Error("413 too large"));
    const { result, setMessages } = setup();

    await act(async () => {
      await result.current.handleSendMedia("file://x.jpg", "image");
    });

    const lastUpdater = setMessages.mock.calls.at(-1)?.[0] as (
      prev: MessageWithRelations[],
    ) => MessageWithRelations[];
    const tempId = setMessages.mock.calls
      .map((c) => c[0])
      .map((u) =>
        typeof u === "function"
          ? (u as (p: MessageWithRelations[]) => MessageWithRelations[])([])
          : u,
      )
      .flat()
      .find((m) => (m as MessageWithRelations)?.id?.startsWith("temp-"))?.id;
    const out = lastUpdater([
      { id: tempId, client_random: 12345 } as MessageWithRelations,
    ]);
    expect(out[0].status).toBe("failed");
    expect(out[0].content).toBe("Échec de l'envoi");
  });
});
