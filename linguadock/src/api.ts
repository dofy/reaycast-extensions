import { getTargetLanguage } from "./languages";

export type TranslationConfiguration = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: string | { message?: string };
};

export function buildChatCompletionsUrl(baseUrl: string): URL {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const url = new URL(trimmed);
  const currentPath = url.pathname.replace(/^\/+|\/+$/g, "");

  if (!currentPath.toLowerCase().endsWith("chat/completions")) {
    url.pathname = `/${[currentPath, "chat/completions"].filter(Boolean).join("/")}`;
  }

  return url;
}

function systemPrompt(targetLanguageId: string): string {
  const targetLanguage = getTargetLanguage(targetLanguageId);
  if (targetLanguageId === "auto") {
    return [
      "You are LinguaDock, a professional translation engine. Detect the source language before translating.",
      "If the source text is primarily Chinese, translate it into natural, precise English. Otherwise, translate it into natural, precise Simplified Chinese.",
      "Preserve meaning, tone, names, Markdown, paragraph breaks, and code blocks.",
      "If list markers were flattened inline by the source application, restore each bullet, checkbox, or numbered item onto its own line.",
      "Return only the translated text. Do not explain, label, quote, or comment on it.",
    ].join("\n");
  }

  return [
    `You are LinguaDock, a professional translation engine. Detect the source language and translate the user's text into natural, precise ${targetLanguage.promptName}.`,
    `Always return the result in ${targetLanguage.promptName}, even when the source language is ambiguous or already matches the target language.`,
    "Preserve meaning, tone, names, Markdown, paragraph breaks, and code blocks.",
    "If list markers were flattened inline by the source application, restore each bullet, checkbox, or numbered item onto its own line.",
    "Return only the translated text. Do not explain, label, quote, or comment on it.",
  ].join("\n");
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = "text" in part ? part.text : undefined;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function serverErrorMessage(
  payload: ChatCompletionResponse | undefined,
  fallback: string,
): string {
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error.message === "string")
    return payload.error.message;
  return fallback;
}

export async function translateText(
  text: string,
  targetLanguageId: string,
  configuration: TranslationConfiguration,
): Promise<string> {
  const endpoint = buildChatCompletionsUrl(configuration.apiBaseUrl);
  const apiKey = configuration.apiKey.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: configuration.model.trim(),
      messages: [
        { role: "system", content: systemPrompt(targetLanguageId) },
        { role: "user", content: text },
      ],
      temperature: 0.2,
    }),
  });

  const rawResponse = await response.text();
  let payload: ChatCompletionResponse | undefined;
  try {
    payload = JSON.parse(rawResponse) as ChatCompletionResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const message = serverErrorMessage(
      payload,
      rawResponse || response.statusText,
    );
    throw new Error(
      `API request failed (${response.status}): ${message.slice(0, 300)}`,
    );
  }

  const translatedText = extractTextContent(
    payload?.choices?.[0]?.message?.content,
  ).trim();
  if (!translatedText)
    throw new Error("The model returned an empty translation.");
  return translatedText;
}
