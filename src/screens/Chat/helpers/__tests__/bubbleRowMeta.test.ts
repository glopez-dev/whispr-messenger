import { deriveBubbleRowMeta } from "@/screens/Chat/helpers/bubbleRowMeta";
import type { ChatListItem } from "@/screens/Chat/helpers/dateSeparators";
import type { MessageWithRelations } from "@/types/messaging";

const msg = (
  id: string,
  sender_id: string,
  message_type: MessageWithRelations["message_type"] = "text",
): MessageWithRelations =>
  ({ id, sender_id, message_type }) as MessageWithRelations;

const members = [
  { id: "u2", display_name: "Alice", username: "alice", avatar_url: "a.png" },
  { id: "u3", username: "bob", avatar_url: null },
];

describe("deriveBubbleRowMeta", () => {
  it("resolves sender name/avatar for a received group message", () => {
    const list: ChatListItem[] = [msg("m1", "u2")];
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.senderName).toBe("Alice");
    expect(meta.senderAvatarUrl).toBe("a.png");
  });

  it("falls back to username when display_name is missing", () => {
    const list: ChatListItem[] = [msg("m1", "u3")];
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.senderName).toBe("bob");
  });

  it("does not resolve a sender for messages I sent", () => {
    const list: ChatListItem[] = [msg("m1", "me")];
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      true,
      true,
      members,
    );
    expect(meta.senderName).toBeUndefined();
    expect(meta.senderAvatarUrl).toBeUndefined();
  });

  it("marks a received group message consecutive when the older neighbour is the same sender", () => {
    // inverted list: index 0 = newest. The older neighbour is index+1.
    const list: ChatListItem[] = [msg("m2", "u2"), msg("m1", "u2")];
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.isConsecutive).toBe(true);
  });

  it("is not consecutive when the older neighbour is a different sender", () => {
    const list: ChatListItem[] = [msg("m2", "u2"), msg("m1", "u3")];
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.isConsecutive).toBe(false);
  });

  it("is not the last in burst when the newer neighbour is the same sender", () => {
    // index 1 is older; its newer neighbour (index 0) is same sender → not last
    const list: ChatListItem[] = [msg("m2", "u2"), msg("m1", "u2")];
    const meta = deriveBubbleRowMeta(
      list,
      1,
      list[1] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.isLastInBurst).toBe(false);
  });

  it("is the last in burst when the newer neighbour is a different sender", () => {
    const list: ChatListItem[] = [msg("m2", "u3"), msg("m1", "u2")];
    const meta = deriveBubbleRowMeta(
      list,
      1,
      list[1] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.isLastInBurst).toBe(true);
  });

  it("never marks consecutive in a direct (non-group) conversation", () => {
    const list: ChatListItem[] = [msg("m2", "u2"), msg("m1", "u2")];
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      false,
      false,
      members,
    );
    expect(meta.isConsecutive).toBe(false);
  });

  it("treats a date-separator neighbour as a burst boundary", () => {
    const sep: ChatListItem = { type: "date", date: new Date(0), id: "d1" };
    const list: ChatListItem[] = [msg("m2", "u2"), sep, msg("m1", "u2")];
    // index 0's older neighbour is the separator → not consecutive
    const meta = deriveBubbleRowMeta(
      list,
      0,
      list[0] as MessageWithRelations,
      false,
      true,
      members,
    );
    expect(meta.isConsecutive).toBe(false);
  });
});
