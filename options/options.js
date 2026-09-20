(function () {
  function createDefaultSettings() {
    return {
      profile: {
        email: '',
        firstName: '',
        lastName: '',
        fullName: '',
        linkedin: '',
        company: '',
        title: '',
        industry: '',
        startupBlurb: '',
        achievement: '',
        ask: '',
        rsvpComment: ''
      },
      dropdowns: getDefaultDropdownRules(),
      questions: getDefaultQuestionRules(),
      rsvp: {
        choice: 'going',
        attendeeLabel: '1 attendee',
        rsvpOpenDelay: 6000,
        autoSubmit: true,
        submitDelay: 1000,
        includeComment: false
      },
      automation: {
        eventList: [],
        maxConcurrent: 1,
        visitDuration: 120000,
        status: 'idle',
        progress: [],
        log: []
      }
    };
  }

  function getDefaultDropdownRules() {
    return [
      {
        id: 'job-title',
        title: 'Job title',
        matchers: ['what is your job title', 'job title'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'stage',
        title: 'Stage',
        matchers: ['what stage', 'stage?'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'fundraising',
        title: 'Raised / ticket size',
        matchers: ['how much have you raised', 'ticket size'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'arr',
        title: 'ARR',
        matchers: ['arr', 'annual recurring revenue'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'volunteer',
        title: 'Volunteer interest',
        matchers: ['volunteer', 'help with this event'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'sponsor',
        title: 'Sponsorship interest',
        matchers: ['sponsor this event', 'sponsoring this event'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'host-linkedin',
        title: 'Add host on LinkedIn',
        matchers: ['please add me linkedin', 'add me linkedin', 'approval rate'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'ticket-purchase',
        title: 'Ticket purchase acknowledgement',
        matchers: ['people who purchase tickets'],
        preferred: '',
        fallbacks: []
      },
      {
        id: 'follow-linkedin',
        title: 'Follow on LinkedIn',
        matchers: ['are you following us on linkedin'],
        preferred: '',
        fallbacks: []
      }
    ];
  }

  function getDefaultQuestionRules() {
    return [
      {
        id: 'nachonacho',
        matchType: 'contains',
        pattern: 'nachonacho.com',
        answerType: 'text',
        value: ''
      },
      {
        id: 'whatsapp-group',
        matchType: 'contains',
        pattern: 'whatsapp group',
        answerType: 'text',
        value: ''
      },
      {
        id: 'raised-capital',
        matchType: 'contains',
        pattern: 'have you raised capital',
        answerType: 'text',
        value: ''
      }
    ];
  }

  let settings = null;

  document.addEventListener('DOMContentLoaded', async () => {
    settings = await loadSettings();
    hydrateProfile();
    // Sections start collapsed; a brand-new user still needs to see where to begin.
    if (!Object.values(settings.profile).some(Boolean)) {
      document.querySelector('#profile-section details').open = true;
    }
    hydrateDropdowns();
    hydrateQuestions();
    hydrateRsvp();
    hydrateAutomation();
    wireEvents();
    loadSavedAt();
  });

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const merged = deepMerge(createDefaultSettings(), result.settings || {});
        if (!result.settings) {
          chrome.storage.local.set({ settings: merged });
        }
        resolve(merged);
      });
    });
  }

  const AUTOMATION_CONFIG_KEYS = ['eventList', 'maxConcurrent', 'visitDuration', 'keepTabsOpen', 'makeTabsVisible'];
  const AUTOSAVE_DELAY = 400;
  const SAVED_AT_KEY = 'settingsSavedAt';
  let pendingSaves = 0;
  let lastSavedAt = null;
  const saveDropdownsSoon = debounce(() => saveSettings('dropdowns'), AUTOSAVE_DELAY);
  const saveQuestionsSoon = debounce(() => saveSettings('questions'), AUTOSAVE_DELAY);

  // Writes one section on top of whatever is in storage, so the background worker's
  // queue status/progress/log are never overwritten with this page's stale copy.
  function saveSettings(section) {
    pendingSaves++;
    setSaveStatus('Saving…', 'saving');
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const stored = deepMerge(createDefaultSettings(), result.settings || {});
        if (section === 'automation') {
          AUTOMATION_CONFIG_KEYS.forEach((key) => {
            stored.automation[key] = settings.automation[key];
          });
        } else if (section === 'automation:runtime') {
          stored.automation.status = settings.automation.status;
          stored.automation.progress = settings.automation.progress;
          stored.automation.log = settings.automation.log;
        } else {
          stored[section] = settings[section];
        }
        const savedAt = Date.now();
        chrome.storage.local.set({ settings: stored, [SAVED_AT_KEY]: savedAt }, () => {
          pendingSaves--;
          if (pendingSaves === 0) {
            if (chrome.runtime.lastError) {
              setSaveStatus('Could not save', 'error');
            } else {
              lastSavedAt = savedAt;
              renderSavedAt();
            }
          }
          resolve();
        });
      });
    });
  }

  function setSaveStatus(text, state) {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.dataset.state = state;
  }

  function formatUtc(timestamp) {
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getUTCMonth()];
    return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
  }

  function renderSavedAt() {
    if (!lastSavedAt || pendingSaves > 0) return;
    const el = document.getElementById('save-status');
    setSaveStatus(`Last saved ${formatUtc(lastSavedAt)}`, 'saved');
    el.title = `${new Date(lastSavedAt).toLocaleString()} your time`;
  }

  function loadSavedAt() {
    chrome.storage.local.get([SAVED_AT_KEY], (result) => {
      lastSavedAt = result[SAVED_AT_KEY] || null;
      renderSavedAt();
    });
  }

  function debounce(fn, delay) {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  function autosaveForm(formId, save) {
    const form = document.getElementById(formId);
    const debounced = debounce(save, AUTOSAVE_DELAY);
    form.addEventListener('input', () => {
      setSaveStatus('Saving…', 'saving');
      debounced();
    });
    form.addEventListener('change', save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
  }

  function hydrateProfile() {
    const form = document.getElementById('profile-form');
    Object.entries(settings.profile).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field) {
        field.value = value || '';
      }
    });
  }

  function hydrateDropdowns() {
    const container = document.getElementById('dropdown-list');
    container.innerHTML = '';
    settings.dropdowns.forEach((rule, index) => {
      const instance = createDropdownRuleElement(rule, index);
      container.appendChild(instance);
    });
  }

  function hydrateQuestions() {
    const container = document.getElementById('question-list');
    container.innerHTML = '';
    settings.questions.forEach((rule, index) => {
      const instance = createQuestionRuleElement(rule, index);
      container.appendChild(instance);
    });
  }

  function hydrateRsvp() {
    const form = document.getElementById('rsvp-form');
    form.elements.namedItem('choice').value = settings.rsvp.choice;
    form.elements.namedItem('attendeeLabel').value = settings.rsvp.attendeeLabel || '';
    setPresetValue(form.elements.namedItem('rsvpOpenDelay'), settings.rsvp.rsvpOpenDelay ?? 6000);
    form.elements.namedItem('autoSubmit').checked = settings.rsvp.autoSubmit !== false;
    setPresetValue(form.elements.namedItem('submitDelay'), settings.rsvp.submitDelay ?? 1000);
    form.elements.namedItem('includeComment').checked = Boolean(settings.rsvp.includeComment);
  }

  function hydrateAutomation() {
    const form = document.getElementById('automation-form');
    form.elements.namedItem('eventList').value = (settings.automation.eventList || []).join('\n');
    setPresetValue(form.elements.namedItem('maxConcurrent'), settings.automation.maxConcurrent || 1);
    setPresetValue(form.elements.namedItem('visitDuration'), Math.max(120000, settings.automation.visitDuration || 120000));
    form.elements.namedItem('keepTabsOpen').checked = Boolean(settings.automation.keepTabsOpen);
    form.elements.namedItem('makeTabsVisible').checked = Boolean(settings.automation.makeTabsVisible);
    renderAutomationLog();
    renderQueueStatus();
    updateEventCount();
  }

  // Selects a preset; a previously saved value that isn't a preset gets its own option.
  function setPresetValue(select, value) {
    const stringValue = String(value);
    if (![...select.options].some((option) => option.value === stringValue)) {
      const option = document.createElement('option');
      option.value = stringValue;
      option.textContent = select.dataset.unit === 'ms' ? `${Number(value) / 1000} sec` : stringValue;
      select.appendChild(option);
    }
    select.value = stringValue;
  }

  function updateEventCount() {
    const textarea = document.getElementById('automation-form').elements.namedItem('eventList');
    const count = textarea.value.split('\n').filter((line) => line.trim()).length;
    document.getElementById('event-count').textContent = String(count);
  }

  function renderQueueStatus() {
    const status = settings.automation.status || 'idle';
    const progress = settings.automation.progress || [];
    const total = progress.length;
    const count = (...states) => progress.filter((job) => states.includes(job.status)).length;
    const done = count('completed');
    const failed = count('failed', 'timeout');
    const finished = done + failed;

    const badge = document.getElementById('queue-badge');
    badge.dataset.state = status;
    badge.textContent = { running: 'Running', paused: 'Paused' }[status] || 'Idle';

    const parts = total
      ? [`${finished} of ${total} events`, `${done} done`, failed ? `${failed} failed` : null].filter(Boolean)
      : ['No events run yet'];
    document.getElementById('queue-summary').textContent = parts.join(' · ');
    document.getElementById('queue-bar-fill').style.width = total ? `${(finished / total) * 100}%` : '0%';

    document.getElementById('start-automation').disabled = status === 'running';
    document.getElementById('start-automation').textContent = status === 'paused' ? 'Resume queue' : 'Start queue';
    document.getElementById('pause-automation').disabled = status !== 'running';
  }

  function renderAutomationLog() {
    const logContainer = document.getElementById('automation-log');
    logContainer.innerHTML = '';
    (settings.automation.log || []).slice(-100).forEach((entry) => {
      const div = document.createElement('div');
      div.textContent = `${new Date(entry.timestamp).toLocaleTimeString()} • ${entry.message}`;
      logContainer.appendChild(div);
    });
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function wireEvents() {
    autosaveForm('profile-form', saveProfile);
    autosaveForm('rsvp-form', saveRsvp);
    autosaveForm('automation-form', saveAutomation);
    document.getElementById('automation-form').addEventListener('input', updateEventCount);

    document.getElementById('add-dropdown').addEventListener('click', async () => {
      settings.dropdowns.push({
        id: crypto.randomUUID(),
        title: '',
        matchers: [],
        preferred: '',
        fallbacks: []
      });
      await saveSettings('dropdowns');
      hydrateDropdowns();
      openLastField('dropdown-list');
    });

    document.getElementById('add-question').addEventListener('click', async () => {
      settings.questions.push({
        id: crypto.randomUUID(),
        matchType: 'exact',
        pattern: '',
        answerType: 'text',
        value: ''
      });
      await saveSettings('questions');
      hydrateQuestions();
      openLastField('question-list');
    });

    document.querySelectorAll('.info-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        // The button sits inside a <summary>; don't let it collapse the section.
        event.preventDefault();
        event.stopPropagation();
        const panel = document.getElementById(button.dataset.info);
        const section = button.closest('details');
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden && section) section.open = true;
      });
    });

    document.getElementById('start-automation').addEventListener('click', async () => {
      await saveAutomation();
      sendRuntimeMessage({ type: 'automation:start' });
    });

    document.getElementById('pause-automation').addEventListener('click', () => {
      sendRuntimeMessage({ type: 'automation:pause' });
    });

    document.getElementById('clear-automation').addEventListener('click', async () => {
      settings.automation.log = [];
      settings.automation.progress = [];
      settings.automation.status = 'idle';
      await saveSettings('automation:runtime');
      renderAutomationLog();
      renderQueueStatus();
      sendRuntimeMessage({ type: 'automation:clear' });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      const next = changes.settings?.newValue?.automation;
      if (area !== 'local' || !next) return;
      settings.automation.status = next.status;
      settings.automation.progress = next.progress || [];
      renderQueueStatus();
      const textarea = document.getElementById('automation-form').elements.namedItem('eventList');
      const incoming = (next.eventList || []).join('\n');
      if (document.activeElement !== textarea && incoming !== (settings.automation.eventList || []).join('\n')) {
        settings.automation.eventList = next.eventList || [];
        textarea.value = incoming;
        updateEventCount();
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'automation:logUpdate') {
        settings.automation.log = message.log;
        renderAutomationLog();
      }
    });
  }

  function saveProfile() {
    const form = document.getElementById('profile-form');
    Object.keys(settings.profile).forEach((key) => {
      const field = form.elements.namedItem(key);
      if (field) settings.profile[key] = field.value.trim();
    });
    return saveSettings('profile');
  }

  function saveRsvp() {
    const form = document.getElementById('rsvp-form');
    settings.rsvp.choice = form.elements.namedItem('choice').value;
    settings.rsvp.attendeeLabel = form.elements.namedItem('attendeeLabel').value.trim();
    settings.rsvp.rsvpOpenDelay = Math.max(0, parseInt(form.elements.namedItem('rsvpOpenDelay').value, 10) || 0);
    settings.rsvp.autoSubmit = form.elements.namedItem('autoSubmit').checked;
    settings.rsvp.submitDelay = parseInt(form.elements.namedItem('submitDelay').value, 10) || 0;
    settings.rsvp.includeComment = form.elements.namedItem('includeComment').checked;
    return saveSettings('rsvp');
  }

  async function saveAutomation() {
    const form = document.getElementById('automation-form');
    settings.automation.eventList = form.elements.namedItem('eventList').value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    settings.automation.maxConcurrent = Math.max(1, parseInt(form.elements.namedItem('maxConcurrent').value, 10) || 1);
    settings.automation.visitDuration = Math.max(120000, parseInt(form.elements.namedItem('visitDuration').value, 10) || 120000);
    settings.automation.keepTabsOpen = form.elements.namedItem('keepTabsOpen').checked;
    settings.automation.makeTabsVisible = form.elements.namedItem('makeTabsVisible').checked;
    await saveSettings('automation');
    sendRuntimeMessage({ type: 'automation:updateSettings' });
  }

  function createDropdownRuleElement(rule, index) {
    const template = document.getElementById('dropdown-template');
    const node = template.content.cloneNode(true);
    const fieldset = node.querySelector('fieldset');
    fieldset.dataset.index = String(index);

    const titleInput = fieldset.querySelector('input[name="title"]');
    titleInput.value = rule.title || '';
    titleInput.addEventListener('input', handleDropdownChange);

    const matcherInput = fieldset.querySelector('input[name="matchers"]');
    matcherInput.value = (rule.matchers || []).join(', ');
    matcherInput.addEventListener('input', handleDropdownChange);

    const preferredInput = fieldset.querySelector('input[name="preferred"]');
    preferredInput.value = rule.preferred || '';
    preferredInput.addEventListener('input', handleDropdownChange);

    const fallbackInput = fieldset.querySelector('input[name="fallbacks"]');
    fallbackInput.value = (rule.fallbacks || []).join(', ');
    fallbackInput.addEventListener('input', handleDropdownChange);

    updateDropdownSummary(fieldset, rule);

    fieldset.querySelector('.remove-rule').addEventListener('click', async () => {
      settings.dropdowns.splice(index, 1);
      await saveSettings('dropdowns');
      hydrateDropdowns();
    });

    return node;
  }

  function handleDropdownChange(event) {
    const fieldset = event.target.closest('fieldset');
    const index = parseInt(fieldset.dataset.index, 10);
    const rule = settings.dropdowns[index];
    rule.title = fieldset.querySelector('input[name="title"]').value.trim();
    rule.matchers = fieldset.querySelector('input[name="matchers"]').value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    rule.preferred = fieldset.querySelector('input[name="preferred"]').value.trim();
    rule.fallbacks = fieldset.querySelector('input[name="fallbacks"]').value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    updateDropdownSummary(fieldset, rule);
    saveDropdownsSoon();
  }

  function updateDropdownSummary(fieldset, rule) {
    setFieldSummary(
      fieldset,
      rule.title || (rule.matchers || [])[0] || 'New dropdown field',
      rule.preferred ? `→ ${rule.preferred}` : 'No answer set'
    );
  }

  function updateQuestionSummary(fieldset, rule) {
    setFieldSummary(
      fieldset,
      rule.pattern || 'New question field',
      rule.value ? `→ ${rule.value}` : 'No answer set'
    );
  }

  function setFieldSummary(fieldset, title, summary) {
    const item = fieldset.closest('.field-item');
    if (!item) return;
    item.querySelector('.field-title').textContent = title;
    const summaryNode = item.querySelector('.field-summary');
    summaryNode.textContent = summary;
    summaryNode.classList.toggle('is-empty', summary === 'No answer set');
  }

  function openLastField(listId) {
    const items = document.getElementById(listId).querySelectorAll('.field-item');
    const last = items[items.length - 1];
    if (!last) return;
    last.open = true;
    last.querySelector('input')?.focus();
  }

  function createQuestionRuleElement(rule, index) {
    const template = document.getElementById('question-template');
    const node = template.content.cloneNode(true);
    const fieldset = node.querySelector('fieldset');
    fieldset.dataset.index = String(index);

    const matchTypeSelect = fieldset.querySelector('select[name="matchType"]');
    matchTypeSelect.value = rule.matchType || 'exact';
    matchTypeSelect.addEventListener('change', handleQuestionChange);

    const patternInput = fieldset.querySelector('input[name="pattern"]');
    patternInput.value = rule.pattern || '';
    patternInput.addEventListener('input', handleQuestionChange);

    const answerTypeSelect = fieldset.querySelector('select[name="answerType"]');
    answerTypeSelect.value = rule.answerType || 'text';
    answerTypeSelect.addEventListener('change', handleQuestionChange);

    const valueInput = fieldset.querySelector('input[name="value"]');
    valueInput.value = rule.value || '';
    valueInput.addEventListener('input', handleQuestionChange);

    updateQuestionSummary(fieldset, rule);

    fieldset.querySelector('.remove-rule').addEventListener('click', async () => {
      settings.questions.splice(index, 1);
      await saveSettings('questions');
      hydrateQuestions();
    });

    return node;
  }

  function handleQuestionChange(event) {
    const fieldset = event.target.closest('fieldset');
    const index = parseInt(fieldset.dataset.index, 10);
    const rule = settings.questions[index];
    rule.matchType = fieldset.querySelector('select[name="matchType"]').value;
    rule.pattern = fieldset.querySelector('input[name="pattern"]').value.trim();
    rule.answerType = fieldset.querySelector('select[name="answerType"]').value;
    rule.value = fieldset.querySelector('input[name="value"]').value.trim();
    updateQuestionSummary(fieldset, rule);
    saveQuestionsSoon();
  }

  function sendRuntimeMessage(payload) {
    chrome.runtime.sendMessage(payload, () => {
      if (chrome.runtime.lastError) {
        console.warn('Runtime message failed', chrome.runtime.lastError);
      }
    });
  }

  function deepMerge(target, source) {
    const output = Array.isArray(target) ? [...target] : { ...target };
    if (Array.isArray(target)) {
      return source && Array.isArray(source) ? [...source] : output;
    }
    if (typeof source !== 'object' || source === null) {
      return output;
    }
    Object.keys(source).forEach((key) => {
      if (Array.isArray(source[key])) {
        if (key === 'dropdowns' || key === 'questions') {
          output[key] = mergeArrayById(target[key] || [], source[key]);
        } else {
          output[key] = [...source[key]];
        }
      } else if (typeof source[key] === 'object' && source[key] !== null) {
        output[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    });
    return output;
  }

  function mergeArrayById(defaults, stored) {
    const defaultsById = new Map(defaults.map((item) => [item.id, item]));
    const storedById = new Map(stored.map((item) => [item.id, item]));
    const result = [];

    stored.forEach((storedItem) => {
      const defaultItem = defaultsById.get(storedItem.id);
      if (defaultItem) {
        const isCustomized = JSON.stringify(storedItem) !== JSON.stringify(defaultItem);
        if (isCustomized) {
          result.push(storedItem);
        } else {
          result.push(defaultItem);
        }
      } else {
        result.push(storedItem);
      }
    });

    defaults.forEach((defaultItem) => {
      if (!storedById.has(defaultItem.id)) {
        result.push(defaultItem);
      }
    });

    return result;
  }
})();
