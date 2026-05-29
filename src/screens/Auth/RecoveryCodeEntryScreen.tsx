import React, { useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { Button } from "@/components";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { AuthService } from "@/services/AuthService";
import { TokenService } from "@/services/TokenService";
import { colors, spacing, typography } from "@/theme";
import type { AuthStackParamList } from "@/navigation/types";

type NavigationProp = StackNavigationProp<
  AuthStackParamList,
  "RecoveryCodeEntry"
>;

export const RecoveryCodeEntryScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { getThemeColors, getFontSize, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();
  const { signIn } = useAuth();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 6,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -6,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const tokens = await AuthService.redeemRecoveryCode(trimmed);
      const payload = TokenService.decodeAccessToken(tokens.accessToken);
      if (payload) {
        await signIn(payload.sub, payload.deviceId);
      }
      navigation.reset({ index: 0, routes: [{ name: "ConversationsList" }] });
    } catch (err: unknown) {
      const apiError = err as { status?: number };
      if (apiError.status === 429) {
        setError(getLocalizedText("auth.recoveryCodeRateLimit"));
      } else {
        setError(getLocalizedText("auth.invalidRecoveryCode"));
      }
      shake();
    } finally {
      setLoading(false);
    }
  };

  const isCodeValid = code.trim().length >= 8;

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
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.xl,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.backText, { color: colors.text.light }]}>
              ←
            </Text>
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons name="key" size={32} color={colors.text.light} />
          </View>

          <Text style={[styles.title, { fontSize: getFontSize("xxl") }]}>
            {getLocalizedText("auth.enterRecoveryCode")}
          </Text>

          <Text style={[styles.subtitle, { fontSize: getFontSize("sm") }]}>
            {getLocalizedText("auth.recoveryCodePlaceholder")}
          </Text>

          <Animated.View
            style={[
              styles.inputWrapper,
              { transform: [{ translateX: shakeAnim }] },
              error ? styles.inputWrapperError : null,
            ]}
          >
            <TextInput
              style={[
                styles.input,
                { fontSize: getFontSize("base"), color: colors.text.light },
              ]}
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setError(null);
              }}
              placeholder={getLocalizedText("auth.recoveryCodePlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleRedeem}
            />
          </Animated.View>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons
                name="alert-circle-outline"
                size={14}
                color={colors.ui.error}
              />
              <Text style={[styles.errorText, { fontSize: getFontSize("xs") }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <View style={styles.ctaWrapper}>
            <Button
              title={getLocalizedText("auth.redeemCode")}
              variant="primary"
              size="large"
              fullWidth
              disabled={!isCodeValid || loading}
              loading={loading}
              onPress={handleRedeem}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: spacing.xl,
  },
  backText: {
    fontSize: 28,
    fontWeight: "300",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary.main,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontWeight: "700",
    color: colors.text.light,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginBottom: spacing.xl,
    fontFamily: "monospace" as any,
    letterSpacing: 1,
  },
  inputWrapper: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  inputWrapperError: {
    borderColor: colors.ui.error,
  },
  input: {
    fontFamily: "monospace" as any,
    letterSpacing: 2,
    fontWeight: "600",
    textAlign: "center",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  errorText: {
    color: colors.ui.error,
    flex: 1,
  },
  ctaWrapper: {
    marginTop: spacing.lg,
  },
});
