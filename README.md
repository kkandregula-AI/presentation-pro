# Presentation Video Studio

A manual, premium presentation-to-video builder.

## What it does
- Lets the user add screens one by one
- Supports multiple layouts
- Keeps the slide order exactly as entered
- Supports presenter photo overlay on all slides
- Uses only user-entered voice-over text
- Exports an MP4 video

## Voice behavior
- `Built-in Female` and `Built-in Male` map to default ElevenLabs voice IDs on the server
- `ElevenLabs Custom Voice ID` uses the exact voice ID entered by the user
- If `ELEVENLABS_API_KEY` is missing, the render still works and uses silent fallback audio

## Run locally
```bash
npm install
npm start
```

Open `http://localhost:3000`

## Environment
Copy `.env.example` to `.env`.

## Railway notes
This app uses:
- Node.js
- Chromium for slide screenshots
- FFmpeg for MP4 rendering

Make sure your Railway service image includes Chromium and FFmpeg, or use a Dockerfile / Nixpacks setup that installs them.
