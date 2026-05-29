/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("@/services/E2EEService", () => ({
  E2EEService: {
    isEncryptedPayload: jest.fn(),
    decryptTextMessage: jest.fn(),
  },
}));

import {
  decryptMessageForCache,
  decryptMessagesForCache,
} from "@/navigation/preloadMessagesCache";
import { E2EEService } from "@/services/E2EEService";

const mockIsEncrypted = E2EEService.isEncryptedPayload as jest.Mock;
const mockDecryptText = E2EEService.decryptTextMessage as jest.Mock;

beforeEach(() => {
  mockIsEncrypted.mockReset();
  mockDecryptText.mockReset();
});

describe("decryptMessageForCache", () => {
  it("passes plaintext messages through with a default status", async () => {
    mockIsEncrypted.mockReturnValue(false);

    const raw = {
      id: "m-1",
      content: "hello",
      message_type: "text",
      metadata: { foo: "bar" },
    };
    const result = await decryptMessageForCache("c-1", raw);

    expect(result.content).toBe("hello");
    expect(result.status).toBe("sent");
    expect(result.metadata).toEqual({ foo: "bar" });
    expect(mockDecryptText).not.toHaveBeenCalled();
  });

  it("preserves explicit status when provided", async () => {
    mockIsEncrypted.mockReturnValue(false);

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: "x",
      status: "delivered",
    });
    expect(result.status).toBe("delivered");
  });

  it("decrypts an E2EE text envelope", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue("clear text");

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1,"t":"whispr_e2ee_v1"}',
      message_type: "text",
    });
    expect(result.content).toBe("clear text");
    expect(mockDecryptText).toHaveBeenCalledWith({
      conversationId: "c-1",
      content: '{"v":1,"t":"whispr_e2ee_v1"}',
    });
  });

  it("falls back to 'Message chiffré' when decryption returns null", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue(null);

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1}',
      message_type: "text",
    });
    expect(result.content).toBe("Message chiffré");
  });

  it("extracts media_key/media_nonce/caption for E2EE media messages", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue(
      JSON.stringify({
        media_key: "k-1",
        media_nonce: "n-1",
        caption: "look at this",
      }),
    );

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1}',
      message_type: "media",
    });
    expect(result.content).toBe("look at this");
    expect(result.metadata).toMatchObject({
      media_key: "k-1",
      media_nonce: "n-1",
      e2ee: true,
    });
  });

  it("returns an empty caption when the media envelope omits one", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue(
      JSON.stringify({ media_key: "k", media_nonce: "n" }),
    );

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1}',
      message_type: "media",
    });
    expect(result.content).toBe("");
    expect(result.metadata.media_key).toBe("k");
  });

  it("falls back to raw decrypted text when the media JSON lacks keys", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue(JSON.stringify({ other: 1 }));

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1}',
      message_type: "media",
    });
    expect(result.content).toBe(JSON.stringify({ other: 1 }));
    expect(result.metadata).toEqual({});
  });

  it("falls back to raw decrypted text when the media payload is not JSON", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue("not-json");

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1}',
      message_type: "media",
    });
    expect(result.content).toBe("not-json");
  });

  it("merges existing metadata with the E2EE additions", async () => {
    mockIsEncrypted.mockReturnValue(true);
    mockDecryptText.mockResolvedValue(
      JSON.stringify({ media_key: "k", media_nonce: "n" }),
    );

    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      content: '{"v":1}',
      message_type: "media",
      metadata: { custom: "field" },
    });
    expect(result.metadata).toEqual({
      custom: "field",
      media_key: "k",
      media_nonce: "n",
      e2ee: true,
    });
  });

  it("tolerates a message without content", async () => {
    mockIsEncrypted.mockReturnValue(false);
    const result = await decryptMessageForCache("c-1", {
      id: "m-1",
      message_type: "system",
    });
    expect(result.status).toBe("sent");
    expect(mockDecryptText).not.toHaveBeenCalled();
  });
});

describe("decryptMessagesForCache", () => {
  it("returns an empty array when input is not an array", async () => {
    expect(await decryptMessagesForCache("c-1", null)).toEqual([]);
    expect(await decryptMessagesForCache("c-1", "nope")).toEqual([]);
    expect(await decryptMessagesForCache("c-1", undefined)).toEqual([]);
  });

  it("maps every message through decryptMessageForCache", async () => {
    mockIsEncrypted.mockReturnValue(false);
    const result = await decryptMessagesForCache("c-1", [
      { id: "m-1", content: "a" },
      { id: "m-2", content: "b" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("a");
    expect(result[1].content).toBe("b");
  });
});
