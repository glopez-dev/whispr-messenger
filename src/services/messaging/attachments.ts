import {
  API_BASE_URL,
  authenticatedFetch,
  httpError,
  mapBackendAttachment,
  unwrap,
} from "@/services/messaging/http";

export const attachmentsAPI = {
  async getAttachments(messageId: string) {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/messages/${encodeURIComponent(messageId)}/attachments`,
    );

    if (!response.ok) {
      // Endpoint may not exist yet (404) — return empty array gracefully
      if (response.status === 404) {
        return [];
      }
      throw httpError("Failed to fetch attachments", response);
    }

    const data = await unwrap(response);
    const raw = Array.isArray(data) ? data : [];
    return raw.map((att: any) => mapBackendAttachment(att, messageId));
  },

  async addAttachment(messageId: string, attachment: any): Promise<void> {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/messages/${encodeURIComponent(messageId)}/attachments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attachment),
      },
    );

    if (!response.ok) {
      throw httpError("Failed to add attachment", response);
    }
  },
};
