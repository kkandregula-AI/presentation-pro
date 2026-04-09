require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

app.use(cors());
app.use(express.json({limit: '25mb'}));
app.use(express.urlencoded({extended: true, limit: '25mb'}));
app.use(express.static(PUBLIC_DIR));

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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPublicUrl(filePath) {
  return '/' + path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
}

function toFsPath(publicUrl = '') {
  if (!publicUrl) return '';
  const clean = publicUrl.replace(/^\/+/, '');
  return path.join(PUBLIC_DIR, clean);
}

function estimateSeconds(text = '') {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
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
    '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
    '-t', String(seconds),
    '-q:a', '9',
    '-acodec', 'libmp3lame',
    outPath,
  ]);
}

async function elevenLabsTts({text, voiceId, outputPath}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !text.trim()) return false;

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

function resolveVoiceId(screen) {
  if (screen.voiceType === 'elevenlabs-custom' && screen.elevenVoiceId) return screen.elevenVoiceId;
  if (screen.voiceType === 'builtin-male') return DEFAULT_VOICES['builtin-male'];
  if (screen.voiceType === 'builtin-female') return DEFAULT_VOICES['builtin-female'];
  return '';
}

function getTheme(theme = 'midnight') {
  const themes = {
    midnight: {
      background: 'linear-gradient(135deg, #09111f 0%, #0f1f3d 40%, #101935 100%)',
      card: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.18)',
      title: '#ffffff',
      text: '#e8edf8',
      accent: '#7c98ff',
      accent2: '#89f0ff',
    },
    ivory: {
      background: 'linear-gradient(135deg, #fffaf2 0%, #f7efe3 50%, #f2eadc 100%)',
      card: 'rgba(255,255,255,0.72)',
      border: 'rgba(27, 35, 58, 0.12)',
      title: '#1b233a',
      text: '#36405b',
      accent: '#005ad6',
      accent2: '#7a5cff',
    },
    carbon: {
      background: 'linear-gradient(135deg, #111213 0%, #1f2328 45%, #0d0d10 100%)',
      card: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.14)',
      title: '#f7f9ff',
      text: '#dfe6f2',
      accent: '#00d4ff',
      accent2: '#8f7cff',
    },
  };
  return themes[theme] || themes.midnight;
}

function buildScreenHtml({project, screen, aspect, tempDir}) {
  const theme = getTheme(project.theme);
  const presenterUrl = project.presenterPhotoUrl ? 'file://' + toFsPath(project.presenterPhotoUrl) : '';
  const imageUrl = screen.imageUrl ? 'file://' + toFsPath(screen.imageUrl) : '';
  const bullets = Array.isArray(screen.bullets) ? screen.bullets.filter(Boolean) : [];
  const bodyHtml = screen.body ? `<div class="body">${escapeHtml(screen.body).replace(/\n/g, '<br/>')}</div>` : '';
  const bulletHtml = bullets.length ? `<ul class="bullets">${bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  const title = escapeHtml(screen.title || 'Untitled Slide');
  const subtitle = screen.subtitle ? `<div class="subtitle">${escapeHtml(screen.subtitle)}</div>` : '';
  const progress = `${screen.index + 1} / ${project.screens.length}`;
  const orientationClass = aspect.width > aspect.height ? 'landscape' : 'portrait';

  const layouts = {
    'image-right-text-left': `
      <section class="layout split ${orientationClass}">
        <div class="panel text-panel glass">${subtitle}<h1>${title}</h1>${bulletHtml}${bodyHtml}</div>
        <div class="panel media-panel glass">${imageUrl ? `<img src="${imageUrl}" class="hero-image" />` : `<div class="placeholder">Drop screen image here</div>`}</div>
      </section>`,
    'image-left-text-right': `
      <section class="layout split reverse ${orientationClass}">
        <div class="panel media-panel glass">${imageUrl ? `<img src="${imageUrl}" class="hero-image" />` : `<div class="placeholder">Drop screen image here</div>`}</div>
        <div class="panel text-panel glass">${subtitle}<h1>${title}</h1>${bulletHtml}${bodyHtml}</div>
      </section>`,
    'title-bullets': `
      <section class="layout single ${orientationClass}">
        <div class="panel wide glass">${subtitle}<h1>${title}</h1>${bulletHtml}${bodyHtml}</div>
      </section>`,
    'full-image-overlay': `
      <section class="layout image-cover ${orientationClass}">
        ${imageUrl ? `<img src="${imageUrl}" class="cover-image" />` : `<div class="placeholder big">Drop screen image here</div>`}
        <div class="overlay-card glass">${subtitle}<h1>${title}</h1>${bulletHtml}${bodyHtml}</div>
      </section>`,
    'two-column-text': `
      <section class="layout single ${orientationClass}">
        <div class="panel wide glass">
          ${subtitle}<h1>${title}</h1>
          <div class="cols">
            <div>${bulletHtml || '<div class="muted">Add bullet points</div>'}</div>
            <div>${bodyHtml || '<div class="muted">Add body text</div>'}</div>
          </div>
        </div>
      </section>`,
    'section-divider': `
      <section class="layout divider ${orientationClass}">
        <div class="divider-line"></div>
        <div class="divider-text glass">${subtitle}<h1>${title}</h1>${bodyHtml}</div>
      </section>`,
  };

  const content = layouts[screen.layout] || layouts['image-right-text-left'];

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Segoe UI, Arial, sans-serif;
        width: ${aspect.width}px;
        height: ${aspect.height}px;
        color: ${theme.text};
        background: ${theme.background};
        overflow: hidden;
      }
      .canvas {
        position: relative;
        width: 100%;
        height: 100%;
        padding: ${orientationClass === 'portrait' ? '52px 34px' : '56px 60px'};
      }
      .glow { position:absolute; border-radius:9999px; filter: blur(80px); opacity:0.65; }
      .g1 { width: 340px; height: 340px; background:${theme.accent}; top:-60px; left:-20px; }
      .g2 { width: 380px; height: 380px; background:${theme.accent2}; right:-80px; bottom:-120px; }
      .glass {
        background: ${theme.card};
        border: 1px solid ${theme.border};
        box-shadow: 0 18px 55px rgba(0,0,0,0.22);
        backdrop-filter: blur(12px);
      }
      .topbar {
        display:flex; align-items:center; justify-content:space-between; margin-bottom:22px;
      }
      .brand {
        display:flex; flex-direction:column; gap:6px;
      }
      .brand .project { font-size:${orientationClass === 'portrait' ? '26px' : '24px'}; font-weight:700; color:${theme.title}; letter-spacing:0.2px; }
      .brand .meta { font-size:14px; opacity:0.82; }
      .pill {
        border:1px solid ${theme.border}; background:${theme.card}; padding:10px 14px; border-radius:999px; font-size:13px; color:${theme.title};
      }
      .layout { height: calc(100% - 92px); position:relative; }
      .split { display:grid; grid-template-columns: 1.02fr 1fr; gap:24px; }
      .split.reverse { grid-template-columns: 1fr 1.02fr; }
      .single { display:flex; }
      .wide { width:100%; }
      .panel { border-radius:28px; padding:${orientationClass === 'portrait' ? '28px' : '34px'}; min-height:100%; }
      .text-panel h1, .overlay-card h1, .wide h1, .divider-text h1 {
        margin: 0 0 18px; color:${theme.title}; font-size:${orientationClass === 'portrait' ? '44px' : '54px'}; line-height:1.02; letter-spacing:-1px;
      }
      .subtitle { display:inline-flex; margin-bottom:16px; font-size:15px; letter-spacing:0.3px; padding:8px 14px; border-radius:999px; background:rgba(255,255,255,0.07); border:1px solid ${theme.border}; }
      .body { font-size:${orientationClass === 'portrait' ? '25px' : '24px'}; line-height:1.55; white-space:normal; }
      .bullets { margin: 0 0 10px 0; padding-left: 26px; }
      .bullets li { margin: 0 0 14px; font-size:${orientationClass === 'portrait' ? '26px' : '25px'}; line-height:1.45; }
      .media-panel { display:flex; align-items:center; justify-content:center; overflow:hidden; }
      .hero-image, .cover-image { width:100%; height:100%; object-fit:contain; border-radius:22px; background:rgba(255,255,255,0.06); }
      .cover-image { object-fit:cover; border-radius:28px; }
      .placeholder {
        width:100%; height:100%; min-height:240px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:26px; color:${theme.title}; border:2px dashed ${theme.border}; border-radius:24px; background:rgba(255,255,255,0.03);
      }
      .placeholder.big { min-height:100%; }
      .image-cover { position:relative; }
      .overlay-card {
        position:absolute; left:${orientationClass === 'portrait' ? '34px' : '36px'}; bottom:${orientationClass === 'portrait' ? '34px' : '36px'}; width:${orientationClass === 'portrait' ? 'calc(100% - 68px)' : '52%'}; padding:28px 30px; border-radius:28px;
      }
      .divider { display:flex; align-items:center; justify-content:center; }
      .divider-line { position:absolute; left:0; right:0; height:3px; background:linear-gradient(90deg, transparent, ${theme.accent}, ${theme.accent2}, transparent); top:50%; }
      .divider-text { position:relative; padding:34px 46px; border-radius:30px; text-align:center; max-width:78%; }
      .cols { display:grid; grid-template-columns: 1fr 1fr; gap:30px; }
      .muted { opacity:0.68; font-size:22px; }
      .presenter {
        position:absolute; left:${orientationClass === 'portrait' ? '34px' : '30px'}; bottom:${orientationClass === 'portrait' ? '36px' : '28px'}; width:${orientationClass === 'portrait' ? '116px' : '100px'}; height:${orientationClass === 'portrait' ? '116px' : '100px'}; border-radius:24px; overflow:hidden; border:2px solid rgba(255,255,255,0.45); box-shadow:0 16px 40px rgba(0,0,0,0.24); background:rgba(255,255,255,0.12);
      }
      .presenter img { width:100%; height:100%; object-fit:cover; }
      .footer {
        position:absolute; right:${orientationClass === 'portrait' ? '34px' : '30px'}; bottom:${orientationClass === 'portrait' ? '42px' : '34px'}; display:flex; gap:10px; align-items:center;
      }
      .dot { width:10px; height:10px; border-radius:999px; background:${theme.accent2}; box-shadow:0 0 18px ${theme.accent2}; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="glow g1"></div>
      <div class="glow g2"></div>
      <div class="topbar">
        <div class="brand">
          <div class="project">${escapeHtml(project.title || 'Presentation')}</div>
          <div class="meta">${escapeHtml(project.subtitle || '')}</div>
        </div>
        <div class="pill">Slide ${progress}</div>
      </div>
      ${content}
      ${presenterUrl ? `<div class="presenter"><img src="${presenterUrl}" /></div>` : ''}
      <div class="footer"><div class="dot"></div><div class="pill">${escapeHtml(screen.layout)}</div></div>
    </div>
  </body>
  </html>`;
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
  res.json({ok: true, port: PORT});
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
      await screenshotHtml({
        payload: {
          theme: project.theme,
          projectTitle: project.title || 'Presentation',
          projectSubtitle: project.subtitle || '',
          title: screen.title || 'Untitled Slide',
          subtitle: screen.subtitle || '',
          body: screen.body || '',
          bullets: Array.isArray(screen.bullets) ? screen.bullets : [],
          layout: screen.layout || 'image-right-text-left',
          imagePath: screen.imageUrl ? toFsPath(screen.imageUrl) : '',
          presenterPath: project.presenterPhotoUrl ? toFsPath(project.presenterPhotoUrl) : '',
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
        if (voiceId && process.env.ELEVENLABS_API_KEY) {
          try {
            await elevenLabsTts({text: screen.voiceOverText, voiceId, outputPath: audioPath});
            seconds = Math.max(seconds, Math.ceil(await ffprobeDuration(audioPath)));
          } catch (error) {
            console.error('TTS failed, falling back to silence:', error.message);
          }
        }
      }

      if (!fs.existsSync(audioPath)) {
        seconds = seconds || estimateSeconds(screen.voiceOverText || `${screen.title} ${screen.body || ''}`);
        await writeSilenceMp3(audioPath, seconds);
      }

      seconds = Math.max(2, seconds || 5);
      await createSegment({imagePath, audioPath, seconds, segmentPath, width: aspect.width, height: aspect.height});
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(concatPath, segmentPaths.map(file => `file '${file.replace(/'/g, `'\\''`)}'`).join('\n'), 'utf8');

    const finalPath = path.join(RENDER_DIR, `${jobId}.mp4`);
    await concatSegments(concatPath, finalPath);

    res.json({
      ok: true,
      videoUrl: `/renders/${path.basename(finalPath)}`, 
      fallbackAudio: !process.env.ELEVENLABS_API_KEY,
      renderMs: Date.now() - started,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({error: error.message || 'Failed to render video'});
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

app.get('/renders/:file', (req, res) => {
  const filePath = path.join(RENDER_DIR, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Presentation video builder running on http://localhost:${PORT}`);
});
