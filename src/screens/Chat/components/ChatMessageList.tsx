import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  ListRenderItem,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ComposedGesture,
  GestureDetector,
  GestureType,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { EmptyChatState } from "../../../components/Chat/EmptyChatState";
import type { ChatListItem } from "../helpers/dateSeparators";

export interface ChatMessageListProps {
  flatListRef: React.RefObject<FlatList | null>;
  data: ChatListItem[];
  renderItem: ListRenderItem<ChatListItem>;
  keyExtractor: (item: ChatListItem) => string;
  onScroll: (e: unknown) => void;
  onEndReached: () => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  onViewableItemsChanged: (info: {
    viewableItems: { index: number | null }[];
  }) => void;
  loadingMore: boolean;
  isEmpty: boolean;
  pendingNewCount: number;
  onScrollToBottom: () => void;
  swipeGesture: ComposedGesture | GestureType;
  themeColors: { primary: string };
}

export function ChatMessageList({
  flatListRef,
  data,
  renderItem,
  keyExtractor,
  onScroll,
  onEndReached,
  viewabilityConfig,
  onViewableItemsChanged,
  loadingMore,
  isEmpty,
  pendingNewCount,
  onScrollToBottom,
  swipeGesture,
  themeColors,
}: ChatMessageListProps) {
  const messageList = (
    <FlatList
      ref={flatListRef}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      inverted
      contentContainerStyle={styles.listContent}
      removeClippedSubviews={Platform.OS === "android"}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      initialNumToRender={15}
      windowSize={10}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      keyboardShouldPersistTaps="handled"
      // Dismiss the keyboard as the user drags the message list. iOS
      // gets the interactive variant (clavier qui descend avec le doigt) ;
      // Android n'a pas d'équivalent natif, on reste sur "on-drag".
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      // Web : on absolute-positionne la FlatList à l'intérieur du
      // wrapper `webListViewport` (qui est `position: relative`). Ça
      // donne à la VirtualizedList une boîte de taille définie sans
      // dépendre du flex layout, indispensable pour que Chrome accepte
      // de scroller sur la molette quand `inverted` est actif.
      style={Platform.OS === "web" ? styles.webFlatListAbsolute : undefined}
      ListFooterComponent={
        loadingMore ? (
          <View
            style={styles.loadingMore}
            accessibilityState={{ busy: true }}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator size="small" color={themeColors.primary} />
          </View>
        ) : null
      }
    />
  );

  // Tap on an empty area of the message list dismisses the keyboard.
  // onStartShouldSetResponder only fires when no child grabs the touch
  // first (message bubbles, action handlers, etc.), so this won't
  // hijack interactions on actual content.
  const dismissKeyboardResponderProps = {
    onStartShouldSetResponder: () => true,
    onResponderRelease: () => Keyboard.dismiss(),
  };

  const newMessagesPill = pendingNewCount > 0 && (
    <View style={styles.newMessagesPillContainer}>
      <TouchableOpacity
        onPress={onScrollToBottom}
        activeOpacity={0.85}
        style={styles.newMessagesPill}
      >
        <Ionicons
          name="arrow-down"
          size={16}
          color="rgba(255, 255, 255, 0.92)"
          style={{ marginRight: 6 }}
        />
        <Text style={styles.newMessagesPillText}>
          {pendingNewCount} nouveau
          {pendingNewCount > 1 ? "x" : ""} message
          {pendingNewCount > 1 ? "s" : ""}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const emptyOverlay = isEmpty && (
    <View style={styles.emptyChatOverlay} pointerEvents="box-none">
      <EmptyChatState />
    </View>
  );

  // Web : on emballe la FlatList dans un viewport à overflow borné : ainsi
  // Chrome garde le wheel sur la ScrollView interne (scrollable) sans qu'un
  // overflow:hidden sur un ancêtre bloque l'event en amont.
  if (Platform.OS === "web") {
    return (
      <View style={styles.webListViewport} {...dismissKeyboardResponderProps}>
        {messageList}
        {emptyOverlay}
        {newMessagesPill}
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipeGesture}>
      <View
        style={{ flex: 1, position: "relative" }}
        {...dismissKeyboardResponderProps}
      >
        {messageList}
        {emptyOverlay}
        {newMessagesPill}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: 16,
  },
  webListViewport: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    // `position: relative` permet à la FlatList interne d'utiliser
    // `position: absolute, inset: 0` pour s'imposer une hauteur définie : sans
    // ça, `flex: 1, minHeight: 0` seul ne suffit pas à react-native-web pour
    // donner une bordure de scroll à un VirtualizedList inversé. Conséquence :
    // la ScrollView interne grandit avec le contenu et la molette n'a rien à
    // scroller.
    position: "relative",
  },
  webFlatListAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 0,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyChatOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  newMessagesPillContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: "center",
  },
  newMessagesPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(13, 18, 40, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  newMessagesPillText: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 13,
    fontWeight: "600",
  },
});
