/**
 * LANGUAGE, IN ONE PLACE
 *
 * The form offers a list of languages as free text, the preview needs a `lang`
 * attribute and a writing direction, and the schema stage has to declare
 * `inLanguage` on the page it just wrote. Three consumers, one table — the same
 * reasoning that produced `briefWordTarget`: a second copy of this map is how
 * "Urdu" comes to mean `ur` in the preview and `en` in the structured data.
 *
 * It lived in the Article Writer's client constants file, which a server stage
 * has no business importing. It lives here now and that file re-exports it, so
 * the form and the preview keep the import path they had.
 *
 * Client-safe: no imports at all.
 */

export const LANGUAGES: string[] = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Swedish",
  "Polish",
  "Turkish",
  "Arabic",
  "Urdu",
  "Hindi",
  "Bengali",
  "Indonesian",
  "Malay",
  "Filipino",
  "Vietnamese",
  "Thai",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Russian",
  "Ukrainian",
  "Hebrew",
  "Persian",
];

/**
 * BCP-47 code and writing direction for each label above.
 *
 * The page preview needs both: `lang` is what a screen reader and a search
 * engine read, and an Arabic or Urdu article laid out left-to-right is not a
 * preview of anything. Anything missing from this map falls back to English
 * rather than guessing a code.
 */
export const LANGUAGE_LOCALES: Record<string, { code: string; rtl?: boolean }> = {
  English: { code: "en" },
  Spanish: { code: "es" },
  French: { code: "fr" },
  German: { code: "de" },
  Italian: { code: "it" },
  Portuguese: { code: "pt" },
  Dutch: { code: "nl" },
  Swedish: { code: "sv" },
  Polish: { code: "pl" },
  Turkish: { code: "tr" },
  Arabic: { code: "ar", rtl: true },
  Urdu: { code: "ur", rtl: true },
  Hindi: { code: "hi" },
  Bengali: { code: "bn" },
  Indonesian: { code: "id" },
  Malay: { code: "ms" },
  Filipino: { code: "fil" },
  Vietnamese: { code: "vi" },
  Thai: { code: "th" },
  Japanese: { code: "ja" },
  Korean: { code: "ko" },
  "Chinese (Simplified)": { code: "zh-Hans" },
  Russian: { code: "ru" },
  Ukrainian: { code: "uk" },
  Hebrew: { code: "he", rtl: true },
  Persian: { code: "fa", rtl: true },
};

/**
 * The code and direction for a label, English when the label is not in the table.
 *
 * The language field accepts anything typed into it, so an unlisted language is
 * expected rather than exceptional. `known` says which happened: the schema stage
 * declares a code it resolved and stays quiet about one it defaulted to.
 */
export function resolveLanguage(label: string): { code: string; rtl: boolean; known: boolean } {
  const trimmed = (label || "").trim();
  const found = LANGUAGE_LOCALES[trimmed];
  return {
    code: found?.code || "en",
    rtl: Boolean(found?.rtl),
    known: Boolean(found),
  };
}
