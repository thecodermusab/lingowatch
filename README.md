# LingoWatch

LingoWatch is a small English learning project built around YouTube subtitles.
It includes:

- a web app for reading, saving words, and studying later
- a Chrome extension for subtitle translation and quick word help

![LingoWatch feature preview](public/feature1.gif)

## Run locally

1. Install packages:

```bash
npm install
```

2. Add your environment variables in your local `.env` file.

3. Start the web app and Node server:

```bash
npm run dev
```

4. If you use the Python extension backend, start it in a second terminal:

```bash
cd extension/backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Build

Build the website:

```bash
npm run build
```

Build the subtitle bundle used by the extension:

```bash
npm run build:subtitle
```

## Chrome extension

To test the extension locally:

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the `extension/` folder

## Notes

- The app and extension are meant to work together.
- Production site: `https://maahir03.me`
- Privacy page: `https://maahir03.me/privacy`
