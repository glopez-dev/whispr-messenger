/**
 * AdminDemosScreen - Ecran de demonstration des modeles IA pour les prospects.
 * Accessible uniquement aux administrateurs via AdminGate.
 *
 * Les deux modeles (Zeyou / Maya) ne sont pas encore implementes dans
 * moderation-service (seul NudeNet est en prod). Les boutons sont desactives
 * en attendant l'integration - cf WHISPR-admin-demos.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { AdminGate } from "../../components/Moderation";

interface DemoModel {
  id: string;
  title: string;
  description: string;
}

const DEMO_MODELS: DemoModel[] = [
  {
    id: "zeyou",
    title: "Modele V1 (Zeyou)",
    description:
      "Premier modele de classification IA. Detecte les contenus inappropries sur image et texte.",
  },
  {
    id: "maya",
    title: "Modele V2 (Maya)",
    description:
      "Deuxieme modele, architecture amelioree. Meilleure precision sur les cas limites.",
  },
];

export const AdminDemosScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <LinearGradient
      colors={colors.background.gradient.app}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AdminGate>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Demos IA</Text>
            <View style={styles.headerPlaceholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>
              Demonstration des modeles de moderation IA pour les prospects.
              L'integration backend est en cours - les boutons seront actives a
              la livraison de Zeyou et Maya.
            </Text>

            {DEMO_MODELS.map((model) => (
              <View
                key={model.id}
                style={styles.card}
                testID={`demo-card-${model.id}`}
              >
                <View style={styles.cardHeader}>
                  <Ionicons
                    name="cube-outline"
                    size={22}
                    color={colors.primary.main}
                  />
                  <Text style={styles.cardTitle}>{model.title}</Text>
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Bientôt</Text>
                  </View>
                </View>

                <Text style={styles.cardDescription}>{model.description}</Text>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.demoButton, styles.demoButtonDisabled]}
                    disabled={true}
                    activeOpacity={1}
                    testID={`btn-image-${model.id}`}
                    accessibilityState={{ disabled: true }}
                    accessibilityHint="Disponible quand le modele sera deploye"
                  >
                    <Ionicons
                      name="image-outline"
                      size={16}
                      color="rgba(255,255,255,0.35)"
                    />
                    <Text
                      style={[
                        styles.demoButtonText,
                        styles.demoButtonTextDisabled,
                      ]}
                    >
                      Tester sur image
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.demoButton,
                      styles.demoButtonSecondary,
                      styles.demoButtonDisabled,
                    ]}
                    disabled={true}
                    activeOpacity={1}
                    testID={`btn-text-${model.id}`}
                    accessibilityState={{ disabled: true }}
                    accessibilityHint="Disponible quand le modele sera deploye"
                  >
                    <Ionicons
                      name="text-outline"
                      size={16}
                      color="rgba(255,255,255,0.25)"
                    />
                    <Text
                      style={[
                        styles.demoButtonText,
                        styles.demoButtonTextSecondary,
                        styles.demoButtonTextDisabled,
                      ]}
                    >
                      Tester sur texte
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {__DEV__ && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="key-outline" size={22} color="#f59e0b" />
                  <Text style={[styles.cardTitle, { color: "#f59e0b" }]}>
                    Preview — Recovery Backup Codes
                  </Text>
                </View>
                <Text style={styles.cardDescription}>
                  Écrans de récupération par code de backup (données mockées,
                  DEV uniquement).
                </Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.demoButton}
                    onPress={() => navigation.navigate("RecoveryCodes")}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.demoButtonText}>RecoveryCodes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.demoButton, styles.demoButtonSecondary]}
                    onPress={() => navigation.navigate("RecoveryCodeEntry")}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="enter-outline"
                      size={16}
                      color="rgba(255,255,255,0.8)"
                    />
                    <Text
                      style={[
                        styles.demoButtonText,
                        styles.demoButtonTextSecondary,
                      ]}
                    >
                      CodeEntry
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </AdminGate>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
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
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  headerPlaceholder: {
    width: 36,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  intro: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cardDescription: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.65)",
    lineHeight: 18,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  demoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary.main,
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  demoButtonSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  demoButtonDisabled: {
    opacity: 0.45,
  },
  demoButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  demoButtonTextSecondary: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  demoButtonTextDisabled: {
    color: "rgba(255, 255, 255, 0.35)",
  },
  comingSoonBadge: {
    marginLeft: "auto",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  comingSoonText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  bottomSpacer: {
    height: 40,
  },
});
