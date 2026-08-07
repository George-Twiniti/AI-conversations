(() => {
  const isElectron = Boolean(window.electronAPI?.isElectron);

  const state = {
    summaries: [],
    selected: new Set(),
    activeIndex: null,
    outputDir: null,
    converting: false,
    filter: ''
  };

  const els = {
    dropZone: document.getElementById('dropZone'),
    selectFolderBtn: document.getElementById('selectFolderBtn'),
    selectFileBtn: document.getElementById('selectFileBtn'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    providerName: document.getElementById('providerName'),
    conversationCount: document.getElementById('conversationCount'),
    selectedCount: document.getElementById('selectedCount'),
    optionsCard: document.getElementById('optionsCard'),
    pickerCard: document.getElementById('pickerCard'),
    pickerEmpty: document.getElementById('pickerEmpty'),
    conversationList: document.getElementById('conversationList'),
    searchInput: document.getElementById('searchInput'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    selectNoneBtn: document.getElementById('selectNoneBtn'),
    selectOutputBtn: document.getElementById('selectOutputBtn'),
    convertBtn: document.getElementById('convertBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    outputPath: document.getElementById('outputPath'),
    previewBody: document.getElementById('previewBody'),
    previewMeta: document.getElementById('previewMeta'),
    logContainer: document.getElementById('logContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    statProcessed: document.getElementById('statProcessed'),
    statSuccess: document.getElementById('statSuccess'),
    statSkipped: document.getElementById('statSkipped'),
    statErrors: document.getElementById('statErrors'),
    errorMessage: document.getElementById('errorMessage'),
    successMessage: document.getElementById('successMessage'),
    guideBtn: document.getElementById('guideBtn'),
    guideDialog: document.getElementById('guideDialog'),
    guideContent: document.getElementById('guideContent'),
    optObsidian: document.getElementById('optObsidian'),
    optIndex: document.getElementById('optIndex'),
    optDateFolders: document.getElementById('optDateFolders'),
    existingFileOption: document.getElementById('existingFileOption')
  };

  function requireElectron() {
    if (!isElectron) {
      showError('This application must be run with Electron (`npm start` in viewer/).');
      return false;
    }
    return true;
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  }

  function showError(message) {
    els.errorMessage.textContent = message;
    els.errorMessage.classList.remove('hidden');
    setTimeout(() => els.errorMessage.classList.add('hidden'), 6000);
  }

  function showSuccess(message) {
    els.successMessage.textContent = message;
    els.successMessage.classList.remove('hidden');
    setTimeout(() => els.successMessage.classList.add('hidden'), 6000);
  }

  function addLog(message, type = 'info') {
    const row = document.createElement('div');
    row.className = type;
    row.textContent = message;
    els.logContainer.appendChild(row);
    els.logContainer.scrollTop = els.logContainer.scrollHeight;
  }

  function updateSelectedCount() {
    els.selectedCount.textContent = String(state.selected.size);
    els.convertBtn.disabled = !(state.outputDir && state.selected.size > 0 && !state.converting);
  }

  function filteredSummaries() {
    const q = state.filter.trim().toLowerCase();
    if (!q) return state.summaries;
    return state.summaries.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.date.includes(q) ||
      String(s.messageCount).includes(q)
    );
  }

  function renderList() {
    const items = filteredSummaries();
    els.conversationList.innerHTML = '';
    for (const summary of items) {
      const row = document.createElement('div');
      row.className = `conversation-item${state.activeIndex === summary.index ? ' active' : ''}`;
      row.dataset.index = String(summary.index);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.selected.has(summary.index);
      checkbox.addEventListener('click', (e) => e.stopPropagation());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.add(summary.index);
        else state.selected.delete(summary.index);
        updateSelectedCount();
      });

      const body = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = summary.title || 'untitled';
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${summary.date}${summary.hasAttachments ? ' · attachments' : ''}`;
      body.appendChild(title);
      body.appendChild(meta);

      const count = document.createElement('div');
      count.className = 'count';
      count.textContent = `${summary.messageCount} msgs`;

      row.appendChild(checkbox);
      row.appendChild(body);
      row.appendChild(count);
      row.addEventListener('click', () => preview(summary.index));
      els.conversationList.appendChild(row);
    }
  }

  async function preview(index) {
    if (!requireElectron()) return;
    state.activeIndex = index;
    renderList();
    els.previewMeta.textContent = 'Loading…';
    try {
      const result = await window.electronAPI.previewConversation(index);
      els.previewMeta.textContent = `${result.date} · ${result.messageCount} messages`;
      els.previewBody.textContent = result.markdown;
    } catch (error) {
      els.previewMeta.textContent = 'Preview failed';
      els.previewBody.textContent = error.message;
    }
  }

  async function loadPath(inputPath) {
    if (!requireElectron()) return;
    addLog(`Loading: ${inputPath}`);
    els.progressText.textContent = 'Loading export…';
    try {
      const session = await window.electronAPI.loadExportSession(inputPath);
      state.summaries = session.summaries || [];
      state.selected = new Set(state.summaries.map(s => s.index));
      state.activeIndex = null;
      state.filter = '';
      els.searchInput.value = '';

      els.fileName.textContent = session.fileName;
      els.fileSize.textContent = formatFileSize(session.fileSize);
      els.providerName.textContent = session.providerLabel;
      els.conversationCount.textContent = String(session.conversationCount);
      els.fileInfo.classList.remove('hidden');
      els.optionsCard.classList.remove('hidden');
      els.pickerCard.classList.remove('hidden');
      els.pickerEmpty.classList.add('hidden');

      updateSelectedCount();
      renderList();
      addLog(`Loaded ${session.conversationCount} conversations (${session.providerLabel})`, 'success');
      els.progressText.textContent = 'Ready';
      showSuccess(`Loaded ${session.conversationCount} conversations`);
    } catch (error) {
      showError(error.message);
      addLog(error.message, 'error');
      els.progressText.textContent = 'Load failed';
    }
  }

  function setConverting(isConverting) {
    state.converting = isConverting;
    els.convertBtn.classList.toggle('hidden', isConverting);
    els.cancelBtn.classList.toggle('hidden', !isConverting);
    els.selectFolderBtn.disabled = isConverting;
    els.selectFileBtn.disabled = isConverting;
    els.selectOutputBtn.disabled = isConverting;
    updateSelectedCount();
  }

  async function startConvert() {
    if (!requireElectron()) return;
    if (!state.outputDir || state.selected.size === 0) {
      showError('Select conversations and an output folder first');
      return;
    }

    setConverting(true);
    els.logContainer.innerHTML = '';
    addLog(`Converting ${state.selected.size} conversations…`);

    try {
      const result = await window.electronAPI.startConvert({
        outputDir: state.outputDir,
        selectedIndexes: Array.from(state.selected).sort((a, b) => a - b),
        options: {
          obsidianFrontmatter: els.optObsidian.checked,
          writeIndex: els.optIndex.checked,
          dateFolders: els.optDateFolders.checked,
          existingFileOption: els.existingFileOption.value
        }
      });

      const pct = result.total ? (result.processed / result.total) * 100 : 100;
      els.progressFill.style.width = `${pct}%`;
      els.progressText.textContent = result.cancelled ? 'Cancelled' : 'Complete';
      els.statProcessed.textContent = String(result.processed);
      els.statSuccess.textContent = String(result.success);
      els.statSkipped.textContent = String(result.skipped);
      els.statErrors.textContent = String(result.errors);

      if (result.cancelled) {
        showError(`Cancelled after ${result.success} files`);
      } else {
        showSuccess(`Converted ${result.success} conversations`);
      }
    } catch (error) {
      showError(error.message);
      addLog(error.message, 'error');
    } finally {
      setConverting(false);
    }
  }

  // Events
  els.selectFolderBtn.addEventListener('click', async () => {
    if (!requireElectron()) return;
    const folder = await window.electronAPI.showFolderPicker({
      title: 'Select Export Folder'
    });
    if (folder) await loadPath(folder);
  });

  els.selectFileBtn.addEventListener('click', async () => {
    if (!requireElectron()) return;
    const file = await window.electronAPI.showFilePicker({
      title: 'Select Export JSON or ZIP',
      filters: [
        { name: 'Exports', extensions: ['json', 'zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (file) await loadPath(file);
  });

  els.selectOutputBtn.addEventListener('click', async () => {
    if (!requireElectron()) return;
    const folder = await window.electronAPI.showFolderPicker({
      title: 'Select Output Directory',
      defaultPath: state.outputDir || undefined
    });
    if (folder) {
      state.outputDir = folder;
      els.outputPath.textContent = folder;
      updateSelectedCount();
      addLog(`Output directory: ${folder}`);
    }
  });

  els.convertBtn.addEventListener('click', startConvert);
  els.cancelBtn.addEventListener('click', async () => {
    if (!requireElectron()) return;
    await window.electronAPI.cancelConvert();
  });

  els.selectAllBtn.addEventListener('click', () => {
    for (const s of filteredSummaries()) state.selected.add(s.index);
    renderList();
    updateSelectedCount();
  });

  els.selectNoneBtn.addEventListener('click', () => {
    for (const s of filteredSummaries()) state.selected.delete(s.index);
    renderList();
    updateSelectedCount();
  });

  els.searchInput.addEventListener('input', () => {
    state.filter = els.searchInput.value;
    renderList();
  });

  els.guideBtn.addEventListener('click', async () => {
    if (!requireElectron()) return;
    const guides = await window.electronAPI.getProviderGuide();
    els.guideContent.innerHTML = '';
    for (const guide of guides) {
      const block = document.createElement('div');
      block.className = 'guide-provider';
      const h = document.createElement('h3');
      h.textContent = guide.title;
      const ol = document.createElement('ol');
      for (const step of guide.steps) {
        const li = document.createElement('li');
        li.textContent = step;
        ol.appendChild(li);
      }
      block.appendChild(h);
      block.appendChild(ol);
      els.guideContent.appendChild(block);
    }
    els.guideDialog.showModal();
  });

  // Drag and drop: Electron provides file.path on dropped File objects
  ['dragenter', 'dragover'].forEach(evt => {
    els.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropZone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    els.dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === 'dragleave') els.dropZone.classList.remove('drag-over');
    });
  });
  els.dropZone.addEventListener('drop', async (e) => {
    els.dropZone.classList.remove('drag-over');
    if (!requireElectron()) return;
    const file = e.dataTransfer?.files?.[0];
    const filePath = file ? window.electronAPI.getPathForFile(file) : null;
    if (!filePath) {
      showError('Could not read dropped path. Use Select Folder / Select File.');
      return;
    }
    await loadPath(filePath);
  });

  if (isElectron) {
    window.electronAPI.onConvertLog(({ message, type }) => addLog(message, type));
    window.electronAPI.onConvertProgress((progress) => {
      const pct = progress.total ? (progress.processed / progress.total) * 100 : 0;
      els.progressFill.style.width = `${pct}%`;
      els.progressText.textContent = `${progress.processed} / ${progress.total}`;
      els.statProcessed.textContent = String(progress.processed);
      els.statSuccess.textContent = String(progress.success);
      els.statSkipped.textContent = String(progress.skipped);
      els.statErrors.textContent = String(progress.errors);
    });
  } else {
    showError('Open this app with Electron: cd viewer && npm start');
  }
})();
