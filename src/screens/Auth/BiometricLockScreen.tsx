import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as LocalAuthentication from "expo-local-authentication";
import { Logo } from "@/components";
import { useTheme } from "@/context/ThemeContext";
import { colors, spacing, typography } from "@/theme";

interface BiometricLockScreenProps {
  onUnlock: () => void;
}

export const BiometricLockScreen: React.FC<BiometricLockScreenProps> = ({
  onUnlock,
}) => {
  const { getThemeColors, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();

  const prompt = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: getLocalizedText("biometric.promptMessage"),
      cancelLabel: getLocalizedText("biometric.cancelLabel"),
      disableDeviceFallback: false,
    });
    if (result.success) onUnlock();
  };

  useEffect(() => {
    prompt();
  }, []);

  return (
    <LinearGradient
      colors={themeColors.background.gradient as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        <Logo variant="icon" size="xlarge" />
        <Text style={styles.title}>Whispr</Text>
        <Text style={styles.subtitle}>
          {getLocalizedText("biometric.lockSubtitle")}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={prompt}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {getLocalizedText("biometric.unlockButton")}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: "800",
    color: colors.text.light,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary.main,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary.main,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: typography.fontSize.md,
    fontWeight: "700",
  },
});
