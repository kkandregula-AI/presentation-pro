const state = {
  project: {
    title: 'Premium Presentation',
    subtitle: 'Manual screen-by-screen builder',
    aspectRatio: '16:9',
    theme: 'midnight',
    presenterPhotoUrl: '',
    screens: [],
  },
  activeIndex: -1,
};

const el = (id) => document.getElementById(id);

const refs = {
  projectTitle: el('projectTitle'),
  projectSubtitle: el('projectSubtitle'),
  aspectRatio: el('aspectRatio'),
  theme: el('theme'),
  presenterUpload: el('presenterUpload'),
  presenterPreview: el('presenterPreview'),
  addScreenBtn: el('addScreenBtn'),
  screenList: el('screenList'),
  renderBtn: el('renderBtn'),
  renderStatus: el('renderStatus'),
  emptyState: el('emptyState'),
  editorForm: el('editorForm'),
  deleteBtn: el('deleteBtn'),
  duplicateBtn: el('duplicateBtn'),
  previewFrame: el('previewFrame'),
  outputWrap: el('outputWrap'),
  outputVideo: el('outputVideo'),
  downloadVideo: el('downloadVideo'),
  screenLayout: el('screenLayout'),
  screenDuration: el('screenDuration'),
  screenTitle: el('screenTitle'),
  screenSubtitle: el('screenSubtitle'),
  screenBullets: el('screenBullets'),
  screenBody: el('screenBody'),
  screenImageUpload: el('screenImageUpload'),
  screenImagePreview: el('screenImagePreview'),
  voiceType: el('voiceType'),
  elevenVoiceId: el('elevenVoiceId'),
  voiceOverText: el('voiceOverText'),
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createScreen() {
  return {
    id: uid(),
    layout: 'image-right-text-left',
    title: `Slide ${state.project.screens.length + 1}`,
    subtitle: '',
    bullets: ['Add your bullet here'],
    body: '',
    imageUrl: '',
    voiceType: 'none',
    elevenVoiceId: '',
    voiceOverText: '',
    durationSeconds: '',
  };
}

function getActiveScreen() {
  return state.project.screens[state.activeIndex] || null;
}

function renderScreenList() {
  refs.screenList.innerHTML = '';
  state.project.screens.forEach((screen, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `screen-card ${index === state.activeIndex ? 'active' : ''}`;
    card.innerHTML = `
      <div class="screen-card-title">${escapeHtml(screen.title || `Slide ${index + 1}`)}</div>
      <div class="screen-card-meta">${screen.layout} • ${screen.voiceType === 'none' ? 'silent' : 'voice'}</div>
    `;
    card.addEventListener('click', () => {
      state.activeIndex = index;
      syncEditor();
      renderScreenList();
      renderPreview();
    });
    refs.screenList.appendChild(card);
  });
}

function syncProjectFields() {
  refs.projectTitle.value = state.project.title;
  refs.projectSubtitle.value = state.project.subtitle;
  refs.aspectRatio.value = state.project.aspectRatio;
  refs.theme.value = state.project.theme;
  if (state.project.presenterPhotoUrl) {
    refs.presenterPreview.classList.remove('hidden');
    refs.presenterPreview.style.backgroundImage = `url(${state.project.presenterPhotoUrl})`;
  } else {
    refs.presenterPreview.classList.add('hidden');
    refs.presenterPreview.style.backgroundImage = '';
  }
}

function syncEditor() {
  const screen = getActiveScreen();
  const hasScreen = Boolean(screen);
  refs.emptyState.classList.toggle('hidden', hasScreen);
  refs.editorForm.classList.toggle('hidden', !hasScreen);
  refs.deleteBtn.disabled = !hasScreen;
  refs.duplicateBtn.disabled = !hasScreen;

  if (!hasScreen) {
    refs.screenImagePreview.innerHTML = 'No image uploaded';
    return;
  }

  refs.screenLayout.value = screen.layout;
  refs.screenDuration.value = screen.durationSeconds || '';
  refs.screenTitle.value = screen.title || '';
  refs.screenSubtitle.value = screen.subtitle || '';
  refs.screenBullets.value = (screen.bullets || []).join('\n');
  refs.screenBody.value = screen.body || '';
  refs.voiceType.value = screen.voiceType || 'none';
  refs.elevenVoiceId.value = screen.elevenVoiceId || '';
  refs.voiceOverText.value = screen.voiceOverText || '';
  refs.screenImagePreview.innerHTML = screen.imageUrl
    ? `<img src="${screen.imageUrl}" alt="slide image" style="width:100%;border-radius:14px;display:block;" />`
    : 'No image uploaded';
}

function renderPreview() {
  const screen = getActiveScreen();
  if (!screen) {
    refs.previewFrame.innerHTML = '<div class="preview-canvas"><div class="empty-state">Preview appears here.</div></div>';
    return;
  }

  const aspectClass = state.project.aspectRatio === '9:16' ? 'portrait' : 'landscape';
  const presenterHtml = state.project.presenterPhotoUrl
    ? `<div class="preview-presenter"><img src="${state.project.presenterPhotoUrl}" /></div>`
    : '';
  const subtitleHtml = screen.subtitle ? `<div class="subtitle-tag">${escapeHtml(screen.subtitle)}</div>` : '';
  const bulletHtml = (screen.bullets || []).filter(Boolean).length
    ? `<ul>${screen.bullets.filter(Boolean).map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';
  const bodyHtml = screen.body ? `<div class="body">${escapeHtml(screen.body)}</div>` : '';
  const mediaHtml = screen.imageUrl
    ? `<img src="${screen.imageUrl}" alt="slide image" />`
    : `<div class="preview-placeholder">No screen image uploaded</div>`;

  const layouts = {
    'image-right-text-left': `
      <div class="preview-layout split ${aspectClass}">
        <div class="preview-card preview-text">${subtitleHtml}<h1>${escapeHtml(screen.title)}</h1>${bulletHtml}${bodyHtml}</div>
        <div class="preview-card preview-media">${mediaHtml}</div>
      </div>`,
    'image-left-text-right': `
      <div class="preview-layout split reverse ${aspectClass}">
        <div class="preview-card preview-text">${subtitleHtml}<h1>${escapeHtml(screen.title)}</h1>${bulletHtml}${bodyHtml}</div>
        <div class="preview-card preview-media">${mediaHtml}</div>
      </div>`,
    'title-bullets': `
      <div class="preview-layout ${aspectClass}">
        <div class="preview-card preview-text">${subtitleHtml}<h1>${escapeHtml(screen.title)}</h1>${bulletHtml}${bodyHtml}</div>
      </div>`,
    'full-image-overlay': `
      <div class="preview-layout ${aspectClass}">
        <div class="preview-full">
          <div class="preview-cover">${mediaHtml}</div>
          <div class="preview-card preview-text preview-overlay">${subtitleHtml}<h1>${escapeHtml(screen.title)}</h1>${bulletHtml}${bodyHtml}</div>
        </div>
      </div>`,
    'two-column-text': `
      <div class="preview-layout ${aspectClass}">
        <div class="preview-card preview-text">
          ${subtitleHtml}<h1>${escapeHtml(screen.title)}</h1>
          <div class="grid two">
            <div>${bulletHtml || '<div class="muted-box">Add bullet points</div>'}</div>
            <div>${bodyHtml || '<div class="muted-box">Add body text</div>'}</div>
          </div>
        </div>
      </div>`,
    'section-divider': `
      <div class="preview-divider">
        <div class="preview-card preview-text" style="max-width:70%;text-align:center;">
          ${subtitleHtml}<h1>${escapeHtml(screen.title)}</h1>${bodyHtml}
        </div>
      </div>`,
  };

  refs.previewFrame.innerHTML = `
    <div class="preview-canvas theme-${state.project.theme}">
      <div class="preview-top">
        <div class="preview-project">
          <h3>${escapeHtml(state.project.title || 'Presentation')}</h3>
          <p>${escapeHtml(state.project.subtitle || '')}</p>
        </div>
        <div class="preview-pill">Slide ${state.activeIndex + 1} / ${state.project.screens.length}</div>
      </div>
      ${layouts[screen.layout] || layouts['image-right-text-left']}
      ${presenterHtml}
    </div>
  `;
}

function renderAll() {
  syncProjectFields();
  renderScreenList();
  syncEditor();
  renderPreview();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload', {method: 'POST', body: formData});
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
}

function attachProjectListeners() {
  refs.projectTitle.addEventListener('input', (e) => {
    state.project.title = e.target.value;
    renderPreview();
  });
  refs.projectSubtitle.addEventListener('input', (e) => {
    state.project.subtitle = e.target.value;
    renderPreview();
  });
  refs.aspectRatio.addEventListener('change', (e) => {
    state.project.aspectRatio = e.target.value;
    renderPreview();
  });
  refs.theme.addEventListener('change', (e) => {
    state.project.theme = e.target.value;
    renderPreview();
  });
  refs.presenterUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    refs.renderStatus.textContent = 'Uploading presenter photo...';
    try {
      const uploaded = await uploadFile(file);
      state.project.presenterPhotoUrl = uploaded.url;
      refs.renderStatus.textContent = 'Presenter photo uploaded.';
      renderAll();
    } catch (error) {
      refs.renderStatus.textContent = error.message;
    }
  });
}

function attachScreenListeners() {
  refs.addScreenBtn.addEventListener('click', () => {
    state.project.screens.push(createScreen());
    state.activeIndex = state.project.screens.length - 1;
    refs.outputWrap.classList.add('hidden');
    renderAll();
  });

  refs.deleteBtn.addEventListener('click', () => {
    if (state.activeIndex < 0) return;
    state.project.screens.splice(state.activeIndex, 1);
    if (state.activeIndex >= state.project.screens.length) state.activeIndex = state.project.screens.length - 1;
    renderAll();
  });

  refs.duplicateBtn.addEventListener('click', () => {
    const screen = getActiveScreen();
    if (!screen) return;
    const clone = JSON.parse(JSON.stringify(screen));
    clone.id = uid();
    clone.title = `${clone.title} Copy`;
    state.project.screens.splice(state.activeIndex + 1, 0, clone);
    state.activeIndex += 1;
    renderAll();
  });

  const bind = (element, prop, transform = (v) => v) => {
    element.addEventListener('input', (e) => {
      const screen = getActiveScreen();
      if (!screen) return;
      screen[prop] = transform(e.target.value);
      renderScreenList();
      renderPreview();
    });
  };

  bind(refs.screenLayout, 'layout');
  refs.screenLayout.addEventListener('change', () => renderPreview());
  bind(refs.screenDuration, 'durationSeconds');
  bind(refs.screenTitle, 'title');
  bind(refs.screenSubtitle, 'subtitle');
  bind(refs.screenBullets, 'bullets', (value) => value.split('\n').map((s) => s.trim()).filter(Boolean));
  bind(refs.screenBody, 'body');
  bind(refs.voiceType, 'voiceType');
  bind(refs.elevenVoiceId, 'elevenVoiceId');
  bind(refs.voiceOverText, 'voiceOverText');

  refs.screenImageUpload.addEventListener('change', async (e) => {
    const screen = getActiveScreen();
    const file = e.target.files[0];
    if (!screen || !file) return;
    refs.renderStatus.textContent = 'Uploading screen image...';
    try {
      const uploaded = await uploadFile(file);
      screen.imageUrl = uploaded.url;
      refs.renderStatus.textContent = 'Screen image uploaded.';
      syncEditor();
      renderPreview();
    } catch (error) {
      refs.renderStatus.textContent = error.message;
    }
  });
}

async function renderVideo() {
  if (!state.project.screens.length) {
    refs.renderStatus.textContent = 'Add at least one screen before rendering.';
    return;
  }
  refs.renderBtn.disabled = true;
  refs.renderStatus.textContent = 'Rendering video. This may take a little while depending on screen count.';
  refs.outputWrap.classList.add('hidden');

  try {
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(state.project),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Render failed');

    refs.outputVideo.src = data.videoUrl;
    refs.downloadVideo.href = data.videoUrl;
    refs.outputWrap.classList.remove('hidden');
    refs.renderStatus.textContent = data.fallbackAudio
      ? 'Rendered successfully. No ElevenLabs API key was detected, so silent fallback audio was used where needed.'
      : `Rendered successfully in ${(data.renderMs / 1000).toFixed(1)}s.`;
  } catch (error) {
    refs.renderStatus.textContent = error.message;
  } finally {
    refs.renderBtn.disabled = false;
  }
}

refs.renderBtn.addEventListener('click', renderVideo);
attachProjectListeners();
attachScreenListeners();
state.project.screens = [createScreen()];
state.activeIndex = 0;
renderAll();
