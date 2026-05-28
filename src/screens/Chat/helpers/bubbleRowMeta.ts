import type { MessageWithRelations } from "../../../types/messaging";
import { ChatListItem, isDateSeparator } from "./dateSeparators";

export interface BubbleRowMeta {
  isConsecutive: boolean;
  isLastInBurst: boolean;
  senderName?: string;
  senderAvatarUrl?: string | null;
}

interface MemberLike {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

/**
 * Derive the per-row presentation flags for a chat bubble in the inverted
 * FlatList. Pure: no React, no closures — given the rendered list, the row
 * index and the resolved sender context, it returns the burst/avatar flags.
 *
 * In an inverted list newer messages have LOWER indices, so:
 * - the visually-above (older) neighbour is `list[index + 1]`
 * - the visually-below (newer) neighbour is `list[index - 1]`
 *
 * `isConsecutive` (received group messages only) hides the avatar when the
 * older neighbour is from the same sender, keeping bursts compact.
 * `isLastInBurst` follows the iMessage convention: only the bottom-most
 * bubble of a same-sender burst carries a tail.
 */
export function deriveBubbleRowMeta(
  list: ChatListItem[],
  index: number,
  message: MessageWithRelations,
  isSent: boolean,
  isGroup: boolean,
  members: MemberLike[],
): BubbleRowMeta {
  const sender =
    !isSent && isGroup
      ? members.find((m) => m.id === message.sender_id)
      : undefined;

  let isConsecutive = false;
  if (!isSent && isGroup) {
    const prev = list[index + 1];
    if (
      prev &&
      !isDateSeparator(prev) &&
      prev.sender_id === message.sender_id &&
      prev.message_type !== "system"
    ) {
      isConsecutive = true;
    }
  }

  let isLastInBurst = true;
  const next = list[index - 1];
  if (
    next &&
    !isDateSeparator(next) &&
    next.sender_id === message.sender_id &&
    next.message_type !== "system"
  ) {
    isLastInBurst = false;
  }

  return {
    isConsecutive,
    isLastInBurst,
    senderName: sender?.display_name || sender?.username || undefined,
    senderAvatarUrl: sender?.avatar_url,
  };
}
