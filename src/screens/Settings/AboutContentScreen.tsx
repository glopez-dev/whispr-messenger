/**
 * AboutContentScreen — contenu, securite, liens legaux et CTA signalement (WHISPR).
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";

export const AboutContentScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const { getThemeColors, getFontSize, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();

  const bodyStyle = [
    styles.bodyText,
    {
      color: themeColors.text.secondary,
      fontSize: getFontSize("base"),
      lineHeight: Math.round(getFontSize("base") * 1.45),
    },
  ];

  return (
    <LinearGradient
      colors={themeColors.background.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={__DEV__}
      >
        <View style={[styles.header, { paddingTop: 56 + insets.top }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={getLocalizedText("settings.title")}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={themeColors.text.primary}
            />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              {
                color: themeColors.text.primary,
                fontSize: getFontSize("xxl"),
              },
            ]}
          >
            {getLocalizedText("about.title")}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color={themeColors.primary}
              style={styles.sectionIcon}
            />
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: themeColors.text.primary,
                  fontSize: getFontSize("sm"),
                  letterSpacing: 0.8,
                },
              ]}
            >
              {getLocalizedText("about.sectionContentSecurity").toUpperCase()}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: themeColors.background.secondary },
            ]}
          >
            <Text style={bodyStyle}>{getLocalizedText("about.p1")}</Text>
            <Text style={[bodyStyle, styles.paragraphGap]}>
              {getLocalizedText("about.p2")}
            </Text>
            <Text style={[bodyStyle, styles.paragraphGap]}>
              {getLocalizedText("about.p3")}
            </Text>

            <View
              style={[
                styles.callout,
                {
                  backgroundColor: themeColors.background.tertiary,
                  borderColor: themeColors.secondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.calloutText,
                  {
                    color: themeColors.text.secondary,
                    fontSize: getFontSize("sm"),
                    lineHeight: Math.round(getFontSize("sm") * 1.45),
                  },
                ]}
              >
                {getLocalizedText("about.reportCallout")}
              </Text>
            </View>

            <Text style={[bodyStyle, styles.paragraphGap]}>
              {getLocalizedText("about.p4")}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.legalButton,
              {
                backgroundColor: themeColors.background.secondary,
                borderColor: themeColors.secondary,
              },
            ]}
            onPress={() => navigation.navigate("PrivacyPolicy")}
            accessibilityRole="button"
            accessibilityLabel={getLocalizedText("about.privacyPolicy")}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={themeColors.primary}
            />
            <Text
              style={[
                styles.legalButtonLabel,
                {
                  color: themeColors.text.primary,
                  fontSize: getFontSize("base"),
                },
              ]}
            >
              {getLocalizedText("about.privacyPolicy")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.legalButton,
              {
                backgroundColor: themeColors.background.secondary,
                borderColor: themeColors.secondary,
              },
            ]}
            onPress={() => navigation.navigate("TermsOfUse")}
            accessibilityRole="button"
            accessibilityLabel={getLocalizedText("about.termsOfUse")}
          >
            <Ionicons
              name="document-text-outline"
              size={20}
              color={themeColors.primary}
            />
            <Text
              style={[
                styles.legalButtonLabel,
                {
                  color: themeColors.text.primary,
                  fontSize: getFontSize("base"),
                },
              ]}
            >
              {getLocalizedText("about.termsOfUse")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.legalButton,
              {
                backgroundColor: themeColors.background.secondary,
                borderColor: themeColors.secondary,
              },
            ]}
            onPress={() => navigation.navigate("ModerationTest")}
            accessibilityRole="button"
            accessibilityLabel={getLocalizedText("about.testImageAnalysis")}
          >
            <Ionicons
              name="scan-outline"
              size={20}
              color={themeColors.primary}
            />
            <Text
              style={[
                styles.legalButtonLabel,
                {
                  color: themeColors.text.primary,
                  fontSize: getFontSize("base"),
                },
              ]}
            >
              {getLocalizedText("about.testImageAnalysis")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.reportButton,
              { backgroundColor: themeColors.primary, opacity: 0.45 },
            ]}
            disabled={true}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityHint={getLocalizedText("about.reportComingSoon")}
            testID="btn-report-content"
          >
            <Ionicons name="flag-outline" size={22} color="#FFFFFF" />
            <Text
              style={[
                styles.reportButtonLabel,
                { fontSize: getFontSize("lg") },
              ]}
            >
              {getLocalizedText("about.reportContent")}
            </Text>
            <View style={styles.reportComingSoonBadge}>
              <Text style={styles.reportComingSoonText}>
                {getLocalizedText("common.soon")}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backButton: { marginRight: 12 },
  headerTitle: { fontWeight: "700", flex: 1 },
  section: { marginTop: 8 },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIcon: { marginRight: 8 },
  sectionTitle: { fontWeight: "700" },
  card: {
    borderRadius: 14,
    padding: 18,
  },
  bodyText: {},
  paragraphGap: { marginTop: 14 },
  callout: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  calloutText: { fontStyle: "italic" },
  actions: { marginTop: 24, gap: 12 },
  legalButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  legalButtonLabel: { fontWeight: "600", flex: 1 },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  reportButtonLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  reportComingSoonBadge: {
    position: "absolute",
    right: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reportComingSoonText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
  },
});

export default AboutContentScreen;
