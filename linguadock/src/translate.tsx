import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  Keyboard,
  LocalStorage,
  Toast,
  getPreferenceValues,
  getSelectedText,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { translateText } from "./api";
import { getTargetLanguage, TARGET_LANGUAGES } from "./languages";
import { normalizeSelectedText } from "./text-format";

type ExtensionPreferences = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  defaultTargetLanguage: string;
};

type TranslationFormValues = {
  sourceText: string;
  targetLanguage: string;
};

type TranslationResult = {
  text: string;
  targetLanguageId: string;
};

const initialSelectedTextPromise = getSelectedText()
  .then((selectedText) => normalizeSelectedText(selectedText) || undefined)
  .catch(() => undefined);
const targetLanguageStorageKey = "target-language";

export default function TranslateCommand() {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const [sourceText, setSourceText] = useState("");
  const [isReadingSelection, setIsReadingSelection] = useState(true);
  const [isRestoringTargetLanguage, setIsRestoringTargetLanguage] =
    useState(true);
  const [selectionHint, setSelectionHint] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState(
    preferences.defaultTargetLanguage,
  );
  const [result, setResult] = useState<TranslationResult>();

  useEffect(() => {
    let isActive = true;
    initialSelectedTextPromise
      .then((selectedText) => {
        if (!isActive) return;
        if (selectedText) {
          setSourceText(selectedText);
          setSelectionHint(undefined);
        } else {
          setSelectionHint(
            "No selected text was detected. Select text before opening the command, or load it from the clipboard.",
          );
        }
      })
      .finally(() => {
        if (isActive) setIsReadingSelection(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    LocalStorage.getItem<string>(targetLanguageStorageKey)
      .then((storedTargetLanguage) => {
        if (
          isActive &&
          storedTargetLanguage &&
          TARGET_LANGUAGES.some(
            (language) => language.id === storedTargetLanguage,
          )
        ) {
          setTargetLanguage(storedTargetLanguage);
        }
      })
      .finally(() => {
        if (isActive) setIsRestoringTargetLanguage(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  function handleTargetLanguageChange(value: string) {
    setTargetLanguage(value);
    void LocalStorage.setItem(targetLanguageStorageKey, value);
  }

  async function loadFromClipboard() {
    const rawClipboardText = await Clipboard.readText();
    const clipboardText = rawClipboardText
      ? normalizeSelectedText(rawClipboardText)
      : undefined;
    if (!clipboardText) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Clipboard does not contain text",
      });
      return;
    }

    setSourceText(clipboardText);
    setSelectionHint(undefined);
  }

  async function handleSubmit(values: TranslationFormValues) {
    const text = values.sourceText.trim();
    if (!text) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Enter text to translate",
      });
      return;
    }

    const targetLanguage = getTargetLanguage(values.targetLanguage);
    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Translating…",
      message: `To ${targetLanguage.title} with ${preferences.model}`,
    });
    try {
      const translatedText = await translateText(
        text,
        values.targetLanguage,
        preferences,
      );
      setResult({
        text: translatedText,
        targetLanguageId: values.targetLanguage,
      });
      toast.style = Toast.Style.Success;
      toast.title = "Translation complete";
      toast.message = targetLanguage.title;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Translation failed";
      toast.message = error instanceof Error ? error.message : String(error);
    } finally {
      setIsLoading(false);
    }
  }

  if (result) {
    const targetLanguage = getTargetLanguage(result.targetLanguageId);
    return (
      <Detail
        markdown={result.text}
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Target Language"
              text={targetLanguage.title}
            />
            <Detail.Metadata.Label title="Model" text={preferences.model} />
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action.CopyToClipboard
              title="Copy Translation"
              content={result.text}
            />
            <Action.Paste title="Paste Translation" content={result.text} />
            <Action
              title="New Translation"
              icon={Icon.ArrowCounterClockwise}
              shortcut={Keyboard.Shortcut.Common.New}
              onAction={() => setResult(undefined)}
            />
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Form
      isLoading={isReadingSelection || isRestoringTargetLanguage || isLoading}
      navigationTitle={isLoading ? "Translating…" : "Translate with LinguaDock"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={isLoading ? "Translating…" : "Translate"}
            icon={Icon.Stars}
            onSubmit={(values: TranslationFormValues) => {
              if (!isLoading) return handleSubmit(values);
            }}
          />
          <Action
            title="Load Text from Clipboard"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={loadFromClipboard}
          />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="sourceText"
        title="Text"
        placeholder="Enter text or select text before opening the command"
        value={sourceText}
        onChange={setSourceText}
        autoFocus
      />
      {selectionHint ? (
        <Form.Description title="Selection" text={selectionHint} />
      ) : null}
      {isLoading ? (
        <Form.Description
          title="Status"
          text="Translating with the configured model…"
        />
      ) : null}
      <Form.Dropdown
        id="targetLanguage"
        title="Target Language"
        value={targetLanguage}
        onChange={handleTargetLanguageChange}
      >
        {TARGET_LANGUAGES.map((language) => (
          <Form.Dropdown.Item
            key={language.id}
            value={language.id}
            title={language.title}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
