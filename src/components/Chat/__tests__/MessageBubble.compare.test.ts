/* eslint-disable @typescript-eslint/no-explicit-any */

// Direct unit tests for the memo() comparator extracted from MessageBubble.
// No rendering, no native mocks — purely the equality predicate. Each test
// changes exactly one field at a time so we know which check it exercises.

import { areMessageBubblePropsEqual } from "../MessageBubble";
import type { MessageWithRelations } from "../../../types/messaging";

const baseMessage = (): MessageWithRelations =>
  ({
    id: "m-1",
    conversation_id: "c-1",
    sender_id: "u-1",
    content: "hello",
    status: "sent",
    edited_at: null,
    is_deleted: false,
    message_type: "text",
    forwarded_from_id: null,
    attachments: undefined,
    reply_to: undefined,
    metadata: undefined,
    reactions: [],
    delivery_statuses: [],
    sent_at: "2026-01-01T00:00:00Z",
  }) as unknown as MessageWithRelations;

const baseProps = () => ({
  message: baseMessage(),
  isSent: false,
  currentUserId: "u-2",
  senderName: "Alice",
  senderAvatarUrl: undefined,
  isConsecutive: false,
  isLastInBurst: true,
  showSenderAvatar: false,
  onReactionPress: jest.fn(),
  onReactionDetailsPress: jest.fn(),
  resolveReactorName: undefined,
  onReplyPress: undefined,
  onLongPress: undefined,
  isHighlighted: false,
  searchQuery: "",
  pendingAppeal: undefined,
  isLastSentByMe: false,
  isGroupConversation: false,
  otherMembersCount: 0,
  resolveMemberName: undefined,
  onContest: undefined,
  onRetry: undefined,
  onCancel: undefined,
});

describe("areMessageBubblePropsEqual", () => {
  it("returns true when both prop sets are deeply equivalent", () => {
    const prev = baseProps();
    const next = baseProps();
    // Stabilize the function refs that the comparator checks by identity.
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(true);
  });

  // Top-level message fields ─────────────────────────────────────────────
  it.each([
    ["id", "m-2"],
    ["content", "world"],
    ["status", "delivered"],
    ["edited_at", "2026-01-02T00:00:00Z"],
    ["is_deleted", true],
    ["message_type", "media"],
    ["forwarded_from_id", "m-99"],
  ])("returns false when message.%s changes", (field, value) => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (next.message as any)[field] = value;
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("returns false when message.attachments swaps reference", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev.message as any).attachments = [{ id: "a-1" }];
    (next.message as any).attachments = [{ id: "a-1" }]; // same content, fresh array
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("returns false when message.reply_to swaps reference", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev.message as any).reply_to = { id: "m-orig" };
    (next.message as any).reply_to = { id: "m-orig" }; // same shape, new object
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  // Top-level non-message props ──────────────────────────────────────────
  it.each<[string, any]>([
    ["senderName", "Bob"],
    ["senderAvatarUrl", "https://x/avatar.png"],
    ["isConsecutive", true],
    ["isLastInBurst", false],
    ["showSenderAvatar", true],
    ["isLastSentByMe", true],
    ["isGroupConversation", true],
    ["otherMembersCount", 4],
  ])("returns false when %s changes", (field, value) => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (next as any)[field] = value;
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("returns false when onReactionDetailsPress identity changes", () => {
    const prev = baseProps();
    const next = baseProps();
    // Different fn references — the comparator does ===.
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("returns false when pendingAppeal.status changes", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev as any).pendingAppeal = { status: "pending" };
    (next as any).pendingAppeal = { status: "approved" };
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  // metadata.* paths ─────────────────────────────────────────────────────
  it.each<[string, any, any]>([
    ["blockedByModeration", false, true],
    ["appealRejected", false, true],
    ["media_url", undefined, "https://x/img.jpg"],
    ["forwarded", false, true],
    ["media_key", undefined, "key-1"],
    ["media_nonce", undefined, "nonce-1"],
    ["e2ee", undefined, true],
  ])("returns false when metadata.%s changes", (key, prevVal, nextVal) => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev.message as any).metadata = { [key]: prevVal };
    (next.message as any).metadata = { [key]: nextVal };
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("returns false when metadata.link_preview.url changes", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev.message as any).metadata = {
      link_preview: { url: "https://a.example" },
    };
    (next.message as any).metadata = {
      link_preview: { url: "https://b.example" },
    };
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("treats undefined metadata as equivalent across calls", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(true);
  });

  // reactions are JSON-compared ──────────────────────────────────────────
  it("returns false when reactions diverge structurally", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev.message as any).reactions = [];
    (next.message as any).reactions = [{ user_id: "u-1", reaction: "👍" }];
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("treats reactions with same JSON as equivalent", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev.message as any).reactions = [{ user_id: "u-1", reaction: "👍" }];
    (next.message as any).reactions = [{ user_id: "u-1", reaction: "👍" }];
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(true);
  });

  // delivery_statuses ────────────────────────────────────────────────────
  it("skips delivery_statuses compare when this is not the last-sent bubble", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev as any).isLastSentByMe = false;
    (next as any).isLastSentByMe = false;
    (prev.message as any).delivery_statuses = [
      { user_id: "u-2", delivered_at: "2026-01-01", read_at: null },
    ];
    (next.message as any).delivery_statuses = [
      { user_id: "u-2", delivered_at: "2026-01-02", read_at: "2026-01-02" },
    ];
    // Even though delivery_statuses differ, the comparator ignores them.
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(true);
  });

  it("compares delivery_statuses when isLastSentByMe is true (equal)", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev as any).isLastSentByMe = true;
    (next as any).isLastSentByMe = true;
    const ds = [
      { user_id: "u-2", delivered_at: "2026-01-01", read_at: "2026-01-01" },
    ];
    (prev.message as any).delivery_statuses = ds;
    (next.message as any).delivery_statuses = [...ds];
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(true);
  });

  it("compares delivery_statuses when isLastSentByMe is true (different read_at)", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev as any).isLastSentByMe = true;
    (next as any).isLastSentByMe = true;
    (prev.message as any).delivery_statuses = [
      { user_id: "u-2", delivered_at: "2026-01-01", read_at: null },
    ];
    (next.message as any).delivery_statuses = [
      { user_id: "u-2", delivered_at: "2026-01-01", read_at: "2026-01-02" },
    ];
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("returns false when delivery_statuses lengths differ", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev as any).isLastSentByMe = true;
    (next as any).isLastSentByMe = true;
    (prev.message as any).delivery_statuses = [];
    (next.message as any).delivery_statuses = [
      { user_id: "u-2", delivered_at: "2026-01-01", read_at: null },
    ];
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(false);
  });

  it("treats undefined delivery_statuses as empty", () => {
    const prev = baseProps();
    const next = baseProps();
    next.onReactionDetailsPress = prev.onReactionDetailsPress;
    (prev as any).isLastSentByMe = true;
    (next as any).isLastSentByMe = true;
    (prev.message as any).delivery_statuses = undefined;
    (next.message as any).delivery_statuses = undefined;
    expect(areMessageBubblePropsEqual(prev as any, next as any)).toBe(true);
  });
});
