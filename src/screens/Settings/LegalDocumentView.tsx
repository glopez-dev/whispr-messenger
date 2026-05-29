import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import type { AuthStackParamList } from "@/navigation/types";
import {
  getLegalDocumentUrl,
  type LegalDocumentSlug,
} from "@/utils/legalDocumentUrl";

export interface LegalDocumentViewProps {
  slug: LegalDocumentSlug;
  titleKey: "about.privacyPolicy" | "about.termsOfUse";
}

export const LegalDocumentView: React.FC<LegalDocumentViewProps> = ({
  slug,
  titleKey,
}) => {
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const { getThemeColors, getFontSize, getLocalizedText } = useTheme();
  const themeColors = getThemeColors();
  const uri = useMemo(() => getLegalDocumentUrl(slug), [slug]);
  const [loading, setLoading] = useState(true);

  const header = (
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
          { color: themeColors.text.primary, fontSize: getFontSize("xxl") },
        ]}
      >
        {getLocalizedText(titleKey)}
      </Text>
    </View>
  );

  if (Platform.OS === "web") {
    return (
      <LinearGradient
        colors={themeColors.background.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {header}
        <View style={styles.webWrap}>
          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={themeColors.primary} />
            </View>
          )}
          {/* @ts-ignore — iframe is valid in React Native Web */}
          <iframe
            src={uri}
            style={{ flex: 1, width: "100%", height: "100%", border: "none" }}
            onLoad={() => setLoading(false)}
          />
        </View>
      </LinearGradient>
    );
  }

  const { WebView } = require("react-native-webview");

  return (
    <LinearGradient
      colors={themeColors.background.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {header}
      <View style={styles.webWrap}>
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        )}
        <WebView
          source={{ uri }}
          style={styles.webview}
          onLoadEnd={() => setLoading(false)}
          onError={() => setLoading(false)}
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          setSupportMultipleWindows={false}
        />
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  backButton: { marginRight: 12 },
  headerTitle: { fontWeight: "700", flex: 1 },
  webWrap: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#080d1a",
  },
  webview: { flex: 1, backgroundColor: "transparent" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
    backgroundColor: "rgba(8, 13, 26, 0.85)",
  },
});
