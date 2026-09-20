(() => {
  let settings = null;
  let fillTracker = null;
  let flowStarted = false;
  let automationReported = false;
  let phase = "booting";

  const QUESTION_GROUP_SELECTOR = "[data-testid='question'], [class*='QuestionnaireForm_question__'], fieldset, label";
  const MAX_WAIT = 90000;
  const POLL_MS = 250;

  function createTracker() {
    return {
      rsvpChoice: false,
      rsvpAttendee: false,
      questionsFilled: 0,
      questionsSkipped: 0,
      questionsFailed: 0,
      missingRequired: [],
      dropdownsFailed: [],
      details: []
    };
  }

  async function init() {
    if (flowStarted) return;
    flowStarted = true;
    fillTracker = createTracker();

    settings = await fetchSettings();
    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }

    observeDom();

    const delay = Math.max(0, Number(settings?.rsvp?.rsvpOpenDelay ?? 6000));
    phase = "waiting_for_auth";
    fillTracker.details.push("Waiting " + delay + "ms for Partiful authentication/session to settle.");

    setTimeout(() => {
      runFlow().catch((error) => {
        console.error("[Partiful RSVPs] Flow error", error);
        fail("Automation error: " + (error?.message || String(error)));
      });
    }, delay);
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      if (phase === "waiting_for_auth" || phase === "waiting_for_rsvp" || phase === "waiting_for_modal" ||
          phase === "waiting_for_continue" || phase === "waiting_for_questionnaire" ||
          phase === "waiting_for_verification" || phase === "filling_questionnaire") {
        pump();
      }
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  let pumpScheduled = false;
  function pump() {
    if (pumpScheduled) return;
    pumpScheduled = true;
    setTimeout(() => {
      pumpScheduled = false;
      // Intentionally lightweight; the main flow performs deterministic waits.
    }, 25);
  }

  async function runFlow() {
    if (!settings) return;

    phase = "waiting_for_rsvp";
    const rsvpButton = await waitFor(findRsvpButton, MAX_WAIT);
    if (!rsvpButton) {
      fail("Could not find the RSVP button after waiting for authentication.");
      return;
    }

    phase = "clicking_rsvp";
    fillTracker.details.push("Clicking RSVP after authentication delay.");
    safeClick(rsvpButton);

    phase = "waiting_for_modal";
    const modal = await waitFor(findRsvpModal, 30000);
    if (!modal) {
      if (isVerificationStep()) {
        await waitFor(() => !isVerificationStep(), MAX_WAIT);
      }
      const completed = await waitFor(isRegistrationComplete, 5000);
      if (completed) {
        complete("Registration completed after RSVP.");
      } else {
        fail("RSVP was clicked but the RSVP dialog did not appear.");
      }
      return;
    }

    await handleRsvpStep(modal);
  }

  async function handleRsvpStep(modal) {
    phase = "rsvp_step";
    const choiceLabel = settings.rsvp.choice === "cant_go" ? "Can't Go" : "Going";
    await waitFor(() => findRsvpForm(modal), 15000);

    const choiceButton = await waitFor(() => findElementByText(
      modal,
      ['button', '[role="button"]'],
      choiceLabel
    ), 2000);

    if (choiceButton) {
      safeClick(choiceButton);
      fillTracker.rsvpChoice = true;
      fillTracker.details.push("Selected RSVP choice: " + choiceLabel);
    }

    if (settings.rsvp.attendeeLabel) {
      const attendeeButton = findElementByText(modal, ['button', '[role="button"]'], settings.rsvp.attendeeLabel);
      if (attendeeButton && !attendeeButton.disabled) {
        safeClick(attendeeButton);
        fillTracker.rsvpAttendee = true;
        fillTracker.details.push("Selected attendee count: " + settings.rsvp.attendeeLabel);
      }
    }

    const nameInput = modal.querySelector("input[name='name']");
    if (nameInput && !nameInput.value.trim() && getProfileNames().full) {
      setInputValue(nameInput, getProfileNames().full);
      fillTracker.details.push("Filled display name.");
    }

    if (settings.rsvp.includeComment && settings.profile?.rsvpComment) {
      const commentInput = modal.querySelector("textarea[name='message'], textarea");
      if (commentInput) {
        setInputValue(commentInput, settings.profile.rsvpComment);
      }
    }

    const autoFlow = settings.automation?.status === "running" || settings.rsvp?.autoSubmit !== false;
    if (!autoFlow) {
      notifyAutomation("RSVP step prepared for review.", false, false);
      return;
    }

    phase = "waiting_for_continue";
    const continueButton = await waitFor(() => findContinueButton(modal), 30000);

    if (!continueButton) {
      fail("Could not find an enabled Continue button on the RSVP step.");
      return;
    }

    const delay = Math.max(0, Number(settings.rsvp.submitDelay ?? 1000));
    if (delay) await sleep(delay);

    safeClick(continueButton);
    fillTracker.details.push("Clicked Continue on RSVP step.");

    phase = "waiting_for_questionnaire";

    const nextResult = await waitFor(() => {
      if (isVerificationStep()) return { verification: true };
      const form = findQuestionnaire();
      if (form) return { form };
      if (isRegistrationComplete()) return { complete: true };
      return null;
    }, MAX_WAIT);

    if (!nextResult) {
      fail("Continue was clicked, but the questionnaire did not load.");
      return;
    }

    if (nextResult.verification) {
      phase = "waiting_for_verification";
      fillTracker.details.push("Verification step detected. Complete verification in the open tab.");
      const afterVerification = await waitFor(() => {
        if (isVerificationStep()) return null;
        const form = findQuestionnaire();
        if (form) return { form };
        if (isRegistrationComplete()) return { complete: true };
        return null;
      }, MAX_WAIT);

      if (!afterVerification) {
        fail("Verification was not completed before the automation timeout.");
        return;
      }
      if (afterVerification.complete) {
        complete("Registration completed after verification.");
        return;
      }
      await fillQuestionnaire(afterVerification.form);
      return;
    }

    if (nextResult.complete) {
      complete("Registration completed; no custom questionnaire was shown.");
      return;
    }

    await fillQuestionnaire(nextResult.form);
  }

  async function fillQuestionnaire(form) {
    phase = "filling_questionnaire";

    const groups = getQuestionGroups(form);
    if (!groups.length) {
      fail("Questionnaire loaded but no form fields could be detected.");
      return;
    }

    fillTracker.details.push("Detected " + groups.length + " questionnaire field(s).");

    for (const group of groups) {
      const label = extractLabel(group);
      if (!label) {
        fillTracker.questionsSkipped++;
        continue;
      }

      const controls = getControls(group, form);
      if (!controls.length) {
        fillTracker.questionsSkipped++;
        fillTracker.details.push('Skipped "' + label + '" — no control found.');
        continue;
      }

      const response = resolveResponse(label, controls[0]);
      if (!response || response.value === "") {
        fillTracker.questionsSkipped++;
        continue;
      }

      const ok = await applyResponse(group, controls, response);
      if (ok) {
        fillTracker.questionsFilled++;
        fillTracker.details.push('Filled "' + label + '".');
      } else {
        fillTracker.questionsFailed++;
        fillTracker.details.push('Failed to fill "' + label + '".');
      }
    }

    await sleep(300);

    const missing = collectMissingRequired(form);
    if (missing.length) {
      fillTracker.missingRequired = missing;
      fail("Required questions still need answers: " + missing.join(" | "));
      return;
    }

    const submitButton = findQuestionnaireSubmit(form);
    if (!submitButton) {
      fail("All detected fields are filled, but the questionnaire submit button was not found.");
      return;
    }

    await sleep(Math.max(0, Number(settings.rsvp.submitDelay ?? 1000)));
    if (submitButton.disabled) {
      fail("Questionnaire submit button is disabled after filling the form.");
      return;
    }

    safeClick(submitButton);
    fillTracker.details.push("Submitted questionnaire.");

    const completed = await waitFor(() => {
      if (isRegistrationComplete()) return true;
      return !findQuestionnaire();
    }, 15000);

    if (completed) {
      complete("Registration completed successfully.");
    } else {
      fail("The questionnaire was submitted, but completion could not be confirmed.");
    }
  }

  function getQuestionGroups(form) {
    const selectors = [
      "[data-testid='question']",
      "[class*='QuestionnaireForm_question__']",
      "fieldset"
    ];

    const groups = [];
    const seen = new Set();

    for (const selector of selectors) {
      for (const node of form.querySelectorAll(selector)) {
        if (!node.offsetParent && !node.querySelector("input,textarea,select,[role='combobox']")) continue;
        const key = node;
        if (!seen.has(key)) {
          seen.add(key);
          groups.push(node);
        }
      }
    }

    const controls = form.querySelectorAll("input:not([type='hidden']), textarea, select, [role='combobox'], button[aria-haspopup='listbox'], button[data-testid*='select' i]");
    for (const control of controls) {
      const group = findQuestionGroup(control, form);
      if (group && !seen.has(group)) {
        seen.add(group);
        groups.push(group);
      }
    }

    return groups;
  }

  // Partiful's hashed class names change between deploys, so never rely on them alone:
  // fall back to the nearest ancestor that carries some text (the question label).
  function findQuestionGroup(control, form) {
    const known = control.closest(QUESTION_GROUP_SELECTOR);
    if (known && known !== form) return known;

    let node = control.parentElement;
    while (node && node !== form) {
      if (cleanLabel(node.textContent)) return node;
      node = node.parentElement;
    }
    return control.parentElement;
  }

  function getControls(group, form) {
    const own = [...group.querySelectorAll("input:not([type='hidden']), textarea, select, [role='combobox'], button[aria-haspopup='listbox'], button[data-testid*='select' i]")];
    if (own.length) return own;

    if (group.matches("input,textarea,select,[role='combobox'],button[aria-haspopup='listbox'],button[data-testid*='select' i]")) return [group];

    return [];
  }

  function extractLabel(group) {
    const control = group.matches("input,textarea,select,[role='combobox'],button[aria-haspopup='listbox'],button[data-testid*='select' i]")
      ? group
      : group.querySelector("input:not([type='hidden']), textarea, select, [role='combobox']");

    if (!control) return "";

    const labelledBy = control.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ");
      if (text.trim()) return cleanLabel(text);
    }

    const explicitLabel = control.id
      ? document.querySelector('label[for="' + CSS.escape(control.id) + '"]')
      : null;
    if (explicitLabel) return cleanLabel(explicitLabel.textContent);

    const wrappingLabel = control.closest("label");
    if (wrappingLabel) return cleanLabel(wrappingLabel.textContent);

    const labelNode = group.querySelector("label, legend");
    if (labelNode) return cleanLabel(labelNode.textContent);

    const dataQuestion = group.querySelector("[data-question], [aria-label]");
    if (dataQuestion && dataQuestion !== control) {
      return cleanLabel(
        dataQuestion.getAttribute("data-question") ||
        dataQuestion.getAttribute("aria-label") ||
        dataQuestion.textContent
      );
    }

    const labelText = findLabelTextNode(group, control);
    if (labelText) return cleanLabel(labelText.textContent);

    return cleanLabel(
      control.getAttribute("aria-label") ||
      control.getAttribute("placeholder") ||
      ""
    );
  }

  // First text-bearing element in the group that is not a wrapper around the control itself.
  function findLabelTextNode(group, control) {
    return [...group.querySelectorAll("label, legend, span, p, div")].find((node) => {
      if (node.contains(control)) return false;
      const text = cleanLabel(node.textContent);
      return text && text.length <= 500;
    }) || null;
  }

  // Partiful inputs have no `required` attribute; the only marker is the " *" after the label.
  function isRequiredControl(control, group) {
    if (control.required || control.getAttribute("aria-required") === "true") return true;
    if (control.closest("[data-required='true']")) return true;
    const labelNode = group && findLabelTextNode(group, control);
    return Boolean(labelNode && /\*\s*$/.test(labelNode.textContent || ""));
  }

  function cleanLabel(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s*\*+\s*$/g, "")
      .trim();
  }

  function normalize(value) {
    return cleanLabel(value)
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9+@.\- ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveResponse(label, control) {
    const normalized = normalize(label);

    const custom = findCustomRule(label, normalized);
    if (custom) return custom;

    const dropdown = findDropdownRule(label, normalized);
    if (dropdown) return dropdown;

    const profile = mapProfileValue(normalized);
    if (profile !== "") return { type: "text", value: profile };

    if (control.matches("input[type='email']") && settings.profile.email) {
      return { type: "text", value: settings.profile.email };
    }

    return null;
  }

  function findCustomRule(label, normalized) {
    for (const rule of settings.questions || []) {
      if (!rule?.pattern || !rule.value) continue;

      const pattern = normalize(rule.pattern);
      let matched = false;

      if (rule.matchType === "exact") {
        matched = normalized === pattern;
      } else if (rule.matchType === "contains") {
        matched = normalized.includes(pattern) || pattern.includes(normalized);
      } else if (rule.matchType === "regex") {
        try {
          matched = new RegExp(rule.pattern, "i").test(label);
        } catch {
          matched = false;
        }
      }

      if (matched) {
        return {
          type: rule.answerType === "dropdown" ? "dropdown" : "text",
          value: String(rule.value),
          fallbacks: []
        };
      }
    }
    return null;
  }

  function findDropdownRule(label, normalized) {
    for (const rule of settings.dropdowns || []) {
      const matchers = rule.matchers || [];
      const matched = matchers.some((matcher) => {
        const m = normalize(matcher);
        return m && (normalized.includes(m) || m.includes(normalized));
      });

      if (matched && rule.preferred) {
        return {
          type: "dropdown",
          value: String(rule.preferred),
          fallbacks: rule.fallbacks || []
        };
      }
    }
    return null;
  }

  function mapProfileValue(label) {
    if (label.includes("email")) return settings.profile.email || "";
    if (label.includes("linkedin")) return settings.profile.linkedin || "";
    if (label.includes("company") || label.includes("organization")) return settings.profile.company || "";
    if (
      label.includes("job title") ||
      label === "title" ||
      label.includes("your title") ||
      label.includes("role title")
    ) return settings.profile.title || settings.profile.jobTitle || "";
    const names = getProfileNames();
    if (label.includes("first name") || label.includes("given name")) return names.first;
    if (label.includes("last name") || label.includes("surname") || label.includes("family name")) return names.last;
    if (label.includes("full name") || label === "name" || label.includes("your name") || label.endsWith(" name")) {
      return names.full;
    }
    if (label.includes("industry")) return settings.profile.industry || "";
    if (label.includes("describe your startup") || label.includes("startup description")) return settings.profile.startupBlurb || "";
    if (label.includes("achievement")) return settings.profile.achievement || "";
    if (label.includes("looking for") || label.includes("what are you looking")) return settings.profile.ask || "";
    if (label.includes("comment")) return settings.profile.rsvpComment || "";
    return "";
  }

  // Explicit first/last name win; otherwise derive them from the full name (and vice versa).
  function getProfileNames() {
    const profile = settings?.profile || {};
    const full = String(profile.fullName || "").trim();
    const parts = full.split(/\s+/).filter(Boolean);
    const first = String(profile.firstName || "").trim() || parts[0] || "";
    const last = String(profile.lastName || "").trim() || parts.slice(1).join(" ");
    return { first, last, full: full || [first, last].filter(Boolean).join(" ") };
  }

  async function applyResponse(group, controls, response) {
    if (response.type === "text") {
      const input = controls.find((c) => c.matches("input:not([type='checkbox']):not([type='radio']), textarea"));
      if (!input) return false;
      setInputValue(input, response.value);
      return inputValueMatches(input, response.value);
    }

    const select = controls.find((c) => c.matches("select"));
    if (select) {
      return selectOption(select, response.value, response.fallbacks || []);
    }

    const trigger = controls.find((c) => c.matches("[role='combobox'], button, [aria-haspopup='listbox']"));
    if (!trigger) return false;

    return await selectCustomDropdown(trigger, response.value, response.fallbacks || []);
  }

  function setInputValue(input, value) {
    const stringValue = String(value);
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(input, stringValue);
    } else {
      input.value = stringValue;
    }

    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  function inputValueMatches(input, expected) {
    return String(input.value || "").trim() === String(expected || "").trim();
  }

  function selectOption(select, preferred, fallbacks) {
    const candidates = [preferred, ...(fallbacks || [])].filter(Boolean);
    const option = [...select.options].find((o) =>
      candidates.some((candidate) => {
        const a = normalize(o.textContent);
        const b = normalize(candidate);
        return a === b || a.includes(b) || b.includes(a);
      })
    );

    if (!option) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(select, option.value);
    else select.value = option.value;

    select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return select.value === option.value;
  }

  async function selectCustomDropdown(trigger, preferred, fallbacks) {
    safeClick(trigger);
    const candidates = [preferred, ...(fallbacks || [])].filter(Boolean);
    const option = await waitFor(() => findDropdownOption(candidates), 5000);
    if (!option) {
      fillTracker.dropdownsFailed.push(preferred);
      return false;
    }

    safeClick(option);
    return true;
  }

  function findDropdownOption(candidates) {
    const nodes = document.querySelectorAll(
      "[role='listbox'] [role='option'], [role='listbox'] button, [data-radix-popper-content-wrapper] [role='option'], [data-radix-popper-content-wrapper] button, ul[role='listbox'] li"
    );

    for (const candidate of candidates) {
      const c = normalize(candidate);
      const exact = [...nodes].find((node) => normalize(node.textContent) === c && isElementVisible(node));
      if (exact) return exact;
      const partial = [...nodes].find((node) => normalize(node.textContent).includes(c) && isElementVisible(node));
      if (partial) return partial;
    }
    return null;
  }

  function collectMissingRequired(form) {
    const missing = [];
    const controls = [...form.querySelectorAll("input:not([type='hidden']), textarea, select, [role='combobox'], button[aria-haspopup='listbox'], button[data-testid*='select' i]")];
    const radioGroups = new Set();

    for (const control of controls) {
      const questionGroup = findQuestionGroup(control, form);
      if (!isRequiredControl(control, questionGroup)) continue;

      if (control.matches("input[type='radio']")) {
        const name = control.name || "radio";
        if (radioGroups.has(name)) continue;
        radioGroups.add(name);
        const group = controls.filter((c) => c.matches("input[type='radio']") && (c.name || "radio") === name);
        if (!group.some((c) => c.checked)) {
          missing.push(extractLabel(control.parentElement || control));
        }
        continue;
      }

      if (control.matches("input[type='checkbox']")) {
        if (!control.checked) missing.push(extractLabel(control.parentElement || control));
        continue;
      }

      const value = control.matches("select")
        ? control.value
        : String(control.value || "");

      if (!value.trim()) {
        missing.push(extractLabel(questionGroup || control));
      }
    }

    return [...new Set(missing.filter(Boolean))];
  }

  function findQuestionnaire() {
    return document.querySelector("form[name='questionnaire']") ||
      document.querySelector("form[data-testid*='questionnaire' i]") ||
      document.querySelector("[class*='QuestionnaireForm_question__']")?.closest("form") ||
      null;
  }

  function findQuestionnaireSubmit(form) {
    const linked = form.id && [...document.querySelectorAll("button[form='" + form.id + "']")]
      .find((button) => isElementVisible(button) && !button.disabled);
    if (linked) return linked;

    const scope = form.closest("[role='dialog']") || form;
    const buttons = scope.querySelectorAll(
      "button[type='submit'], button"
    );
    return [...buttons].reverse().find((button) => {
      const text = normalize(button.textContent || "");
      return isElementVisible(button) &&
        !button.disabled &&
        (button.type === "submit" || /^(submit|register|finish|continue|rsvp|done|join|confirm)/.test(text));
    }) || null;
  }

  function findContinueButton(modal) {
    const usable = (button) => isElementVisible(button) && !button.disabled;
    const form = findRsvpForm(modal);
    const submit = form && [...form.querySelectorAll("button[type='submit']")].find(usable);
    if (submit) return submit;

    const buttons = [...modal.querySelectorAll("button, [role='button']")];
    return buttons.find((button) => {
      const text = normalize(button.textContent || "");
      return text === "continue" && usable(button);
    }) || null;
  }

  function findRsvpForm(modal) {
    return modal?.querySelector("form[name='rsvpForm']") ||
      document.querySelector("form[name='rsvpForm']") ||
      null;
  }

  function findRsvpModal() {
    const known = document.querySelector("#guest-rsvp-dialog");
    if (known && isElementVisible(known)) return known;

    const dialogs = [...document.querySelectorAll("[role='dialog']")];
    return dialogs.find((dialog) => {
      const text = normalize(dialog.textContent);
      return isElementVisible(dialog) && (text.includes("going") || text.includes("can't go"));
    }) || null;
  }

  function findRsvpButton() {
    const candidates = [...document.querySelectorAll("button, [role='button'], a")];
    const exact = candidates.find((el) => {
      const text = normalize(el.textContent || el.getAttribute("aria-label") || "");
      return isElementVisible(el) &&
        ["rsvp", "respond", "join", "get on the list", "rsvp for access", "join the waitlist", "join waitlist"].includes(text);
    });
    if (exact) return exact;

    // Invite-style events show Going / Maybe / Can't Go directly on the page.
    const choice = settings?.rsvp?.choice === "cant_go" ? ["can't go", "cant go"].map(normalize) : ["going", "i'm going"].map(normalize);
    const direct = candidates.find((el) => {
      const text = normalize(el.textContent || el.getAttribute("aria-label") || "");
      return isElementVisible(el) && choice.includes(text);
    });
    if (direct) return direct;

    const partial = candidates.find((el) => {
      const text = normalize(el.textContent || el.getAttribute("aria-label") || "");
      return isElementVisible(el) && text.includes("rsvp");
    });
    return partial || null;
  }

  function findElementByText(root, selectors, targetText) {
    if (!root || !targetText) return null;
    const target = normalize(targetText);
    const elements = selectors.flatMap((selector) => [...root.querySelectorAll(selector)]);
    const exact = elements.find((el) => isElementVisible(el) && normalize(el.textContent) === target);
    if (exact) return exact;
    return elements.find((el) => isElementVisible(el) && normalize(el.textContent).includes(target)) || null;
  }

  function isVerificationStep() {
    const text = normalize(document.body?.innerText || "");
    const phrases = [
      "verification code",
      "verify your phone",
      "enter the code",
      "code we sent",
      "confirm your phone",
      "check your phone"
    ];
    const phraseMatch = phrases.some((phrase) => text.includes(phrase));
    const codeInputs = [...document.querySelectorAll("input")].filter((input) => {
      const type = String(input.type || "").toLowerCase();
      const autocomplete = String(input.autocomplete || "").toLowerCase();
      return isElementVisible(input) &&
        (type === "tel" || type === "number" || autocomplete.includes("one-time-code"));
    });
    return phraseMatch && codeInputs.length > 0;
  }

  function isRegistrationComplete() {
    const text = normalize(document.body?.innerText || "");
    return [
      "you're going",
      "youre going",
      "you're on the list",
      "youre on the list",
      "registration complete",
      "rsvp confirmed",
      "you're confirmed",
      "youre confirmed",
      "see you there"
    ].some((phrase) => text.includes(phrase));
  }

  function waitFor(factory, timeout) {
    const deadline = Date.now() + timeout;
    return new Promise((resolve) => {
      const tick = () => {
        let value = null;
        try {
          value = factory();
        } catch (error) {
          console.warn("[Partiful RSVPs] waitFor check failed", error);
        }

        if (value) {
          resolve(value);
          return;
        }

        if (Date.now() >= deadline) {
          resolve(null);
          return;
        }

        setTimeout(tick, POLL_MS);
      };
      tick();
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function safeClick(element) {
    if (!element || !isElementVisible(element) || element.disabled) return false;
    element.scrollIntoView({ block: "center", behavior: "instant" });
    element.click();
    return true;
  }

  function isElementVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 &&
      rect.height > 0 &&
      getComputedStyle(element).visibility !== "hidden" &&
      getComputedStyle(element).display !== "none";
  }

  function notifyAutomation(detail, success, closeTab) {
    if (automationReported) return;
    if (!settings?.automation || settings.automation.status !== "running") return;

    automationReported = true;

    const summary = [
      detail,
      "Filled: " + fillTracker.questionsFilled,
      "Skipped: " + fillTracker.questionsSkipped,
      fillTracker.questionsFailed ? "Failed: " + fillTracker.questionsFailed : null,
      fillTracker.missingRequired.length ? "Missing: " + fillTracker.missingRequired.join(", ") : null,
      fillTracker.dropdownsFailed.length ? "Dropdowns not found: " + fillTracker.dropdownsFailed.join(", ") : null
    ].filter(Boolean).join(" | ");

    chrome.runtime.sendMessage({
      type: "automation:itemComplete",
      success: Boolean(success),
      detail: summary,
      debugDetails: fillTracker.details,
      closeTab: closeTab !== false
    }, () => void chrome.runtime.lastError);
  }

  function complete(detail) {
    phase = "completed";
    notifyAutomation(detail, true, true);
  }

  function fail(detail) {
    phase = "failed";
    fillTracker.details.push(detail);
    notifyAutomation(detail, false, false);
  }

  async function fetchSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "settings:get" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(createEmptySettings());
          return;
        }
        resolve(response?.settings || createEmptySettings());
      });
    });
  }

  function createEmptySettings() {
    return {
      profile: {
        email: "",
        firstName: "",
        lastName: "",
        fullName: "",
        linkedin: "",
        company: "",
        title: "",
        industry: "",
        startupBlurb: "",
        achievement: "",
        ask: "",
        rsvpComment: ""
      },
      dropdowns: [],
      questions: [],
      rsvp: {
        choice: "going",
        attendeeLabel: "1 attendee",
        rsvpOpenDelay: 6000,
        autoSubmit: true,
        submitDelay: 1000,
        includeComment: false
      },
      automation: {
        status: "idle"
      }
    };
  }

  init();
})();