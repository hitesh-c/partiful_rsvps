# How to Install Partiful RSVPs in Chrome

## Quick Installation Steps

### 1. Open Chrome Extensions Page
- Open Chrome browser
- Go to: `chrome://extensions/`
- Or click: **Menu (⋮)** → **Extensions** → **Manage Extensions**

### 2. Enable Developer Mode
- Look for **"Developer mode"** toggle in the top-right corner
- Turn it **ON** (it should turn blue)

### 3. Load the Extension
- Click the **"Load unpacked"** button (appears after enabling Developer mode)
- Navigate to this folder: `/Users/Toto/Projects/partiful/extension`
- Click **"Select"** or **"Open"**

### 4. Verify Installation
You should see:
- ✅ **Partiful RSVPs** card appear in your extensions list
- ✅ Version: 1.4.2
- ✅ Status: Enabled (toggle should be ON/blue)

### 5. Pin the Extension (Optional but Recommended)
- Click the **puzzle piece icon** (🧩) in Chrome toolbar
- Find **Partiful RSVPs** in the list
- Click the **pin icon** (📌) next to it
- The extension icon will now appear in your toolbar

---

## Setting Up Your Extension

### Step 1: Open Settings
- Click the **Partiful RSVPs** icon in toolbar
- Or right-click the extension → **Options**
- Or go to `chrome://extensions/` → **Partiful RSVPs** → **Details** → **Extension options**

### Step 2: Fill Profile Information
Fill in the **Profile Basics** section with your information:
- ✅ Email (required)
- ✅ Full name
- ✅ LinkedIn URL
- ✅ Company name
- ✅ Industry
- ✅ Startup description
- ✅ Achievement highlight
- ✅ What are you looking for?
- ✅ RSVP comment (optional)

Click **"Save profile"** when done.

### Step 3: Configure Dropdown Preferences
The extension comes with 9 default dropdown rules:
- Job title
- Stage
- Fundraising / ticket size
- ARR
- Volunteer interest
- Sponsorship interest
- Add host on LinkedIn
- Ticket purchase acknowledgement
- Follow on LinkedIn

**For each rule:**
1. Fill in your **preferred option** (e.g., "Founder" for Job title)
2. Add **fallback options** if needed (comma-separated: "CEO, Co-founder")
3. Click **"Add dropdown rule"** to create custom rules

### Step 4: Add Custom Question Rules (Optional)
For event-specific questions that don't match dropdowns or profile fields:
1. Choose **Match type**: Exact, Contains, or Regex
2. Enter **Pattern** to match question text
3. Select **Answer type**: Text input or Dropdown
4. Enter **Answer value**

Example:
- Pattern: `"nachonacho.com"`
- Match type: Contains
- Answer type: Text
- Value: `"YourUsername"`

### Step 5: Configure RSVP Defaults
Set your preferences:
- **RSVP choice**: Going or Can't Go (default: Going)
- **Attendee count**: e.g., "1 attendee"
- ✅ **Auto-click Continue** (recommended for bulk runs)
- **Submit delay**: 1000ms (wait time before clicking, increase if needed)
- ✅ **Include comment** (if you want to add your saved comment)

Click **"Save RSVP defaults"**.

---

## Using Bulk RSVP

### Step 1: Prepare Event URLs
1. Collect Partiful event URLs (format: `https://partiful.com/e/...`)
2. Copy them to a text file, **one URL per line**

Example:
```
https://partiful.com/e/abc123
https://partiful.com/e/def456
https://partiful.com/e/ghi789
```

### Step 2: Configure Bulk RSVP Settings
In the **Bulk RSVP Queue** section:
1. Paste your event URLs in the textarea (one per line)
2. Set **Max concurrent tabs**: 1-5 (recommended: 1 for stability)
3. Set **Open tab stay duration**: 5000ms (5 seconds default)
4. Click **"(settings save as you type)"**

### Step 3: Start the Bulk Run
1. Click **"Start queue"** button
2. Watch the logs appear in real-time below
3. Extension will:
   - Open each event in a background tab
   - Auto-fill RSVP + questionnaire
   - Auto-submit (if enabled)
   - Close tab and move to next event

### Step 4: Monitor Progress
The queue log shows:
```
12:30:45 • Starting bulk RSVP for 10 event(s).
12:30:46 • Opened tab 123 for https://partiful.com/e/abc123
12:30:51 • Tab 123 completed: Questionnaire submitted | Filled: 8 questions | Skipped: 2
12:30:52 • Opened tab 124 for https://partiful.com/e/def456
...
12:35:20 • Bulk RSVP finished: 9 completed, 1 failed.
```

### Step 5: Control the Bulk Run
- **Pause**: Click "Pause" to stop processing new events (current tabs finish)
- **Clear progress**: Click "Clear progress" to reset queue and logs

---

## Understanding Bulk RSVP Results

### Success Messages
✅ `"Completed: Questionnaire submitted | Filled: 5 questions | Skipped: 2"`
- All required fields filled successfully
- RSVP submitted

### Failure Messages with Retry
⚠️ `"Failed, will retry (attempt 2/3): Filled: 0 questions | Missing dropdowns: Job title"`
- Extension will retry up to 3 times
- Check settings if repeatedly failing

### Permanent Failure
❌ `"Failed permanently after 3 attempts: RSVP button not found"`
- Manual intervention needed
- Review that event's requirements

### Field Tracking
The log shows exactly what happened:
- **Filled**: Number of questions successfully answered
- **Skipped**: Questions without matching data in settings
- **Failed**: Questions that errored during fill
- **Missing dropdowns**: Specific dropdowns that couldn't be matched

---

## Troubleshooting

### Extension Not Appearing
1. Make sure you selected the correct folder: `/Users/Toto/Projects/partiful/extension`
2. Check for errors on `chrome://extensions/` page
3. Click "Errors" button if it appears red

### Queue not starting
1. Verify event URLs are valid Partiful links
2. Check that "Auto-click Continue" is enabled in RSVP settings
3. Make sure profile information is filled

### Fields Not Being Filled
1. Check spelling of dropdown preferences matches exactly
2. Add fallback options for dropdowns
3. Review queue log for "Skipped" reasons
4. Increase "Submit delay" if page loads slowly

### Questions Being Skipped
Common reasons shown in logs:
- `"Skipped - no matching data"`: No profile field or rule matches
- `"Skipped - no control found"`: Question has unusual format
- `"Missing dropdowns: XYZ"`: Your preferred option doesn't exist in dropdown

**Solution**: Add custom question rules or update dropdown preferences.

### Dropdowns Not Selecting
1. Increase "Open tab stay duration" to 7000-10000ms
2. Add multiple fallback options
3. Check exact spelling matches dropdown options

---

## Updating the Extension

When you make code changes:
1. Go to `chrome://extensions/`
2. Find **Partiful RSVPs**
3. Click the **refresh icon** (🔄)
4. Changes will be applied immediately

---

## Privacy & Permissions

The extension requires:
- **storage**: Save your settings locally on your device
- **alarms**: Per-event timeout while a bulk run is in progress
- **host_permissions**: `*.partiful.com` (fill RSVP forms) and `www.tech-week.com` (collect event links)

**Your data stays local** - nothing is sent to external servers.

---

## Uninstalling

1. Go to `chrome://extensions/`
2. Find **Partiful RSVPs**
3. Click **"Remove"**
4. Confirm removal

Your settings will be deleted from Chrome storage.

---

## Support


### Common Questions

**Q: Can I run multiple tabs simultaneously?**
A: Yes, increase "Max concurrent tabs" to 2-5. Use with caution as it's more resource-intensive.

**Q: Will this work on all Partiful events?**
A: It works on standard RSVP + questionnaire flows. Some custom event types may need manual handling.

**Q: Can I export bulk RSVP results?**
A: Not yet - currently logs are shown in the options page only.

**Q: Does it work with private/password-protected events?**
A: Yes, as long as you can access the event URL when logged in.
