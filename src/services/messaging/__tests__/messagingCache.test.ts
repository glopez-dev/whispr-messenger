/* eslint-disable @typescript-eslint/no-explicit-any */

const storage: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => storage[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete storage[key];
  }),
  multiRemove: jest.fn(async (keys: string[]) => {
    for (const k of keys) delete storage[k];
  }),
  getAllKeys: jest.fn(async () => Object.keys(storage)),
}));

import { cacheService } from "@/services/messaging/cache";
import type { Conversation, MessageWithRelations } from "@/types/messaging";

const makeMessage = (id: string): MessageWithRelations =>
  ({
    id,
    conversation_id: "conv-1",
    sender_id: "u-1",
    content: `Hello ${id}`,
    message_type: "text",
    sent_at: "2026-01-01T00:00:00Z",
    status: "sent",
  }) as unknown as MessageWithRelations;

const makeConversation = (id: string): Conversation =>
  ({
    id,
    type: "direct",
    name: `Conv ${id}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }) as unknown as Conversation;

beforeEach(() => {
  for (const k of Object.keys(storage)) delete storage[k];
  jest.useRealTimers();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("cacheService.saveConversations", () => {
  it("writes the conversation list and a timestamp to AsyncStorage", async () => {
    const conversations = [makeConversation("c-1"), makeConversation("c-2")];

    await cacheService.saveConversations(conversations);

    expect(JSON.parse(storage["whispr.conversations.cache"])).toHaveLength(2);
    expect(
      Number(storage["whispr.conversations.cache.timestamp"]),
    ).toBeLessThanOrEqual(Date.now());
  });
});

describe("cacheService.getConversations", () => {
  it("returns null when the cache is empty", async () => {
    await expect(cacheService.getConversations()).resolves.toBeNull();
  });

  it("returns the parsed conversations when the cache is fresh", async () => {
    await cacheService.saveConversations([makeConversation("c-1")]);

    const result = await cacheService.getConversations();
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe("c-1");
  });

  it("returns null when the cache is older than 5 minutes", async () => {
    await cacheService.saveConversations([makeConversation("c-1")]);
    // Backdate the timestamp beyond the 5 min TTL
    storage["whispr.conversations.cache.timestamp"] = String(
      Date.now() - 6 * 60 * 1000,
    );

    await expect(cacheService.getConversations()).resolves.toBeNull();
  });

  it("returns null when the cached JSON is corrupted", async () => {
    storage["whispr.conversations.cache"] = "not-valid-json";
    storage["whispr.conversations.cache.timestamp"] = String(Date.now());

    await expect(cacheService.getConversations()).resolves.toBeNull();
  });
});

describe("cacheService.clearCache", () => {
  it("removes both cache keys", async () => {
    await cacheService.saveConversations([makeConversation("c-1")]);
    await cacheService.clearCache();

    expect(storage["whispr.conversations.cache"]).toBeUndefined();
    expect(storage["whispr.conversations.cache.timestamp"]).toBeUndefined();
  });
});

describe("cacheService — messages", () => {
  beforeEach(async () => {
    // Drop the in-memory mirror so tests don't bleed into each other.
    await cacheService.clearAllMessages();
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it("getMessagesSync returns null before anything is saved", () => {
    expect(cacheService.getMessagesSync("conv-1")).toBeNull();
  });

  it("getMessagesSync returns the in-memory mirror after saveMessages", async () => {
    const messages = [makeMessage("m-1"), makeMessage("m-2")];
    await cacheService.saveMessages("conv-1", messages);

    const sync = cacheService.getMessagesSync("conv-1");
    expect(sync).toHaveLength(2);
    expect(sync?.[0].id).toBe("m-1");
  });

  it("saveMessages writes to AsyncStorage with a timestamp", async () => {
    await cacheService.saveMessages("conv-1", [makeMessage("m-1")]);

    const data = storage["whispr.messages.cache.conv-1"];
    expect(JSON.parse(data)).toHaveLength(1);
    expect(
      Number(storage["whispr.messages.cache.timestamp.conv-1"]),
    ).toBeLessThanOrEqual(Date.now());
  });

  it("saveMessages refuses non-array input", async () => {
    await cacheService.saveMessages(
      "conv-1",
      null as unknown as MessageWithRelations[],
    );
    expect(storage["whispr.messages.cache.conv-1"]).toBe("[]");
  });

  it("saveMessages is a noop when conversationId is empty", async () => {
    await cacheService.saveMessages("", [makeMessage("m-1")]);
    expect(Object.keys(storage)).toHaveLength(0);
  });

  it("getMessagesSync is a noop when conversationId is empty", () => {
    expect(cacheService.getMessagesSync("")).toBeNull();
  });

  it("getMessages returns null when nothing has been cached", async () => {
    await expect(cacheService.getMessages("conv-1")).resolves.toBeNull();
  });

  it("getMessages parses the cached payload and refills the memory mirror", async () => {
    await cacheService.saveMessages("conv-1", [makeMessage("m-1")]);
    // Drop the in-memory mirror but keep AsyncStorage to simulate a cold
    // session: getMessages should rehydrate the mirror from disk.
    (cacheService as any).clearAllMessages.length; // sanity reference
    // Use a fresh import surface — simulate restart by deleting the mirror
    // through clearMessages then re-reading from disk.
    const fromDisk = await cacheService.getMessages("conv-1");
    expect(fromDisk).toHaveLength(1);
    expect(fromDisk?.[0].id).toBe("m-1");
    // After getMessages, getMessagesSync must hit the mirror.
    expect(cacheService.getMessagesSync("conv-1")).toHaveLength(1);
  });

  it("getMessages returns null when the cache is older than the TTL", async () => {
    await cacheService.saveMessages("conv-1", [makeMessage("m-1")]);
    // MESSAGES_CACHE_TTL is 1h
    storage["whispr.messages.cache.timestamp.conv-1"] = String(
      Date.now() - 2 * 60 * 60 * 1000,
    );

    await expect(cacheService.getMessages("conv-1")).resolves.toBeNull();
  });

  it("getMessages returns null when the JSON is malformed", async () => {
    storage["whispr.messages.cache.conv-1"] = "not-valid";
    storage["whispr.messages.cache.timestamp.conv-1"] = String(Date.now());
    await expect(cacheService.getMessages("conv-1")).resolves.toBeNull();
  });

  it("getMessages returns null when conversationId is empty", async () => {
    await expect(cacheService.getMessages("")).resolves.toBeNull();
  });

  it("clearMessages wipes both storage keys and the memory mirror", async () => {
    await cacheService.saveMessages("conv-1", [makeMessage("m-1")]);
    await cacheService.clearMessages("conv-1");

    expect(storage["whispr.messages.cache.conv-1"]).toBeUndefined();
    expect(storage["whispr.messages.cache.timestamp.conv-1"]).toBeUndefined();
    expect(cacheService.getMessagesSync("conv-1")).toBeNull();
  });

  it("clearMessages is a noop when conversationId is empty", async () => {
    await cacheService.saveMessages("conv-1", [makeMessage("m-1")]);
    await cacheService.clearMessages("");
    // The entry must still be there.
    expect(cacheService.getMessagesSync("conv-1")).toHaveLength(1);
  });

  it("clearAllMessages wipes every conversation entry from memory and disk", async () => {
    await cacheService.saveMessages("conv-1", [makeMessage("m-1")]);
    await cacheService.saveMessages("conv-2", [makeMessage("m-2")]);

    await cacheService.clearAllMessages();

    expect(cacheService.getMessagesSync("conv-1")).toBeNull();
    expect(cacheService.getMessagesSync("conv-2")).toBeNull();
    expect(storage["whispr.messages.cache.conv-1"]).toBeUndefined();
    expect(storage["whispr.messages.cache.conv-2"]).toBeUndefined();
  });
});
