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
  automationState.maxConcurrent = Math.max(1, settings.automation.maxConcurrent || 1);
  automationState.visitDuration = Math.max(120000, settings.automation.visitDuration || 120000);
  automationState.keepTabsOpen = Boolean(settings.automation.keepTabsOpen);
  automationState.makeTabsVisible = Boolean(settings.automation.makeTabsVisible);

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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(TIMEOUT_ALARM_PREFIX)) return;
  await ensureState();
  handleTabTimeout(Number(alarm.name.slice(TIMEOUT_ALARM_PREFIX.length)));
});

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
      ensureState().then(startAutomation);
      break;
    case 'automation:pause':
      ensureState().then(pauseAutomation);
      break;
    case 'automation:clear':
      ensureState().then(clearAutomation);
      break;
    case 'automation:updateSettings':
      ensureState().then(refreshAutomationConfig);
      break;
    case 'automation:itemComplete':
      ensureState().then(() => handleAutomationCompletion(sender?.tab?.id, message));
      break;
    default:
      break;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ensureState();
  if (automationState.activeTabs.has(tabId)) {
    appendLog(`Tab ${tabId} closed before completion.`);
    const { job } = automationState.activeTabs.get(tabId);
    if (job.status === 'in_progress') job.status = 'failed';
    job.result = job.result || 'Tab was closed before completion';
    automationState.activeTabs.delete(tabId);
    chrome.alarms.clear(TIMEOUT_ALARM_PREFIX + tabId);
    await persistActiveTabs();
    maybeResumeQueue();
  }
});

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
  const eventList = (settings.automation.eventList || []).filter(Boolean);
  if (!eventList.length) {
    appendLog('No event URLs queued.');
    return;
  }

  automationState.status = 'running';
  automationState.queue = eventList.map((url, index) => ({ url, status: 'pending', index, attempts: 0 }));
  automationState.maxConcurrent = Math.max(1, settings.automation.maxConcurrent || 1);
  automationState.visitDuration = Math.max(120000, settings.automation.visitDuration || 120000);
  automationState.keepTabsOpen = Boolean(settings.automation.keepTabsOpen);
  automationState.makeTabsVisible = Boolean(settings.automation.makeTabsVisible);

  await updateAutomationSettings({ status: 'running', progress: automationState.queue });
  appendLog(`Starting automation for ${eventList.length} event(s).`);
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

async function refreshAutomationConfig() {
  const settings = await getSettings();
  automationState.maxConcurrent = Math.max(1, settings.automation.maxConcurrent || 1);
  automationState.visitDuration = Math.max(120000, settings.automation.visitDuration || 120000);
  automationState.keepTabsOpen = Boolean(settings.automation.keepTabsOpen);
  automationState.makeTabsVisible = Boolean(settings.automation.makeTabsVisible);
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
      nextJob.status = 'failed';
      nextJob.result = error?.message || 'Failed to open tab';
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
  appendLog(`Timeout reached for tab ${tabId}. Closing.`);
  const { job } = automationState.activeTabs.get(tabId) || {};
  if (job) {
    job.status = 'timeout';
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
  appendLog(`Automation queue finished: ${completedCount} completed, ${failedCount} failed.`);
  return true;
}

async function handleAutomationCompletion(tabId, message) {
  if (!automationState.activeTabs.has(tabId)) {
    appendLog(`Received completion from unknown tab ${tabId}.`);
    return;
  }
  const entry = automationState.activeTabs.get(tabId);
  chrome.alarms.clear(TIMEOUT_ALARM_PREFIX + tabId);
  const { job } = entry;
  
  if (message.success) {
    job.status = 'completed';
    job.result = message.detail || '';
    appendLog(`Tab ${tabId} completed: ${job.result || ''}`.trim());
  } else {
    const maxRetries = 3;
    if (job.attempts < maxRetries) {
      job.status = 'pending';
      job.result = `Retry ${job.attempts}/${maxRetries}: ${message.detail || 'autofill failed'}`;
      appendLog(`Tab ${tabId} failed, will retry (attempt ${job.attempts}/${maxRetries}): ${message.detail || ''}`.trim());
    } else {
      job.status = 'failed';
      job.result = `Failed after ${maxRetries} attempts: ${message.detail || ''}`;
      appendLog(`Tab ${tabId} failed permanently after ${maxRetries} attempts: ${message.detail || ''}`.trim());
    }
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

function createTab(url) {
  return new Promise((resolve, reject) => {
    const active = automationState.makeTabsVisible;
    chrome.tabs.create({ url, active }, (tab) => {
      if (chrome.runtime.lastError) {
        appendLog(`Failed to open ${url}: ${chrome.runtime.lastError.message}`);
        reject(chrome.runtime.lastError);
      } else {
        resolve(tab);
      }
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
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
