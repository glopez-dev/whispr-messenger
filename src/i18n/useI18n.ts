import { useCallback, useMemo } from "react";
import { useTheme, type Language } from "../context/ThemeContext";
import { localizeText } from "./strings";

export interface UseI18nReturn {
  /** Current language ("fr" or "en"). */
  language: Language;
  /** Look up a localized string by key. Falls back to the key itself when missing. */
  t: (key: string) => string;
}

/**
 * Localized-strings hook. Prefer this over destructuring
 * `getLocalizedText` from `useTheme()` for new code: i18n has nothing
 * to do with theme/colors/font sizes, and decoupling the two lets us
 * eventually move the strings table behind a different storage or
 * translation library without disturbing the theme system.
 */
export function useI18n(): UseI18nReturn {
  const { settings } = useTheme();
  const language = settings.language;
  const t = useCallback(
    (key: string) => localizeText(language, key),
    [language],
  );
  return useMemo(() => ({ language, t }), [language, t]);
}
