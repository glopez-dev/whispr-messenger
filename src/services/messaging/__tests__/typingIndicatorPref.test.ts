/**
 * Tests pour typingIndicatorPref - cache local du toggle indicateur de saisie.
 *
 * Note : AsyncStorage est mappe sur le mock officiel dans la config Jest
 * (moduleNameMapper). On manipule donc ce mock directement plutot que de
 * le re-mock localement.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  hydrateTypingIndicatorPref,
  getTypingIndicatorEnabled,
  setTypingIndicatorEnabled,
  isTypingIndicatorPrefHydrated,
  __resetTypingIndicatorPrefForTests,
} from "@/services/messaging/typingIndicatorPref";

const STORAGE_KEY = "@whispr_settings_messaging";

beforeEach(async () => {
  __resetTypingIndicatorPrefForTests();
  await AsyncStorage.clear();
});

describe("typingIndicatorPref", () => {
  it("retourne true par defaut quand AsyncStorage est vide", async () => {
    const value = await hydrateTypingIndicatorPref();
    expect(value).toBe(true);
    expect(getTypingIndicatorEnabled()).toBe(true);
    expect(isTypingIndicatorPrefHydrated()).toBe(true);
  });

  it("hydrate la valeur depuis le JSON stocke", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ typingIndicator: false }),
    );
    const value = await hydrateTypingIndicatorPref();
    expect(value).toBe(false);
    expect(getTypingIndicatorEnabled()).toBe(false);
  });

  it("ignore les payloads sans champ typingIndicator boolean", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ readReceipts: false }),
    );
    const value = await hydrateTypingIndicatorPref();
    expect(value).toBe(true);
  });

  it("garde le defaut true si AsyncStorage throw", async () => {
    const original = AsyncStorage.getItem;
    (AsyncStorage as { getItem: jest.Mock }).getItem = jest
      .fn()
      .mockRejectedValue(new Error("boom"));
    try {
      const value = await hydrateTypingIndicatorPref();
      expect(value).toBe(true);
    } finally {
      (AsyncStorage as { getItem: typeof original }).getItem = original;
    }
  });

  it("setTypingIndicatorEnabled met a jour le mirror immediatement", () => {
    setTypingIndicatorEnabled(false);
    expect(getTypingIndicatorEnabled()).toBe(false);
    setTypingIndicatorEnabled(true);
    expect(getTypingIndicatorEnabled()).toBe(true);
  });
});
