import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { AuthService } from "../../services/AuthService";
import { TwoFactorService } from "../../services/TwoFactorService";
import { TokenService } from "../../services/TokenService";
import { UserService } from "../../services/UserService";
import Toast from "../../components/Toast/Toast";
import type { AuthStackParamList } from "../../navigation/types";

type NavigationProp = StackNavigationProp<
  AuthStackParamList,
  "TwoFactorVerifyLogin"
>;
type RoutePropType = RouteProp<AuthStackParamList, "TwoFactorVerifyLogin">;

type Tab = "totp" | "backup";

export const TwoFactorVerifyLoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const { verificationId, deviceInfo, signalKeyBundle } = route.params;

  const { getThemeColors, getFontSize, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();
  const { signIn } = useAuth();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const [tab, setTab] = useState<Tab>("totp");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info" | "warning";
  }>({ visible: false, message: "", type: "info" });

  const showToast = (
    message: string,
    type: "success" | "error" | "info" | "warning" = "error",
  ) => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const finishLogin = async (tokens: {
    accessToken: string;
    refreshToken: string;
  }) => {
    await TokenService.saveTokens(tokens);
    const payload = TokenService.decodeAccessToken(tokens.accessToken);
    if (!payload) throw new Error("Invalid token");
    signIn(payload.sub, payload.deviceId);
    await UserService.getInstance().bootstrapAccount(payload.sub, "");
    navigation.reset({ index: 0, routes: [{ name: "ConversationsList" }] });
  };

  const handleTotpSubmit = async () => {
    if (totpCode.length < 6) {
      showToast(getLocalizedText("twoFactor.invalidCode"));
      return;
    }
    setLoading(true);
    try {
      const tokens = await AuthService.loginAfter2FA(
        verificationId,
        totpCode,
        deviceInfo,
        signalKeyBundle,
      );
      await finishLogin(tokens);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg =
        status === 400 || status === 401
          ? getLocalizedText("twoFactor.invalidCode")
          : getLocalizedText("auth.errorConnection");
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBackupSubmit = async () => {
    const trimmed = backupCode.replace(/\s/g, "");
    if (trimmed.length < 8) {
      showToast(getLocalizedText("twoFactor.invalidCode"));
      return;
    }
    setLoading(true);
    try {
      const tokens = await TwoFactorService.useBackupCode(
        trimmed,
        verificationId,
      );
      await finishLogin(tokens);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg =
        status === 400 || status === 401
          ? getLocalizedText("twoFactor.invalidCode")
          : getLocalizedText("auth.errorConnection");
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const accentColor = themeColors.primary;

  return (
    <LinearGradient
      colors={themeColors.background.gradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={[
            styles.flex,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={[
                  styles.backButton,
                  { backgroundColor: themeColors.background.secondary + "80" },
                ]}
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Retour"
              >
                <Ionicons
                  name="arrow-back"
                  size={22}
                  color={themeColors.text.primary}
                />
              </TouchableOpacity>
              <View style={styles.headerText}>
                <Text
                  style={[
                    styles.title,
                    {
                      color: themeColors.text.primary,
                      fontSize: getFontSize("xxl"),
                    },
                  ]}
                >
                  {getLocalizedText("twoFactor.loginTitle")}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  {getLocalizedText("twoFactor.loginSubtitle")}
                </Text>
              </View>
            </View>

            {/* Onglets */}
            <View
              style={[
                styles.tabRow,
                { backgroundColor: themeColors.background.secondary },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.tab,
                  tab === "totp" && {
                    backgroundColor: accentColor + "30",
                    borderBottomWidth: 2,
                    borderBottomColor: accentColor,
                  },
                ]}
                onPress={() => setTab("totp")}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === "totp" }}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        tab === "totp"
                          ? accentColor
                          : themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  {getLocalizedText("twoFactor.tabTotp")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  tab === "backup" && {
                    backgroundColor: accentColor + "30",
                    borderBottomWidth: 2,
                    borderBottomColor: accentColor,
                  },
                ]}
                onPress={() => setTab("backup")}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === "backup" }}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        tab === "backup"
                          ? accentColor
                          : themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  {getLocalizedText("twoFactor.tabBackupCode")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* TOTP */}
            {tab === "totp" && (
              <View style={styles.section}>
                <Text
                  style={[
                    styles.inputLabel,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  {getLocalizedText("twoFactor.enterTotpCode")}
                </Text>
                <TextInput
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: themeColors.background.secondary,
                      color: themeColors.text.primary,
                      borderColor: accentColor + "40",
                      fontSize: getFontSize("xl"),
                    },
                  ]}
                  value={totpCode}
                  onChangeText={setTotpCode}
                  placeholder="000000"
                  placeholderTextColor={themeColors.text.secondary + "80"}
                  maxLength={6}
                  keyboardType="number-pad"
                  autoFocus={tab === "totp"}
                  accessibilityLabel={getLocalizedText(
                    "twoFactor.enterTotpCode",
                  )}
                />
                <TouchableOpacity
                  onPress={handleTotpSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={[accentColor, accentColor + "CC"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitButton}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.submitButtonText,
                          { fontSize: getFontSize("base") },
                        ]}
                      >
                        {getLocalizedText("auth.continue")}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* Backup code */}
            {tab === "backup" && (
              <View style={styles.section}>
                <Text
                  style={[
                    styles.inputLabel,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  {getLocalizedText("twoFactor.enterBackupCode")}
                </Text>
                <TextInput
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: themeColors.background.secondary,
                      color: themeColors.text.primary,
                      borderColor: accentColor + "40",
                      fontSize: getFontSize("base"),
                      letterSpacing: 2,
                    },
                  ]}
                  value={backupCode}
                  onChangeText={setBackupCode}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  placeholderTextColor={themeColors.text.secondary + "80"}
                  maxLength={19}
                  autoCapitalize="characters"
                  autoFocus={tab === "backup"}
                  accessibilityLabel={getLocalizedText(
                    "twoFactor.enterBackupCode",
                  )}
                />
                <TouchableOpacity
                  onPress={handleBackupSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={[accentColor, accentColor + "CC"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitButton}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.submitButtonText,
                          { fontSize: getFontSize("base") },
                        ]}
                      >
                        {getLocalizedText("auth.continue")}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        duration={3500}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontWeight: "800" },
  subtitle: { opacity: 0.8 },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabText: { fontWeight: "600" },
  section: { paddingHorizontal: 20 },
  inputLabel: { marginBottom: 8 },
  codeInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 20,
  },
  submitButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});

export default TwoFactorVerifyLoginScreen;
