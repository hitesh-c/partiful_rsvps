# Partiful RSVPs

Chrome extension for bulk RSVPs on Partiful: fills the RSVP form and host questions from your saved profile across a list of event links.

## Quick Start

### Install (5 minutes)
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder: `/Users/Toto/Projects/partiful/extension`
5. Done! ✅

See [INSTALLATION.md](INSTALLATION.md) for detailed setup guide.

### Setup (10 minutes)
1. Click extension icon → **Options**
2. Fill in **Profile Basics** (email, name, company, etc.)
3. Configure **Dropdown Preferences** (job title, stage, etc.)
4. Set **RSVP Defaults** (Going, auto-submit: ON)
5. Save settings

### Use Bulk RSVP
1. Collect Partiful event URLs (one per line)
2. Paste in **Bulk RSVP Queue** section
3. Click **Start queue**
4. Watch queue logs in real-time
5. Review results: `"45 completed, 5 failed"`

## Features

✅ **Bulk RSVP** - Process dozens of events in one run  
✅ **Auto-fill RSVP** - Selects your RSVP choice and attendee count  
✅ **Smart Questionnaires** - Matches questions to profile fields  
✅ **Dropdown Matching** - Finds and selects preferred options  
✅ **Custom Rules** - Handle event-specific questions  
✅ **Real Success Tracking** - Know exactly what was filled/skipped  
✅ **Built-in Retries** - Retry failed events up to 3 times  
✅ **Detailed Logging** - See every action in real-time  

## Recent Improvements

**v1.4.2** (Latest)
- ✅ Fixed autofill success tracking (no more false positives)
- ✅ Added built-in retry logic for failed events
- ✅ Fixed settings merge to preserve user customizations
- ✅ Improved dropdown selection reliability
- ✅ Enhanced logging with detailed field-level feedback

## Bulk RSVP Example

```
Starting bulk RSVP for 50 event(s)...

✅ Event 1: Questionnaire submitted | Filled: 8 questions | Skipped: 2
✅ Event 2: Questionnaire submitted | Filled: 6 questions | Skipped: 1  
⚠️  Event 3: Retry 1/3 | Filled: 3 questions | Missing dropdowns: Stage
✅ Event 3: Questionnaire submitted | Filled: 6 questions | Skipped: 0
❌ Event 4: Failed after 3 attempts | RSVP button not found
...

Bulk RSVP finished: 47 completed, 3 failed.
```

## How It Works

1. **Background Worker** - Manages bulk RSVP queue and opens tabs
2. **Content Script** - Auto-fills forms on Partiful pages
3. **Options Page** - Configure profile and bulk RSVP settings

**Question Matching Priority:**
1. Custom question rules (exact/contains/regex)
2. Dropdown rules (label matchers)
3. Profile field mapping (email, name, LinkedIn, etc.)

## File Structure

```
extension/
├── manifest.json              # Extension configuration
├── background.js              # bulk RSVP queue & retry logic
├── content/
│   └── partiful.js           # Form autofill + tracking
├── options/
│   ├── options.html          # Settings UI
│   ├── options.css           # Styling
│   └── options.js            # Settings management
├── README.md                 # This file
├── INSTALLATION.md           # Detailed setup guide
└── LICENSE                   # Proprietary licence
```

## Privacy

- ✅ All data stored locally in Chrome storage
- ✅ No external servers or analytics
- ✅ Only accesses `*.partiful.com` domains
- ✅ Code is open and auditable

## Troubleshooting

**Fields not being filled?**
- Check dropdown spelling matches exactly
- Add fallback options
- Review queue logs for skip reasons

**Queue not starting?**
- Verify event URLs are valid Partiful links
- Enable "Auto-click Continue" in RSVP settings
- Check profile information is filled

**Questions being skipped?**
- Add custom question rules for event-specific questions
- Update dropdown preferences with exact option text
- Check queue log for detailed skip reasons

See [INSTALLATION.md](INSTALLATION.md) for comprehensive troubleshooting guide.

## Support

Found an issue? Check the queue logs for detailed error messages:
- `"Skipped - no matching data"` → Add matching rule or profile field
- `"Missing dropdowns: XYZ"` → Update dropdown preference spelling
- `"Failed to find RSVP button"` → Event may have custom layout

## License

Copyright © 2026 Hitesh Chawla. All rights reserved.

This project is **proprietary, not open source**. You may run it for your own personal use, but you may not copy, modify, redistribute or publish it without written permission. See [LICENSE](LICENSE).
