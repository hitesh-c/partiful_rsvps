(() => {
  const STORAGE_KEY = "twoPass";

  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[\s*?]+/g, " ")
      .replace(/[^a-z0-9+@.\- ]/g, "")
      .trim();

  function baselineKey(label) {
    const text = normalize(label);
    if (text.includes("email")) return "email";
    if (text.includes("linkedin")) return "linkedin";
    if (text.includes("company") || text.includes("organization")) return "company";
    if (
      text.includes("job title") ||
      text === "title" ||
      text.includes("your title") ||
      text.includes("role / title") ||
      text.includes("role title")
    ) return "title";
    return null;
  }

  function labelForControl(control) {
    if (!control) return "";
    const labelledBy = control.getAttribute("aria-labelledby");
    if (labelledBy) {
      return labelledBy.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
    }
    const parent = control.closest("label, [data-testid='question'], [class*='QuestionnaireForm_question__']");
    const label = parent?.querySelector("label, span, p, legend");
    if (label && label !== control) return label.textContent.trim();
    return control.getAttribute("aria-label") || control.getAttribute("placeholder") || "";
  }

  function extractQuestions() {
    const form =
      document.querySelector("form[name='questionnaire']") ||
      document.querySelector("form");
    if (!form) return [];

    const controls = [...form.querySelectorAll("input, textarea, select, [role='combobox']")];
    const seen = new Set();
    const questions = [];

    for (const control of controls) {
      if (!control.offsetParent && control.type !== "hidden") continue;
      if (["submit", "button", "hidden"].includes(String(control.type).toLowerCase())) continue;

      const label = labelForControl(control);
      if (!label) continue;

      const key = normalize(label) + "::" + (control.name || control.type || control.tagName);
      if (seen.has(key)) continue;
      seen.add(key);

      const parent = control.closest("[data-testid='question'], [class*='QuestionnaireForm_question__'], label");
      const options = control.matches("select")
        ? [...control.options].map((o) => o.textContent.trim()).filter(Boolean)
        : [...(parent?.querySelectorAll("[role='option'], li") || [])]
            .map((o) => o.textContent.trim()).filter(Boolean);

      questions.push({
        label,
        normalized: normalize(label),
        type: control.matches("textarea") ? "textarea" :
          control.matches("select, [role='combobox']") ? "dropdown" :
          control.getAttribute("type") || "text",
        required: control.hasAttribute("required") || /\*/.test(label),
        options
      });
    }

    return questions;
  }

  function classify(questions) {
    const customQuestions = questions.filter((q) => !baselineKey(q.label));
    return {
      kind: customQuestions.length ? "custom" : "baseline",
      questions,
      customQuestions
    };
  }

  async function loadState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || { events: {}, masterQuestions: {} };
  }

  async function saveState(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }

  async function scanCurrentEvent() {
    const questions = extractQuestions();
    const url = location.href.split("?")[0];

    if (!questions.length) {
      return { status: "no-questionnaire", questions: [] };
    }

    const result = classify(questions);
    const state = await loadState();

    state.events[url] = {
      url,
      scannedAt: Date.now(),
      kind: result.kind,
      questions: result.questions,
      customQuestions: result.customQuestions
    };

    for (const q of result.customQuestions) {
      const existing = state.masterQuestions[q.normalized];
      if (!existing) {
        state.masterQuestions[q.normalized] = {
          id: q.normalized,
          label: q.label,
          type: q.type,
          options: q.options,
          answer: "",
          aliases: [q.normalized]
        };
      } else {
        existing.aliases = [...new Set([...(existing.aliases || []), q.normalized])];
        existing.options = [...new Set([...(existing.options || []), ...(q.options || [])])];
      }
    }

    await saveState(state);

    chrome.runtime.sendMessage({
      type: "twoPass:scanResult",
      result: state.events[url],
      totals: {
        baseline: Object.values(state.events).filter((e) => e.kind === "baseline").length,
        custom: Object.values(state.events).filter((e) => e.kind === "custom").length
      }
    });

    return state.events[url];
  }

  function answerForQuestion(question, settings, state) {
    const profile = settings?.profile || {};
    const key = baselineKey(question.label);

    if (key === "email") return profile.email || "";
    if (key === "linkedin") return profile.linkedin || "";
    if (key === "company") return profile.company || "";
    if (key === "title") return profile.title || profile.jobTitle || "";

    const master = state.masterQuestions[question.normalized];
    if (master?.answer) return master.answer;

    for (const item of Object.values(state.masterQuestions)) {
      if ((item.aliases || []).includes(question.normalized) && item.answer) return item.answer;
    }

    return null;
  }

  window.__partifulTwoPass = {
    scanCurrentEvent,
    extractQuestions,
    classify,
    loadState,
    saveState,
    answerForQuestion,
    normalize
  };
})();