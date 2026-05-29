/* eslint-disable @typescript-eslint/no-explicit-any */

// Cache-warm helper used by AuthNavigator at boot to pre-decrypt the latest
// messages of the top conversations. Extracted from the navigator so the
// (otherwise hard to reach) E2EE decryption branch is unit-testable.

import { E2EEService } from "@/services/E2EEService";

/**
 * Decrypt one raw API message into the shape the chat screen cache expects.
 * E2EE envelopes are unwrapped; media messages further parse the inner JSON
 * to extract the `media_key`/`media_nonce` pair into `metadata` so the chat
 * bubbles can render them without re-decrypting.
 */
export async function decryptMessageForCache(
  conversationId: string,
  m: any,
): Promise<any> {
  let displayContent = m?.content;
  let e2eeMetadata: Record<string, unknown> = {};
  if (
    typeof m?.content === "string" &&
    E2EEService.isEncryptedPayload(m.content)
  ) {
    const decrypted = await E2EEService.decryptTextMessage({
      conversationId,
      content: m.content,
    });
    if (decrypted === null) {
      displayContent = "Message chiffré";
    } else if (m?.message_type === "media") {
      try {
        const parsed = JSON.parse(decrypted);
        if (parsed.media_key && parsed.media_nonce) {
          displayContent = parsed.caption || "";
          e2eeMetadata = {
            media_key: parsed.media_key,
            media_nonce: parsed.media_nonce,
            e2ee: true,
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
  return {
    ...m,
    content: displayContent,
    metadata: { ...(m?.metadata || {}), ...e2eeMetadata },
    status: m?.status || "sent",
  };
}

/**
 * Decrypt the array of raw API messages returned by getMessages so the
 * navigator can write a plaintext-ready entry into the conversation cache.
 * Non-arrays return an empty list — defensive, matches the prior inline code.
 */
export async function decryptMessagesForCache(
  conversationId: string,
  data: unknown,
): Promise<any[]> {
  if (!Array.isArray(data)) return [];
  return Promise.all(
    data.map((m) => decryptMessageForCache(conversationId, m)),
  );
}
