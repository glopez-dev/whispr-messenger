import { Alert, Platform } from "react-native";

/**
 * Cross-platform alert: falls back to window.alert on web where
 * React Native's Alert API is a no-op.
 */
export function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}
