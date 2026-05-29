import { useCallback, useState } from "react";
import type { FlatList } from "react-native";
import { MessageWithRelations } from "@/types/messaging";
import { messagingAPI } from "@/services/messaging/api";
import { logger } from "@/utils/logger";
import {
  ChatListItem,
  isDateSeparator,
} from "@/screens/Chat/helpers/dateSeparators";

export interface UseChatSearchOptions {
  conversationId: string;
  messages: MessageWithRelations[];
  e2eeEnabledRef: React.MutableRefObject<boolean>;
  flatListRef: React.RefObject<FlatList | null>;
  messagesWithSeparators: ChatListItem[];
}

export interface UseChatSearchReturn {
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchResults: MessageWithRelations[];
  setSearchResults: React.Dispatch<
    React.SetStateAction<MessageWithRelations[]>
  >;
  currentSearchIndex: number;
  setCurrentSearchIndex: React.Dispatch<React.SetStateAction<number>>;
  handleSearch: (query: string) => Promise<void>;
  handleSearchNext: () => void;
  handleSearchPrevious: () => void;
}

export function useChatSearch({
  conversationId,
  messages,
  e2eeEnabledRef,
  flatListRef,
  messagesWithSeparators,
}: UseChatSearchOptions): UseChatSearchReturn {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageWithRelations[]>(
    [],
  );
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);

      if (!query.trim()) {
        setSearchResults([]);
        setCurrentSearchIndex(0);
        return;
      }

      try {
        const trimmed = query.trim();
        const apiResults = e2eeEnabledRef.current
          ? null
          : await messagingAPI.searchMessages(conversationId, trimmed, {
              limit: 50,
            });

        let results: MessageWithRelations[];

        if (apiResults !== null) {
          // Server returned results — map them to MessageWithRelations
          results = apiResults
            .filter((msg) => msg.message_type !== "system" && !msg.is_deleted)
            .map((msg) => {
              const enriched = msg as MessageWithRelations;
              return {
                ...enriched,
                status: enriched.status || ("sent" as const),
              };
            });
        } else {
          // Fallback: client-side search on loaded messages
          results = messages.filter((msg) => {
            if (msg.message_type === "system" || msg.is_deleted) return false;
            if (!msg.content) return false;
            return msg.content.toLowerCase().includes(trimmed.toLowerCase());
          });
        }

        setSearchResults(results);
        setCurrentSearchIndex(0);

        // Scroll to first result after a short delay to ensure list is rendered
        if (results.length > 0 && flatListRef.current) {
          setTimeout(() => {
            const firstResultIndex = messagesWithSeparators.findIndex(
              (item) => !isDateSeparator(item) && item.id === results[0].id,
            );

            if (firstResultIndex !== -1 && flatListRef.current) {
              try {
                flatListRef.current.scrollToIndex({
                  index: firstResultIndex,
                  animated: true,
                  viewPosition: 0.5,
                });
              } catch (error) {
                logger.warn(
                  "ChatScreen",
                  "Error scrolling to search result",
                  error,
                );
              }
            }
          }, 100);
        }
      } catch (error) {
        logger.error("ChatScreen", "Error in search", error);
        setSearchResults([]);
        setCurrentSearchIndex(0);
      }
    },
    [
      conversationId,
      messages,
      messagesWithSeparators,
      e2eeEnabledRef,
      flatListRef,
    ],
  );

  const handleSearchNext = useCallback(() => {
    if (
      currentSearchIndex < searchResults.length - 1 &&
      searchResults.length > 0
    ) {
      try {
        const newIndex = currentSearchIndex + 1;
        setCurrentSearchIndex(newIndex);
        const result = searchResults[newIndex];
        if (!result) {
          logger.warn(
            "ChatScreen",
            `Search result not found at index: ${newIndex}`,
          );
          return;
        }
        const resultIndex = messagesWithSeparators.findIndex(
          (item) => !isDateSeparator(item) && item.id === result.id,
        );
        if (resultIndex !== -1 && flatListRef.current) {
          try {
            flatListRef.current.scrollToIndex({
              index: resultIndex,
              animated: true,
              viewPosition: 0.5,
            });
          } catch (error) {
            logger.warn(
              "ChatScreen",
              "Error scrolling to next search result",
              error,
            );
          }
        } else {
          logger.warn(
            "ChatScreen",
            `Search result not found in messages list: ${result.id}`,
          );
        }
      } catch (error) {
        logger.error("ChatScreen", "Error in handleSearchNext", error);
      }
    }
  }, [currentSearchIndex, searchResults, messagesWithSeparators, flatListRef]);

  const handleSearchPrevious = useCallback(() => {
    if (currentSearchIndex > 0 && searchResults.length > 0) {
      try {
        const newIndex = currentSearchIndex - 1;
        setCurrentSearchIndex(newIndex);
        const result = searchResults[newIndex];
        if (!result) {
          logger.warn(
            "ChatScreen",
            `Search result not found at index: ${newIndex}`,
          );
          return;
        }
        const resultIndex = messagesWithSeparators.findIndex(
          (item) => !isDateSeparator(item) && item.id === result.id,
        );
        if (resultIndex !== -1 && flatListRef.current) {
          try {
            flatListRef.current.scrollToIndex({
              index: resultIndex,
              animated: true,
              viewPosition: 0.5,
            });
          } catch (error) {
            logger.warn(
              "ChatScreen",
              "Error scrolling to previous search result",
              error,
            );
          }
        } else {
          logger.warn(
            "ChatScreen",
            `Search result not found in messages list: ${result.id}`,
          );
        }
      } catch (error) {
        logger.error("ChatScreen", "Error in handleSearchPrevious", error);
      }
    }
  }, [currentSearchIndex, searchResults, messagesWithSeparators, flatListRef]);

  return {
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    currentSearchIndex,
    setCurrentSearchIndex,
    handleSearch,
    handleSearchNext,
    handleSearchPrevious,
  };
}
