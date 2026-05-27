import { API_BASE_URL, authenticatedFetch, httpError, unwrap } from "./http";

export const reactionsAPI = {
  async addReaction(
    messageId: string,
    userId: string,
    reaction: string,
  ): Promise<void> {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          reaction,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg =
        (body as { message?: string; error?: string })?.message ||
        (body as { error?: string })?.error ||
        `HTTP ${response.status}`;
      const err = new Error(msg) as Error & { status: number; body: unknown };
      err.status = response.status;
      err.body = body;
      throw err;
    }
  },

  async removeReaction(
    messageId: string,
    userId: string,
    reaction: string,
  ): Promise<void> {
    const url = `${API_BASE_URL}/messages/${encodeURIComponent(
      messageId,
    )}/reactions/${encodeURIComponent(reaction)}?user_id=${encodeURIComponent(userId)}`;

    const response = await authenticatedFetch(url, { method: "DELETE" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg =
        (body as { message?: string; error?: string })?.message ||
        (body as { error?: string })?.error ||
        `HTTP ${response.status}`;
      const err = new Error(msg) as Error & { status: number; body: unknown };
      err.status = response.status;
      err.body = body;
      throw err;
    }
  },

  async getMessageReactions(messageId: string) {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/messages/${encodeURIComponent(messageId)}/reactions`,
    );

    if (!response.ok) {
      // Back ou routes pas encore alignés — pas de réactions affichées
      if (response.status === 404 || response.status === 400) {
        return { reactions: [] };
      }
      throw httpError("Failed to fetch message reactions", response);
    }

    return unwrap(response);
  },
};
