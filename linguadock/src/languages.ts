export type TargetLanguage = {
  id: string;
  title: string;
  promptName: string;
};

export const TARGET_LANGUAGES: TargetLanguage[] = [
  {
    id: "auto",
    title: "自动（中文 ⇄ 英文）",
    promptName: "Automatic",
  },
  { id: "zh-Hans", title: "简体中文", promptName: "Simplified Chinese" },
  { id: "zh-Hant", title: "繁體中文", promptName: "Traditional Chinese" },
  { id: "en", title: "English", promptName: "English" },
  { id: "ja", title: "日本語", promptName: "Japanese" },
  { id: "ko", title: "한국어", promptName: "Korean" },
  { id: "es", title: "Español", promptName: "Spanish" },
  { id: "fr", title: "Français", promptName: "French" },
  { id: "de", title: "Deutsch", promptName: "German" },
  { id: "pt", title: "Português", promptName: "Portuguese" },
  { id: "it", title: "Italiano", promptName: "Italian" },
  { id: "ru", title: "Русский", promptName: "Russian" },
  { id: "ar", title: "العربية", promptName: "Arabic" },
  { id: "hi", title: "हिन्दी", promptName: "Hindi" },
  { id: "th", title: "ไทย", promptName: "Thai" },
  { id: "vi", title: "Tiếng Việt", promptName: "Vietnamese" },
  { id: "id", title: "Bahasa Indonesia", promptName: "Indonesian" },
  { id: "ms", title: "Bahasa Melayu", promptName: "Malay" },
  { id: "tr", title: "Türkçe", promptName: "Turkish" },
  { id: "nl", title: "Nederlands", promptName: "Dutch" },
  { id: "pl", title: "Polski", promptName: "Polish" },
  { id: "uk", title: "Українська", promptName: "Ukrainian" },
];

export function getTargetLanguage(id: string): TargetLanguage {
  return (
    TARGET_LANGUAGES.find((language) => language.id === id) ??
    TARGET_LANGUAGES[0]
  );
}
