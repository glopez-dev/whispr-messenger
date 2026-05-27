/**
 * ScheduledMessagesScreen - List and manage pending scheduled messages.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { StackScreenProps } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, withOpacity } from "../../theme/colors";
import { useTheme } from "../../context/ThemeContext";
import {
  SchedulingService,
  ScheduledMessage,
} from "../../services/SchedulingService";
import { AuthStackParamList } from "../../navigation/types";
import { logger } from "../../utils/logger";

type ScheduledMessagesRouteProp = StackScreenProps<
  AuthStackParamList,
  "ScheduledMessages"
>["route"];

function formatScheduledDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Aujourd'hui à ${time}`;
  if (isTomorrow) return `Demain à ${time}`;

  const dayMonth = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  return `${dayMonth} à ${time}`;
}

function getStatusColor(status: ScheduledMessage["status"]): string {
  switch (status) {
    case "pending":
      return "#FFB07B";
    case "sent":
      return "#4CAF50";
    case "failed":
      return "#F04882";
    case "cancelled":
      return withOpacity(colors.text.light, 0.4);
    default:
      return colors.text.light;
  }
}

export const ScheduledMessagesScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<ScheduledMessagesRouteProp>();
  const { conversationId } = route.params;
  const { getThemeColors, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();

  const getStatusLabel = (status: ScheduledMessage["status"]): string => {
    switch (status) {
      case "pending":
        return getLocalizedText("scheduled.statusPending");
      case "sent":
        return getLocalizedText("scheduled.statusSent");
      case "failed":
        return getLocalizedText("scheduled.statusFailed");
      case "cancelled":
        return getLocalizedText("scheduled.statusCancelled");
      default:
        return status;
    }
  };

  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const data = await SchedulingService.getScheduledMessages({
        conversation_id: conversationId,
      });
      // Sort by scheduled_at ascending (soonest first)
      data.sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );
      setMessages(data);
    } catch (error) {
      logger.error(
        "ScheduledMessages",
        "Error loading scheduled messages",
        error,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadMessages();
  }, [loadMessages]);

  const handleCancel = useCallback(
    (message: ScheduledMessage) => {
      const preview = `"${message.content.substring(0, 80)}${message.content.length > 80 ? "..." : ""}"`;
      Alert.alert(
        getLocalizedText("scheduled.cancelAlertTitle"),
        `${getLocalizedText("scheduled.cancelAlertMessage")}\n\n${preview}`,
        [
          {
            text: getLocalizedText("scheduled.cancelAlertNo"),
            style: "cancel",
          },
          {
            text: getLocalizedText("scheduled.cancelAlertConfirm"),
            style: "destructive",
            onPress: async () => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                await SchedulingService.cancelScheduledMessage(message.id);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === message.id
                      ? { ...m, status: "cancelled" as const }
                      : m,
                  ),
                );
              } catch (error) {
                logger.error(
                  "ScheduledMessages",
                  "Error cancelling scheduled message",
                  error,
                );
                Alert.alert(
                  getLocalizedText("notif.error"),
                  getLocalizedText("scheduled.cancelError"),
                );
              }
            },
          },
        ],
      );
    },
    [getLocalizedText],
  );

  const renderItem = useCallback(
    ({ item }: { item: ScheduledMessage }) => {
      const isPending = item.status === "pending";
      const statusColor = getStatusColor(item.status);

      return (
        <View style={styles.messageCard}>
          <View style={styles.messageHeader}>
            <View style={styles.statusBadge}>
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }]}
              />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
            <View style={styles.scheduleTime}>
              <Ionicons
                name="time-outline"
                size={14}
                color={withOpacity(colors.text.light, 0.5)}
              />
              <Text style={styles.scheduleTimeText}>
                {formatScheduledDate(item.scheduled_at)}
              </Text>
            </View>
          </View>

          <Text style={styles.messageContent} numberOfLines={3}>
            {item.content}
          </Text>

          {isPending && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => handleCancel(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={16} color="#F04882" />
              <Text style={styles.cancelButtonText}>
                {getLocalizedText("scheduled.cancelButton")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [handleCancel, getLocalizedText, getStatusLabel],
  );

  const pendingCount = messages.filter((m) => m.status === "pending").length;

  return (
    <LinearGradient
      colors={colors.background.gradient.app}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={themeColors.text.primary}
            />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>
              {getLocalizedText("scheduled.title")}
            </Text>
            {pendingCount > 0 && (
              <Text style={styles.headerSubtitle}>
                {pendingCount} {getLocalizedText("scheduled.pendingCount")}
              </Text>
            )}
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary.main} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="timer-outline"
              size={64}
              color={withOpacity(colors.text.light, 0.2)}
            />
            <Text style={styles.emptyTitle}>
              {getLocalizedText("scheduled.empty")}
            </Text>
            <Text style={styles.emptySubtitle}>
              {getLocalizedText("scheduled.emptyHint")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary.main}
              />
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  backButton: {
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.light,
  },
  headerSubtitle: {
    fontSize: 12,
    color: withOpacity(colors.text.light, 0.5),
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.light,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: withOpacity(colors.text.light, 0.5),
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  messageCard: {
    backgroundColor: withOpacity(colors.background.dark, 0.4),
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: withOpacity(colors.ui.divider, 0.1),
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  scheduleTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scheduleTimeText: {
    fontSize: 12,
    color: withOpacity(colors.text.light, 0.5),
  },
  messageContent: {
    fontSize: 15,
    color: colors.text.light,
    lineHeight: 22,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: withOpacity("#F04882", 0.1),
    borderWidth: 1,
    borderColor: withOpacity("#F04882", 0.2),
    gap: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ui.warning,
  },
});
