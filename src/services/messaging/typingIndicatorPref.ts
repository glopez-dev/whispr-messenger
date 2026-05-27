/**
 * typingIndicatorPref - Cache local du toggle "Indicateur de saisie"
 *
 * Meme pattern que readReceiptsPref : le toggle vit dans AsyncStorage
 * sous la cle @whispr_settings_messaging. On garde un mirror memoire
 * hydrate au boot via hydrateTypingIndicatorPref() pour eviter une
 * lecture asynchrone a chaque event de frappe.
 *
 * Symetrie WhatsApp : si OFF -> on n'emet pas `user_typing: true` aux
 * autres. On laisse en revanche passer `user_typing: false` (stop) pour
 * que le destinataire qui voyait deja "en train d'ecrire" arrete de le
 * voir immediatement, et qu'il n'y ait pas de fantome typing apres avoir
 * coupe le toggle.
 *
 * Note importante : pas d'equivalent server-side aujourd'hui dans le DTO
 * privacy de user-service (cf. UserServiceBehaviour.get_privacy_settings/1
 * qui ne connait que read_receipts / last_seen_privacy / online_status).
 * Le gating est donc client-only, mais le toggle prend effet
 * immediatement parce que sendTyping lit ce mirror via getState() a
 * chaque appel.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@whispr_settings_messaging";

// par defaut on respecte l'ancien comportement : indicateurs actives
let cached: boolean = true;
let hydrated = false;

/**
 * Lit la preference depuis AsyncStorage et met a jour le mirror memoire.
 * A appeler au boot (App.tsx) et avant tout consumer qui veut etre sur
 * d'avoir la valeur courante.
 */
export async function hydrateTypingIndicatorPref(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.typingIndicator === "boolean") {
        cached = parsed.typingIndicator;
      }
    }
  } catch {
    // si AsyncStorage casse, on garde la valeur par defaut (true)
  }
  hydrated = true;
  return cached;
}

/**
 * Lecture synchrone du mirror memoire. Si pas hydrate -> defaut true.
 */
export function getTypingIndicatorEnabled(): boolean {
  return cached;
}

/**
 * Mise a jour synchrone du mirror (appelee depuis SettingsScreen quand
 * le user toggle, avant meme le persist async).
 */
export function setTypingIndicatorEnabled(value: boolean): void {
  cached = value;
  hydrated = true;
}

/**
 * Helper test-only : reset l'etat module pour repartir d'un cache vierge.
 */
export function __resetTypingIndicatorPrefForTests(): void {
  cached = true;
  hydrated = false;
}

/**
 * Indique si la preference a deja ete chargee. Utile pour les tests.
 */
export function isTypingIndicatorPrefHydrated(): boolean {
  return hydrated;
}
