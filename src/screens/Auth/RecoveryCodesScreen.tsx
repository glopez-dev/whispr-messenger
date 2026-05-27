import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { Button } from "../../components";
import { useTheme } from "../../context/ThemeContext";
import { AuthService } from "../../services/AuthService";
import { profileSetupFlag } from "../../services/profileSetupFlag";
import { colors, spacing, typography } from "../../theme";
import type { AuthStackParamList } from "../../navigation/types";

type NavigationProp = StackNavigationProp<AuthStackParamList, "RecoveryCodes">;
type RecoveryCodesRouteProp = RouteProp<AuthStackParamList, "RecoveryCodes">;

export const RecoveryCodesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RecoveryCodesRouteProp>();
  // mode "resume" = user connecté qui n'a pas encore validé ses codes
  const isResumeMode = route.params?.mode === "resume";
  const insets = useSafeAreaInsets();
  const { getThemeColors, getFontSize, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();

  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    AuthService.fetchRecoveryCodes()
      .then((fetched) => {
        setCodes(fetched);
        setLoading(false);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCopyAll = () => {
    Clipboard.setString(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleContinue = async () => {
    setProceeding(true);
    if (isResumeMode) {
      // Notifie le backend que l'user a bien sauvegardé ses codes.
      // Erreur non-bloquante : on navigue quand même vers l'app.
      await AuthService.acknowledgeRecoveryCodes().catch(() => {});
      navigation.reset({ index: 0, routes: [{ name: "ConversationsList" }] });
    } else {
      await profileSetupFlag.markPending();
      navigation.reset({ index: 0, routes: [{ name: "ProfileSetup" }] });
    }
  };

  return (
    <LinearGradient
      colors={themeColors.background.gradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.animatedContent,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.iconCircle}>
            <Ionicons
              name="shield-checkmark"
              size={36}
              color={colors.text.light}
            />
          </View>

          <Text style={[styles.title, { fontSize: getFontSize("xxl") }]}>
            {getLocalizedText("auth.yourRecoveryCodes")}
          </Text>

          {isResumeMode && (
            <View style={styles.resumeBanner}>
              <Ionicons
                name="alert-circle"
                size={20}
                color="#ef4444"
                style={styles.warningIcon}
              />
              <Text
                style={[
                  styles.resumeBannerText,
                  { fontSize: getFontSize("sm") },
                ]}
              >
                {
                  "Tu n'as pas encore sauvegardé tes codes de récupération.\nNe perds pas cette clé secrète : elle permet de recouvrer l'accès à ton compte si tu changes de téléphone ou perds ton appareil."
                }
              </Text>
            </View>
          )}

          <View style={styles.warningCard}>
            <Ionicons
              name="warning-outline"
              size={18}
              color={colors.ui.warning ?? "#f59e0b"}
              style={styles.warningIcon}
            />
            <Text style={[styles.warningText, { fontSize: getFontSize("sm") }]}>
              {getLocalizedText("auth.recoveryCodesWarning")}
            </Text>
          </View>

          {loading ? (
            <View style={styles.codesPlaceholder}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={styles.codeSkeleton} />
              ))}
            </View>
          ) : (
            <View style={styles.codesGrid}>
              {codes.map((code, i) => (
                <View key={i} style={styles.codeItem}>
                  <Text style={styles.codeIndex}>{i + 1}</Text>
                  <Text style={styles.codeText}>{code}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.copyButton}
            onPress={handleCopyAll}
            activeOpacity={0.75}
            disabled={loading}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={16}
              color={colors.text.light}
              style={styles.copyIcon}
            />
            <Text style={[styles.copyText, { fontSize: getFontSize("sm") }]}>
              {copied
                ? getLocalizedText("auth.codeCopied")
                : getLocalizedText("auth.copyAllCodes")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setConfirmed((v) => !v)}
            activeOpacity={0.8}
          >
            <View
              style={[styles.checkbox, confirmed && styles.checkboxChecked]}
            >
              {confirmed && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={colors.text.light}
                />
              )}
            </View>
            <Text
              style={[styles.checkboxLabel, { fontSize: getFontSize("sm") }]}
            >
              {getLocalizedText("auth.iSavedMyCodes")}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Sticky CTA — always visible regardless of scroll position */}
      <View
        style={[
          styles.stickyFooter,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Button
          title={getLocalizedText("auth.continueToApp")}
          variant="primary"
          size="large"
          fullWidth
          disabled={!confirmed || loading}
          loading={proceeding}
          onPress={handleContinue}
        />
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  animatedContent: {
    width: "100%",
    alignItems: "center",
  },
  stickyFooter: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: "transparent",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary.main,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontWeight: "800",
    color: colors.text.light,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  resumeBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(239, 68, 68, 0.5)",
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    width: "100%",
  },
  resumeBannerText: {
    color: "#fca5a5",
    flex: 1,
    lineHeight: 20,
    fontWeight: "600",
  },
  warningCard: {
    flexDirection: "row",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
    width: "100%",
  },
  warningIcon: { flexShrink: 0, marginTop: 1 },
  warningText: {
    color: colors.text.light,
    flex: 1,
    opacity: 0.9,
    lineHeight: 20,
  },
  codesGrid: {
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  codeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
    gap: spacing.md,
  },
  codeIndex: {
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: typography.fontSize.xs ?? 11,
    width: 18,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  codeText: {
    color: colors.text.light,
    fontFamily: "monospace" as any,
    fontSize: typography.fontSize.base,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  codesPlaceholder: {
    width: "100%",
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  codeSkeleton: {
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  copyIcon: {},
  copyText: {
    color: colors.text.light,
    opacity: 0.75,
    fontWeight: "500",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.xl,
    width: "100%",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  checkboxLabel: {
    color: colors.text.light,
    opacity: 0.85,
    flex: 1,
    lineHeight: 20,
  },
});
