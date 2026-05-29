import React, { useRef, useEffect } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { Button } from "@/components";
import { useTheme } from "@/context/ThemeContext";
import { colors, spacing, typography } from "@/theme";
import type { AuthStackParamList } from "@/navigation/types";

type NavigationProp = StackNavigationProp<
  AuthStackParamList,
  "AccountRecovered"
>;

export const AccountRecoveredScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { getThemeColors, getFontSize, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <LinearGradient
      colors={themeColors.background.gradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Animated.View
        style={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xxxl,
            paddingBottom: insets.bottom + spacing.xl,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Animated.View
          style={[styles.iconWrapper, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={52} color={colors.text.light} />
          </View>
        </Animated.View>

        <Text style={[styles.title, { fontSize: getFontSize("xxxl") }]}>
          {getLocalizedText("auth.accountRecoveredTitle")}
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: themeColors.text.secondary,
              fontSize: getFontSize("base"),
            },
          ]}
        >
          {getLocalizedText("auth.accountRecoveredSubtitle")}
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons
              name="key-outline"
              size={20}
              color={colors.primary.main}
              style={styles.infoIcon}
            />
            <Text style={[styles.infoText, { fontSize: getFontSize("sm") }]}>
              {getLocalizedText("auth.accountRecoveredKeysInfo")}
            </Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Ionicons
              name="phone-portrait-outline"
              size={20}
              color={colors.primary.main}
              style={styles.infoIcon}
            />
            <Text style={[styles.infoText, { fontSize: getFontSize("sm") }]}>
              {getLocalizedText("auth.accountRecoveredDevicesInfo")}
            </Text>
          </View>
        </View>

        <View style={styles.ctaWrapper}>
          <Button
            title={getLocalizedText("auth.accountRecoveredCta")}
            variant="primary"
            size="large"
            fullWidth
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: "ConversationsList" }],
              })
            }
          />
        </View>
      </Animated.View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    marginBottom: spacing.xxxl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary.main,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontWeight: "800",
    color: colors.text.light,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    textAlign: "center",
    opacity: 0.8,
    marginBottom: spacing.xxxl,
  },
  infoCard: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xxxl,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  infoIcon: {
    flexShrink: 0,
  },
  infoText: {
    color: colors.text.light,
    flex: 1,
    opacity: 0.9,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginHorizontal: spacing.xs,
  },
  ctaWrapper: {
    width: "100%",
  },
});
