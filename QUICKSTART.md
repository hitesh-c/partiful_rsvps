# 🚀 Quick Start Guide - 3 Steps

## Step 1: Install Extension (2 minutes)

### Open Chrome Extensions
```
Type in address bar: chrome://extensions/
```
Or: Menu (⋮) → Extensions → Manage Extensions

### Enable Developer Mode
Look for toggle in **top-right corner** → Turn **ON** (blue)

### Load Extension
1. Click **"Load unpacked"** button
2. Navigate to: `/Users/Toto/Projects/partiful/extension`
3. Click **"Select"**

✅ You should see "Partiful RSVPs" appear in your extensions list!

---

## Step 2: Configure Settings (5 minutes)

### Open Settings
- Right-click extension → **Options**
- Or: `chrome://extensions/` → Partiful RSVPs → **Extension options**

### Fill Required Fields

#### Profile Basics (Required)
```
✅ Email: your@email.com
✅ Full name: John Doe
✅ LinkedIn: https://linkedin.com/in/yourprofile
✅ Company: Your Startup Inc.
✅ Industry: SaaS / Tech / Fintech
```

Click **"Save profile"**

#### Dropdown Preferences (Important)
Find the 9 default rules and fill your preferred options:

**Job title:**
- Preferred: `Founder` (or CEO, Engineer, etc.)
- Fallbacks: `Co-founder, CEO`

**Stage:**
- Preferred: `Seed` (or Pre-seed, Series A, etc.)

**Fundraising:**
- Preferred: `$500K-$1M` (match dropdown options exactly)

**Volunteer interest:**
- Preferred: `Yes` (or No, Maybe)

**Follow on LinkedIn:**
- Preferred: `Yes`

> 💡 **Tip:** Leave empty if you don't have a preference. The extension will skip those questions.

#### RSVP Defaults
```
✅ RSVP choice: Going
✅ Attendee count: 1 attendee
☑️  Auto-click Continue: ON (required for bulk runs!)
✅ Submit delay: 1000
☑️  Include comment: ON (optional)
```

Click **"Save RSVP defaults"**

---

## Step 3: Run Bulk RSVP (1 minute)

### Prepare Event URLs
Copy your Partiful event links:
```
https://partiful.com/e/abc123
https://partiful.com/e/def456
https://partiful.com/e/ghi789
```

### Start the Bulk Run
1. Scroll to **Bulk RSVP Queue** section
2. Paste URLs in textarea (one per line)
3. Settings:
   - Max concurrent tabs: `1`
   - Stay duration: `5000`
4. Click **"(settings save as you type)"**
5. Click **"Start queue"**

### Watch the Magic! ✨
```
12:30:45 • Starting bulk RSVP for 3 event(s)
12:30:46 • Opened tab 123 for event 1
12:30:51 • Tab 123 completed: Filled 8 questions | Skipped 2
12:30:52 • Opened tab 124 for event 2
12:30:57 • Tab 124 completed: Filled 6 questions | Skipped 1
12:30:58 • Opened tab 125 for event 3
12:31:03 • Tab 125 completed: Filled 7 questions | Skipped 0
12:31:04 • Bulk RSVP finished: 3 completed, 0 failed
```

---

## What You'll See

### Successful Autofill
✅ `"Completed: Questionnaire submitted | Filled: 8 questions | Skipped: 2"`

**Means:**
- RSVP selected and submitted
- 8 questions answered
- 2 questions skipped (no matching data)

### Retry on Failure
⚠️ `"Retry 2/3: Filled: 3 questions | Missing dropdowns: Stage"`

**Means:**
- Some fields failed
- Extension will retry on its own
- Check your "Stage" dropdown preference

### Permanent Failure
❌ `"Failed after 3 attempts: RSVP button not found"`

**Means:**
- Event has unusual layout
- Manual RSVP needed

---

## Common First-Time Issues

### ❌ "Fields not being filled"
**Fix:** Check spelling in dropdown preferences matches EXACTLY with event options
- Wrong: `Founder/CEO`
- Right: `Founder` (use fallbacks for alternatives)

### ❌ "Questions skipped - no matching data"
**Fix:** Either:
1. Fill profile field (email, name, company, etc.)
2. Or create custom question rule for that specific question

### ❌ "Queue not starting"
**Fix:** Make sure "Auto-click Continue" is **ON** in RSVP settings

---

## Test With One Event First!

Before running 50 events:
1. Add just **1 event URL**
2. Click "Start queue"
3. Watch the log to see what gets filled/skipped
4. Adjust your settings based on results
5. Then run the full batch!

---

## You're Ready! 🎉

Your extension will now:
- ✅ Open each event for you
- ✅ Fill RSVP (Going + attendee count)
- ✅ Answer questionnaire based on your profile
- ✅ Match dropdown options intelligently
- ✅ Auto-submit (if enabled)
- ✅ Retry failures up to 3 times
- ✅ Log detailed results

**Time saved:** ~2-3 minutes per event!

---

## Next Steps

### View Detailed Logs
All actions are logged:
- What was filled
- What was skipped
- Why it was skipped
- Dropdown matching results

### Fine-tune Settings
After first run:
- Add more dropdown preferences for commonly skipped questions
- Create custom question rules for specific prompts
- Adjust timing if pages load slowly

### Handle Failures
Review failed events:
- Check queue log for reason
- Update settings if needed
- Re-run just those URLs

---

## Need Help?

See full documentation:
- [INSTALLATION.md](INSTALLATION.md) - Complete setup guide
- [README.md](README.md) - Feature overview

**Check queue logs first** - they tell you exactly what happened!
