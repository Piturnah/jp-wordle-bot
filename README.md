## Getting started

### Prerequisites

-   [Node.JS](https://nodejs.org/), you want a relatively recent version.

### Setting up

1. Install node modules

```
npm install
```

2. Compiles and hot-reloads for development

```
npm run dev
```

3. Compiles for production, runs using pm2 (daemonized).

```
npm run build
```

### Configuration

The bot reads its configuration values from a `config.json` file in the root directory. OPTIONAL keys have to be set to `null` if not required. Currently the following keys are available:

-   `DISCORD_TOKEN` (REQUIRED, `string`): The Discord token the bot is supposed to authenticate with.
-   `FONT` (OPTIONAL, `string`): Path to a `.otf` font file that the bot should use to render the guesses. The renderering framework uses Arial by default, which does not support some specific characters, like Japanese hiragana and katakana. Our deployed version uses [Google Noto](https://fonts.google.com/noto) at the moment.
-   `debug` (REQUIRED, `boolean`): At the moment, this only controls the log level.

An example configuration is available as `config_template.json`, but please not that you will have to at least add your token before starting the application.
