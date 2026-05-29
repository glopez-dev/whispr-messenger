import { PinnedMessage } from "@/types/messaging";
import {
  API_BASE_URL,
  authenticatedFetch,
  httpError,
  unwrap,
} from "@/services/messaging/http";

export const pinsAPI = {
  async pinMessage(conversationId: string, messageId: string): Promise<void> {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/messages/${encodeURIComponent(messageId)}/pin`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
        }),
      },
    );

    if (!response.ok) {
      throw httpError("Failed to pin message", response);
    }
  },

  async unpinMessage(conversationId: string, messageId: string): Promise<void> {
    const url = `${API_BASE_URL}/messages/${encodeURIComponent(
      messageId,
    )}/pin?conversation_id=${encodeURIComponent(conversationId)}`;

    const response = await authenticatedFetch(url, { method: "DELETE" });

    if (!response.ok) {
      throw httpError("Failed to unpin message", response);
    }
  },

  async getPinnedMessages(conversationId: string): Promise<PinnedMessage[]> {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/pins`,
    );

    if (!response.ok) {
      // Endpoint may not exist yet (404) — return empty array gracefully
      if (response.status === 404) {
        return [];
      }
      throw httpError("Failed to fetch pinned messages", response);
    }

    const data = await unwrap(response);
    return Array.isArray(data) ? (data as PinnedMessage[]) : [];
  },
};
