import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

type ThemeColors = ReturnType<ReturnType<typeof useTheme>["getThemeColors"]>;
type GetFontSize = ReturnType<typeof useTheme>["getFontSize"];

export interface SettingItemProps {
  label: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  rightComponent?: React.ReactNode;
  icon?: string;
  themeColors: ThemeColors;
  getFontSize: GetFontSize;
}

export const SettingItem: React.FC<SettingItemProps> = ({
  label,
  subtitle,
  value,
  onPress,
  rightComponent,
  icon,
  themeColors,
  getFontSize,
}) => (
  <TouchableOpacity
    style={styles.settingItem}
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
  >
    <View style={styles.settingItemLeft}>
      {icon && (
        <Ionicons
          name={icon as never}
          size={20}
          color={themeColors.text.secondary}
          style={styles.settingIcon}
        />
      )}
      <View style={styles.settingTextContainer}>
        <Text
          style={[
            styles.settingLabel,
            {
              color: themeColors.text.primary,
              fontSize: getFontSize("base"),
            },
          ]}
        >
          {label}
        </Text>
        {subtitle && (
          <Text
            style={[
              styles.settingSubtitle,
              {
                color: themeColors.text.secondary,
                fontSize: getFontSize("sm"),
              },
            ]}
          >
            {subtitle}
          </Text>
        )}
        {value && !subtitle && (
          <Text
            style={[
              styles.settingValue,
              {
                color: themeColors.text.secondary,
                fontSize: getFontSize("sm"),
              },
            ]}
          >
            {value}
          </Text>
        )}
      </View>
    </View>
    {rightComponent || (
      <Ionicons
        name="chevron-forward"
        size={20}
        color={themeColors.text.tertiary}
      />
    )}
  </TouchableOpacity>
);

export interface SettingSectionProps {
  title: string;
  icon: string;
  themeColors: ThemeColors;
  getFontSize: GetFontSize;
  children: React.ReactNode;
}

export const SettingSection: React.FC<SettingSectionProps> = ({
  title,
  icon,
  themeColors,
  getFontSize,
  children,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons
        name={icon as never}
        size={20}
        color={themeColors.text.secondary}
        style={styles.sectionIcon}
      />
      <Text
        style={[
          styles.sectionTitle,
          { color: themeColors.text.primary, fontSize: getFontSize("lg") },
        ]}
      >
        {title}
      </Text>
    </View>
    <View style={styles.sectionShadow}>
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 80}
        tint="dark"
        style={styles.sectionContent}
      >
        {children}
      </BlurView>
    </View>
  </View>
);

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
  },
  sectionShadow: {
    borderRadius: 12,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionContent: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor:
      Platform.OS === "ios"
        ? "rgba(20, 25, 50, 0.35)"
        : "rgba(20, 25, 50, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontWeight: "500",
  },
  settingSubtitle: {
    marginTop: 2,
  },
  settingValue: {
    marginTop: 2,
  },
});
