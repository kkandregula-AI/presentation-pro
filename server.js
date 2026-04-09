require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {execFile} = require('child_process');
const {promisify} = require('util');
const {v4: uuidv4} = require('uuid');

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const RENDER_DIR = path.join(ROOT, 'renders');
const TMP_DIR = path.join(ROOT, 'tmp');

for (const dir of [PUBLIC_DIR, UPLOAD_DIR, RENDER_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, {recursive: true});
}

console.log('ELEVENLABS_API_KEY present:', !!process.env.ELEVENLABS_API_KEY);
console.log('Default male voice:', process.env.ELEVENLABS_DEFAULT_MALE_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb');
console.log('Default female voice:', process.env.ELEVENLABS_DEFAULT_FEMALE_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');

app.use(cors());
app.use(express.json({limit: '25mb'}));
app.use(express.urlencoded({extended: true, limit: '25mb'}));
app.use(express.static(PUBLIC_DIR));
app.use('/renders', express.static(RENDER_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}-${uuidv4()}${safeExt}`);
  },
});
const upload = multer({storage});

const ASPECTS = {
  '16:9': {width: 1920, height: 1080},
  '9:16': {width: 1080, height: 1920},
};

const DEFAULT_VOICES = {
  'builtin-female': process.env.ELEVENLABS_DEFAULT_FEMALE_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
  'builtin-male': process.env.ELEVENLABS_DEFAULT_MALE_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
};

function toPublicUrl(filePath) {
  return '/' + path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
}

function toFsPath(publicUrl = '') {
  if (!publicUrl) return '';
  const clean = publicUrl.replace(/^\/+/, '');
  return path.join(PUBLIC_DIR, clean);
}

function estimateSeconds(text = '') {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 4;
  return Math.max(4, Math.ceil(words / 2.4));
}

async function ffprobeDuration(filePath) {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return Number.parseFloat(stdout.trim()) || 0;
}

async function writeSilenceMp3(outPath, seconds) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(seconds),
    '-q:a', '9',
    '-acodec', 'libmp3lame',
    outPath,
  ]);
}

async function elevenLabsTts({text, voiceId, outputPath}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !String(text).trim()) {
    throw new Error('ELEVENLABS_API_KEY missing or voice text empty');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ElevenLabs failed: ${response.status} ${message}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  return true;
}

function resolveVoiceId(screen = {}) {
  if (screen.voiceType === 'elevenlabs-custom' && screen.elevenVoiceId) return screen.elevenVoiceId;
  if (screen.voiceType === 'builtin-male') return DEFAULT_VOICES['builtin-male'];
  if (screen.voiceType === 'builtin-female') return DEFAULT_VOICES['builtin-female'];
  return '';
}

async function screenshotHtml({payload, outputPath, width, height, tempDir}) {
  const jsonPath = path.join(tempDir, `${uuidv4()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({...payload, width, height}, null, 2), 'utf8');
  await execFileAsync('python3', [path.join(ROOT, 'render_slide.py'), jsonPath, outputPath], {maxBuffer: 1024 * 1024 * 20});
}

async function createSegment({imagePath, audioPath, seconds, segmentPath, width, height}) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-i', audioPath,
    '-vf', `scale=${width}:${height},format=yuv420p`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-tune', 'stillimage',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    '-movflags', '+faststart',
    '-t', String(seconds),
    segmentPath,
  ], {maxBuffer: 1024 * 1024 * 20});
}

async function concatSegments(listPath, outputPath) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outputPath,
  ], {maxBuffer: 1024 * 1024 * 20});
}

app.get('/api/health', (_req, res) => {
  res.json({ok: true, port: PORT, elevenLabsKeyPresent: !!process.env.ELEVENLABS_API_KEY});
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({error: 'No file uploaded'});
  res.json({
    ok: true,
    url: toPublicUrl(req.file.path),
    filename: req.file.filename,
  });
});

app.post('/api/render', async (req, res) => {
  const started = Date.now();
  const jobId = `${Date.now()}-${uuidv4()}`;
  const tempDir = path.join(TMP_DIR, jobId);
  fs.mkdirSync(tempDir, {recursive: true});

  try {
    const project = req.body || {};
    const screens = Array.isArray(project.screens) ? project.screens : [];
    if (!screens.length) {
      return res.status(400).json({error: 'Add at least one screen before rendering.'});
    }

    const aspect = ASPECTS[project.aspectRatio] || ASPECTS['16:9'];
    const segmentPaths = [];

    for (let i = 0; i < screens.length; i += 1) {
      const screen = {...screens[i], index: i};
      const imagePath = path.join(tempDir, `slide-${i + 1}.png`);
      const audioPath = path.join(tempDir, `audio-${i + 1}.mp3`);
      const segmentPath = path.join(tempDir, `segment-${i + 1}.mp4`);

      const normalizedBullets =
        Array.isArray(screen.bullets) && screen.bullets.length
          ? screen.bullets.filter(Boolean)
          : typeof screen.body === 'string'
            ? screen.body.split('\n').map(s => s.trim()).filter(Boolean)
            : [];

      const resolvedImagePath = screen.imageUrl ? toFsPath(screen.imageUrl) : '';
      const resolvedPresenterPath = project.presenterPhotoUrl ? toFsPath(project.presenterPhotoUrl) : '';

      console.log('RENDER SCREEN', {
        title: screen.title,
        imageUrl: screen.imageUrl,
        resolvedImagePath,
        imageExists: resolvedImagePath ? fs.existsSync(resolvedImagePath) : false,
        bullets: normalizedBullets,
        presenterExists: resolvedPresenterPath ? fs.existsSync(resolvedPresenterPath) : false,
      });

      await screenshotHtml({
        payload: {
          theme: project.theme || 'midnight',
          projectTitle: project.title || 'Premium Presentation',
          projectSubtitle: project.subtitle || 'Manual screen-by-screen builder',
          title: screen.title || 'Untitled Slide',
          subtitle: screen.subtitle || '',
          body: screen.body || '',
          bullets: normalizedBullets,
          layout: screen.layout || 'image-right-text-left',
          imagePath: resolvedImagePath,
          presenterPath: resolvedPresenterPath,
          slideLabel: `${i + 1} / ${screens.length}`,
        },
        outputPath: imagePath,
        width: aspect.width,
        height: aspect.height,
        tempDir,
      });

      let seconds = Number(screen.durationSeconds) || 0;
      const wantsVoice = (screen.voiceType && screen.voiceType !== 'none') && (screen.voiceOverText || '').trim();

      if (wantsVoice) {
        const voiceId = resolveVoiceId(screen);
        if (!process.env.ELEVENLABS_API_KEY) {
          throw new Error('ELEVENLABS_API_KEY is missing in Railway Variables.');
        }
        if (!voiceId) {
          throw new Error(`No voice id resolved for screen "${screen.title || i + 1}".`);
        }

        try {
          await elevenLabsTts({text: screen.voiceOverText, voiceId, outputPath: audioPath});
          seconds = Math.max(seconds, Math.ceil(await ffprobeDuration(audioPath)));
        } catch (error) {
          console.error('TTS failed:', error.message);
          throw new Error(`ElevenLabs TTS failed: ${error.message}`);
        }
      }

      if (!fs.existsSync(audioPath)) {
        const fallbackText =
          String(screen.voiceOverText || '').trim() ||
          [screen.title || '', screen.subtitle || '', screen.body || '', ...normalizedBullets]
            .filter(Boolean)
            .join('. ');

        seconds = seconds || estimateSeconds(fallbackText);

        if (!fallbackText.trim()) {
          await writeSilenceMp3(audioPath, seconds);
        } else {
          throw new Error(`No audio file was generated for screen "${screen.title || i + 1}".`);
        }
      }

      seconds = Math.max(2, seconds || 5);
      await createSegment({imagePath, audioPath, seconds, segmentPath, width: aspect.width, height: aspect.height});
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(
      concatPath,
      segmentPaths.map(file => `file '${file.replace(/'/g, `'\\''`)}'`).join('\n'),
      'utf8'
    );

    const finalPath = path.join(RENDER_DIR, `${jobId}.mp4`);
    await concatSegments(concatPath, finalPath);

    res.json({
      ok: true,
      videoUrl: `/renders/${path.basename(finalPath)}`,
      fallbackAudio: false,
      renderMs: Date.now() - started,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({error: error.message || 'Failed to render video'});
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

app.listen(PORT, () => {
  console.log(`Presentation video builder running on port ${PORT}`);
});
