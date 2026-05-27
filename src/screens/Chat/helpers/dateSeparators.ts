import type { MessageWithRelations } from "../../../types/messaging";

// WHISPR-1074: FlatList items in ChatScreen are either messages or date
// separators. Centralising the union + guard removes the
// `(item as any).type === "date"` casts sprinkled through the render paths.
export type DateSeparatorItem = { type: "date"; date: Date; id: string };
export type ChatListItem = MessageWithRelations | DateSeparatorItem;

export const isDateSeparator = (
  item: ChatListItem,
): item is DateSeparatorItem => (item as DateSeparatorItem).type === "date";
