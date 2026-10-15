# LinguaDock for Raycast

Translate selected or entered text directly through an OpenAI-compatible API.
This extension does not require the LinguaDock macOS app.

## Features

- Prefills text selected in the previously focused app when available.
- Supports 21 target languages plus automatic Chinese ⇄ English translation (the default).
- Configurable API Base URL, API Key, model, and default target language.
- Copies or pastes translated text from the result view.

## Configuration

Open the extension preferences in Raycast and configure:

- **API Base URL**: a version root such as `https://api.openai.com/v1`, or a
  full `/chat/completions` endpoint.
- **API Key**: a required Raycast password preference. Enter the key accepted by your configured service.
- **Model**: the model identifier accepted by the configured service.
- **Default Target Language**: the initial language shown by the command.

The default Base URL and model target the local Kaon Router setup, but both are
fully editable. No API key is included in this repository.

## Privacy

Selected or entered text is sent directly from the Raycast extension to the
configured API Base URL. It is not sent through the LinguaDock macOS app or any
additional service.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Development checks:

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Tests use simulated responses and do not invoke a live translation service.
