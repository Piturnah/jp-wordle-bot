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

3. Compiles for production

```
npm run build
```
### Configuration 

We use the `.env` file for configuration. Currently the following keys are available: 

- `DISCORD_TOKEN` (REQUIRED): The Discord token the bot is supposed to authenticate with. 
- `FONT` (OPTIONAL): Path to a `.otf` font file that the bot should use to render the guesses. The renderering framework uses Arial by default, which does not support some specific characters, like Japanese hiragana and katakana. Our deployed version uses [Google Noto](https://fonts.google.com/noto) at the moment. 
