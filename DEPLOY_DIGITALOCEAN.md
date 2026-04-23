# Deploy LingoWatch

## DigitalOcean app

This repo can now run as one Node service on DigitalOcean App Platform:

1. Push this repo to GitHub.
2. In DigitalOcean, create an `App` from that repo.
3. Use these commands:

```bash
Build command: npm ci && npm run build
Run command: node server/index.mjs
```

4. Set these required environment variables in App Platform:

```text
HOST=0.0.0.0
PORT=8080
APP_BASE_URL=https://your-domain.example
DATABASE_URL=postgresql://...
VITE_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_ID=...
AI_PROVIDER=auto
```

5. Add any provider keys you actually use:

```text
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
GLM4_API_KEY=...
XAI_API_KEY=...
OPENROUTER_API_KEY=...
CEREBRAS_API_KEY=...
RESEND_API_KEY=...
EMAIL_FROM=...
EMAIL_FROM_AUTH=...
EMAIL_FROM_UPDATES=...
EMAIL_REPLY_TO=...
ADMIN_ANNOUNCEMENT_KEY=...
GOOGLE_TTS_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
DO_SPACES_ENDPOINT=...
DO_SPACES_REGION=...
DO_SPACES_BUCKET=...
DO_SPACES_PUBLIC_BASE_URL=...
DO_SPACES_ACCESS_KEY_ID=...
DO_SPACES_SECRET_ACCESS_KEY=...
```

## Notes

- The Node server now serves the built Vite app from `dist/`, so the website and `/api/*` can live on the same DigitalOcean domain.
- If you use one domain for both frontend and backend, set both the app and API URLs in the extension to that same origin.
- Do not upload your local `.env` file with real secrets. Put secrets in DigitalOcean environment variables instead.

## Chrome extension

1. Rebuild the subtitle bundle before packaging:

```bash
npm run build:subtitle
```

2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the repo's `extension/` folder.
6. Open the extension popup and set:

```text
App URL: https://your-domain.example
API URL: https://your-domain.example
```

7. Save settings, then open your deployed LingoWatch site and sign in there when needed.

## If you want to publish the extension

1. Keep the built files inside `extension/`.
2. Zip the contents of the `extension/` folder.
3. Upload that zip to the Chrome Web Store developer dashboard.
