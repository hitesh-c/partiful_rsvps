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
      maxRetries: 2,
      skipOptionalQuestions: true,
      keepTabsOpen: false,
      makeTabsVisible: false,
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

const automationState = {
  status: 'idle',
  queue: [],
  activeTabs: new Map(),
  maxConcurrent: 1,
  visitDuration: 5000,
  maxRetries: 2,
  keepTabsOpen: false,
  makeTabsVisible: false
};

// MV3 service workers are shut down after ~30s idle, which wipes automationState and any
// setTimeout. Active tabs are mirrored to session storage, timeouts use chrome.alarms, and
// every event handler calls ensureState() first to rebuild the in-memory state.
const ACTIVE_TABS_KEY = 'automationActiveTabs';
const TIMEOUT_ALARM_PREFIX = 'tab-timeout:';
let statePromise = null;

function ensureState() {
  if (!statePromise) {
    statePromise = restoreState().catch((error) => {
      console.error('Failed to restore automation state', error);
    });
  }
  return statePromise;
}

async function restoreState() {
  const settings = await getSettings();
  const status = settings.automation.status;
  if (status !== 'running' && status !== 'paused') return;

  automationState.status = status;
  automationState.queue = (settings.automation.progress || []).map((job, index) => ({
    attempts: 0,
    ...job,
    index
  }));
  applyAutomationConfig(settings);

  const stored = await chrome.storage.session.get([ACTIVE_TABS_KEY]);
  for (const [tabId, saved] of stored[ACTIVE_TABS_KEY] || []) {
    const job = automationState.queue[saved.index];
    if (!job || job.status !== 'in_progress') continue;
    const tabExists = await chrome.tabs.get(tabId).then(() => true, () => false);
    if (tabExists) {
      automationState.activeTabs.set(tabId, { job, startTime: saved.startTime });
    }
  }

  // Jobs marked in progress whose tab is gone (browser restart, closed tab) go back in line.
  const tracked = new Set([...automationState.activeTabs.values()].map((entry) => entry.job));
  automationState.queue.forEach((job) => {
    if (job.status === 'in_progress' && !tracked.has(job)) job.status = 'pending';
  });
  await persistActiveTabs();
}

function persistActiveTabs() {
  const entries = [...automationState.activeTabs].map(([tabId, entry]) => [
    tabId,
    { index: entry.job.index, startTime: entry.startTime }
  ]);
  return chrome.storage.session.set({ [ACTIVE_TABS_KEY]: entries });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(TIMEOUT_ALARM_PREFIX)) return;
  const tabId = Number(alarm.name.slice(TIMEOUT_ALARM_PREFIX.length));
  runSafely('handle an event timeout', () => handleTabTimeout(tabId));
});

// Restores state, runs the handler, and surfaces any error in the automation log
// instead of failing silently inside the service worker.
async function runSafely(action, handler) {
  try {
    await ensureState();
    await handler();
  } catch (error) {
    console.error(`Failed to ${action}`, error);
    try {
      await appendLog(`⚠️ Could not ${action}: ${error?.message || error}`);
    } catch (logError) {
      console.error('Could not write to the automation log', logError);
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setSettings(settings);
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case 'settings:get':
      getSettings().then((settings) => sendResponse({ settings }));
      return true;
    case 'automation:start':
      runSafely('start the queue', startAutomation);
      break;
    case 'automation:pause':
      runSafely('pause the queue', pauseAutomation);
      break;
    case 'automation:clear':
      runSafely('clear progress', clearAutomation);
      break;
    case 'automation:retryNeedsAnswers':
      runSafely('retry events', retryNeedsAnswers);
      break;
    case 'automation:updateSettings':
      runSafely('apply settings', refreshAutomationConfig);
      break;
    case 'automation:itemComplete':
      runSafely('record an event result', () => handleAutomationCompletion(sender?.tab?.id, message));
      break;
    default:
      break;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => runSafely('handle a closed tab', async () => {
  if (automationState.activeTabs.has(tabId)) {
    appendLog(`Tab ${tabId} closed before completion.`);
    const { job } = automationState.activeTabs.get(tabId);
    if (job.status === 'in_progress') job.status = 'failed';
    job.result = job.result || 'Tab was closed before completion';
    automationState.activeTabs.delete(tabId);
    chrome.alarms.clear(TIMEOUT_ALARM_PREFIX + tabId);
    await persistActiveTabs();
    await updateAutomationSettings({ progress: automationState.queue });
    if (!(await finishQueueIfDone())) maybeResumeQueue();
  }
}));

async function getSettings() {
  const stored = await chrome.storage.local.get(['settings']);
  const merged = deepMerge(createDefaultSettings(), stored.settings || {});
  return merged;
}

async function setSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function startAutomation() {
  if (automationState.status === 'running') {
    appendLog('Automation already running.');
    maybeResumeQueue();
    return;
  }
  if (automationState.status === 'paused' && automationState.queue.some((job) => job.status === 'pending')) {
    automationState.status = 'running';
    await updateAutomationSettings({ status: 'running' });
    appendLog('Automation resumed.');
    maybeResumeQueue();
    return;
  }
  const settings = await getSettings();
  const eventList = [...new Set((settings.automation.eventList || []).map((url) => String(url).trim()).filter(Boolean))];
  if (!eventList.length) {
    appendLog('No event URLs queued. Paste Partiful event links first.');
    return;
  }

  const invalid = eventList.filter((url) => !isPartifulEventUrl(url));
  if (invalid.length === eventList.length) {
    appendLog('None of the queued links are Partiful event links (https://partiful.com/e/…).');
    return;
  }

  automationState.status = 'running';
  automationState.queue = eventList.map((url, index) => (isPartifulEventUrl(url)
    ? { url, status: 'pending', index, attempts: 0 }
    : { url, status: 'failed', index, attempts: 0, result: 'Not a Partiful event link' }));
  if (invalid.length) {
    appendLog(`Skipping ${invalid.length} link(s) that are not Partiful events: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
  }
  applyAutomationConfig(settings);

  await updateAutomationSettings({ status: 'running', progress: automationState.queue });
  appendLog(`Starting automation for ${eventList.length - invalid.length} event(s).`);
  if (automationState.makeTabsVisible) {
    appendLog('Debug mode: Tabs will be visible so you can watch the filling.');
  }
  if (automationState.keepTabsOpen) {
    appendLog('Debug mode: Tabs will stay open after completion.');
  }
  maybeResumeQueue();
}

function pauseAutomation() {
  if (automationState.status !== 'running') {
    appendLog('Automation is not running.');
    return;
  }
  automationState.status = 'paused';
  updateAutomationSettings({ status: 'paused' });
  appendLog('Automation paused. Active tabs will finish current task.');
}

async function clearAutomation() {
  automationState.status = 'idle';
  automationState.queue = [];
  const closePromises = [];
  automationState.activeTabs.forEach((job, tabId) => {
    chrome.alarms.clear(TIMEOUT_ALARM_PREFIX + tabId);
    closePromises.push(removeTab(tabId));
  });
  automationState.activeTabs.clear();
  await persistActiveTabs();
  await Promise.all(closePromises);
  await updateAutomationSettings({ status: 'idle', progress: [], log: [] });
  appendLog('Automation state cleared.');
}

function applyAutomationConfig(settings) {
  const config = settings.automation || {};
  const retries = Number(config.maxRetries);
  automationState.maxConcurrent = Math.max(1, config.maxConcurrent || 1);
  automationState.visitDuration = Math.max(120000, config.visitDuration || 120000);
  automationState.maxRetries = Number.isFinite(retries) ? Math.min(10, Math.max(0, retries)) : 2;
  automationState.keepTabsOpen = Boolean(config.keepTabsOpen);
  automationState.makeTabsVisible = Boolean(config.makeTabsVisible);
}

async function refreshAutomationConfig() {
  const settings = await getSettings();
  applyAutomationConfig(settings);
}

async function maybeResumeQueue() {
  if (automationState.status !== 'running') {
    return;
  }
  while (
    automationState.activeTabs.size < automationState.maxConcurrent &&
    automationState.queue.some((job) => job.status === 'pending')
  ) {
    const nextJob = automationState.queue.find((job) => job.status === 'pending');
    if (!nextJob) break;
    nextJob.status = 'in_progress';
    nextJob.attempts += 1;
    let tab;
    try {
      tab = await createTab(nextJob.url);
    } catch (error) {
      failJob(nextJob, `Could not open tab: ${error?.message || 'unknown error'}`);
      await updateAutomationSettings({ progress: automationState.queue });
      continue;
    }
    automationState.activeTabs.set(tab.id, {
      job: nextJob,
      startTime: Date.now()
    });
    await persistActiveTabs();
    appendLog(`Opened tab ${tab.id} for ${nextJob.url}`);
    scheduleTimeoutForTab(tab.id);
  }
  await updateAutomationSettings({ progress: automationState.queue });
  // If every remaining event failed before a tab could open, nothing else will end the run.
  await finishQueueIfDone();
}

function scheduleTimeoutForTab(tabId) {
  const entry = automationState.activeTabs.get(tabId);
  if (!entry) return;
  chrome.alarms.create(TIMEOUT_ALARM_PREFIX + tabId, {
    when: entry.startTime + automationState.visitDuration
  });
}

async function handleTabTimeout(tabId) {
  if (!automationState.activeTabs.has(tabId)) return;
  const { job } = automationState.activeTabs.get(tabId) || {};
  if (job) {
    failJob(job, 'Timed out waiting for the event page', { tabId, finalStatus: 'timeout' });
  }
  automationState.activeTabs.delete(tabId);
  await persistActiveTabs();
  await updateAutomationSettings({ progress: automationState.queue });
  await removeTab(tabId);
  await finishQueueIfDone();
  maybeResumeQueue();
}

async function finishQueueIfDone() {
  if (
    automationState.status !== 'running' ||
    automationState.activeTabs.size > 0 ||
    automationState.queue.some((item) => item.status === 'pending' || item.status === 'in_progress')
  ) {
    return false;
  }
  automationState.status = 'idle';
  await updateAutomationSettings({ status: 'idle' });
  const completedCount = automationState.queue.filter((item) => item.status === 'completed').length;
  const failedCount = automationState.queue.filter((item) => item.status === 'failed' || item.status === 'timeout').length;
  const needsCount = automationState.queue.filter((item) => item.status === 'needs_answers').length;
  appendLog(`Automation queue finished: ${completedCount} completed, ${needsCount} need answers, ${failedCount} failed.`);
  if (needsCount) {
    appendLog('Answer the new questions under "Questions to answer", then click "Retry".');
  }
  return true;
}

async function handleAutomationCompletion(tabId, message) {
  if (!automationState.activeTabs.has(tabId)) {
    // e.g. an event page the user opened by hand while the queue is running.
    appendLog(`Ignored a result from tab ${tabId}, which is not part of the queue.`);
    return;
  }
  const entry = automationState.activeTabs.get(tabId);
  chrome.alarms.clear(TIMEOUT_ALARM_PREFIX + tabId);
  const { job } = entry;

  await recordQuestions(message.questions, job.url);

  if (message.success) {
    job.status = 'completed';
    job.result = message.detail || '';
    appendLog(`Tab ${tabId} completed: ${job.result || ''}`.trim());
  } else if (message.needsAnswers) {
    // Unknown required questions: retrying won't help until the user adds answers.
    job.status = 'needs_answers';
    job.result = message.detail || 'Needs answers';
    appendLog(`Tab ${tabId} skipped for now — ${job.result}`);
  } else if (message.fatal === 'login') {
    // Every event would fail the same way, so stop instead of burning through the queue.
    job.status = 'pending';
    job.attempts = Math.max(0, job.attempts - 1);
    automationState.status = 'paused';
    await updateAutomationSettings({ status: 'paused' });
    appendLog('⚠️ Queue paused: you are not logged in to Partiful. Log in at partiful.com in this browser, then click "Resume queue".');
  } else {
    failJob(job, message.detail || 'Autofill failed', { permanent: Boolean(message.permanent), tabId });
  }

  automationState.activeTabs.delete(tabId);
  await persistActiveTabs();
  await updateAutomationSettings({ progress: automationState.queue });

  const shouldCloseTab = message.closeTab !== false && !automationState.keepTabsOpen;
  if (shouldCloseTab) {
    await removeTab(tabId);
  } else if (automationState.keepTabsOpen) {
    appendLog(`Tab ${tabId} kept open for inspection (debug mode).`);
  }

  if (!(await finishQueueIfDone())) {
    maybeResumeQueue();
  }
}

// Retries are user-controlled: maxRetries is the number of extra attempts after the first.
function failJob(job, reason, { permanent = false, tabId, finalStatus = 'failed' } = {}) {
  const maxRetries = automationState.maxRetries;
  const where = tabId ? `Tab ${tabId}` : job.url;
  if (!permanent && job.attempts <= maxRetries) {
    job.status = 'pending';
    job.result = `Retry ${job.attempts}/${maxRetries}: ${reason}`;
    appendLog(`${where} failed, will retry (${job.attempts}/${maxRetries}): ${reason}`);
    return;
  }
  job.status = finalStatus;
  if (permanent) {
    job.result = reason;
    appendLog(`${where} skipped: ${reason}`);
  } else {
    job.result = `Failed after ${job.attempts} attempt(s): ${reason}`;
    appendLog(`${where} failed after ${job.attempts} attempt(s): ${reason}`);
  }
}

// Second pass: re-run only the events that were waiting on answers.
async function retryNeedsAnswers() {
  if (automationState.status === 'idle') {
    // The in-memory queue is only restored while running/paused; rebuild it from storage.
    const settings = await getSettings();
    automationState.queue = (settings.automation.progress || []).map((job, index) => ({ attempts: 0, ...job, index }));
    await refreshAutomationConfig();
  }
  const waiting = automationState.queue.filter((job) => job.status === 'needs_answers');
  if (!waiting.length) {
    appendLog('No events are waiting on answers.');
    return;
  }
  waiting.forEach((job) => {
    job.status = 'pending';
    job.attempts = 0;
    job.result = '';
  });
  automationState.status = 'running';
  await updateAutomationSettings({ status: 'running', progress: automationState.queue });
  appendLog(`Retrying ${waiting.length} event(s) that needed answers.`);
  maybeResumeQueue();
}

// Every unique question seen across events, keyed by normalised label. `events` gives the
// frequency; `open` means it currently has no answer and should be shown to the user.
const PENDING_QUESTIONS_KEY = 'pendingQuestions';
let pendingWriteChain = Promise.resolve();

function pendingQuestionKey(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function recordQuestions(questions, eventUrl) {
  if (!Array.isArray(questions) || !questions.length) return Promise.resolve();
  const run = pendingWriteChain.then(async () => {
    const stored = await chrome.storage.local.get([PENDING_QUESTIONS_KEY]);
    const pending = stored[PENDING_QUESTIONS_KEY] || {};
    questions.forEach((question) => {
      const key = pendingQuestionKey(question.label);
      if (!key) return;
      const entry = pending[key] || { label: question.label, events: [], firstSeen: Date.now() };
      entry.type = question.type === 'dropdown' ? 'dropdown' : 'text';
      entry.options = [...new Set([...(entry.options || []), ...(question.options || [])])];
      entry.required = Boolean(entry.required || question.required);
      entry.lastSeen = Date.now();
      if (eventUrl && !entry.events.includes(eventUrl)) entry.events.push(eventUrl);
      // Unanswered again means any earlier answer is gone or no longer matches.
      entry.open = !question.answered;
      delete entry.answered;
      pending[key] = entry;
    });
    await chrome.storage.local.set({ [PENDING_QUESTIONS_KEY]: pending });
  });
  pendingWriteChain = run.catch((error) => console.error('Failed to record questions', error));
  return pendingWriteChain;
}

// Settings writes are read-modify-write; run them one at a time so overlapping
// log/progress updates don't overwrite each other.
let settingsWriteChain = Promise.resolve();

function queueSettingsWrite(mutate) {
  const run = settingsWriteChain.then(async () => {
    const settings = await getSettings();
    const log = mutate(settings);
    await setSettings(settings);
    safeSendMessage({ type: 'automation:logUpdate', log });
  });
  settingsWriteChain = run.catch((error) => console.error('Settings write failed', error));
  return run;
}

function updateAutomationSettings(partial) {
  return queueSettingsWrite((settings) => {
    settings.automation = {
      ...settings.automation,
      ...partial,
      log: partial.log || settings.automation.log || []
    };
    return settings.automation.log;
  });
}

function appendLog(message) {
  return queueSettingsWrite((settings) => {
    const logEntry = { timestamp: Date.now(), message };
    settings.automation.log = [...(settings.automation.log || []), logEntry].slice(-200);
    return settings.automation.log;
  });
}

function deepMerge(target, source) {
  if (Array.isArray(target)) {
    return Array.isArray(source) ? source.map((item) => (typeof item === 'object' ? deepMerge({}, item) : item)) : [...target];
  }
  const output = { ...target };
  if (!source || typeof source !== 'object') {
    return output;
  }
  Object.keys(source).forEach((key) => {
    if (Array.isArray(source[key])) {
      if (key === 'dropdowns' || key === 'questions') {
        output[key] = mergeArrayById(target[key] || [], source[key]);
      } else {
        output[key] = source[key].map((item) => (typeof item === 'object' ? deepMerge({}, item) : item));
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

function isPartifulEventUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      /(^|\.)partiful\.com$/.test(parsed.hostname) &&
      /^\/e\/[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    const active = automationState.makeTabsVisible;
    chrome.tabs.create({ url, active }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tab);
      }
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
      // The tab may already be gone (closed by the user); that's fine.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function safeSendMessage(payload) {
  try {
    chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
  } catch (error) {
    /* swallow */
  }
}
