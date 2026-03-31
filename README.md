# BusyBlocker: Google Calendar Automatic Sync

A Google Apps Script that syncs events from one or more personal Google Calendars to a work Google Calendar as private "Busy" blocks. Keeps your work calendar up to date without exposing personal event details to coworkers.

## How It Works

The script runs on a timer (every 15 minutes by default). On each run it:

1. Reads all events from your configured source calendars within a rolling window
2. Reads all previously-created sync blocks from your target calendar (identified by hidden metadata)
3. Deletes blocks that no longer exist in source calendars
4. Creates blocks for new source events
5. Updates blocks where the time or duration changed

Real events on your target calendar are never touched — sync blocks are identified by private extended properties written at creation time, so the cleanup query is incapable of matching anything else.

## Setup

### 1. Share source calendars with your work account

For each personal Google account you want to sync from:

1. Open Google Calendar → Settings → find the calendar → **Share with specific people**
2. Add your work email with **"See all event details"** permission

### 2. Create the Apps Script project

1. Go to [script.google.com](https://script.google.com) logged in as your **work account**
2. Click **New project**
3. Paste in the contents of `script`
4. Rename the project to something sensible (e.g. "Calendar Busy Blocker")

### 3. Enable the Advanced Calendar Service
**Required! Don't skip this step or it won't work.**
1. In the left sidebar click **Services** (the + icon)
2. Find **Google Calendar API** and click **Add**

The script uses the v3 Calendar API directly, not the default CalendarApp service.

### 4. Configure the script

Edit the `CONFIG` block at the top of `script.gs`:
```javascript
const CONFIG = {
  SOURCE_CALENDAR_IDS: [
    'your.personal@gmail.com',
    'your.other.personal@gmail.com',
  ],
  TARGET_CALENDAR_ID: 'your.work@company.com',
  DAYS_AHEAD: 60,
  SYNC_TAG_KEY: 'busyBlockerCalSyncKey',
  TRIGGER_INTERVAL_MINUTES: 15,
};
```

- `SOURCE_CALENDAR_IDS` — email addresses of the personal calendars to sync from (must be shared with your work account per step 1)
- `TARGET_CALENDAR_ID` — your work calendar email address - also the account in which the script is added
- `DAYS_AHEAD` — how many days ahead to sync (default 60 days, but edit to suit your needs) 
- `TRIGGER_INTERVAL_MINUTES` — how often the sync runs (minimum 15 minutes on Apps Script free tier)

### 5. Install the trigger

1. In the Apps Script editor, select `setupTrigger` from the function dropdown
2. Click **Run**
3. Approve the permissions prompt (calendar read/write access)

The trigger is now installed. `syncBusyBlocks` will run automatically on the configured interval. You can also run `syncBusyBlocks` manually at any time to force an immediate sync.

## What Gets Created on the Target Calendar

Each sync block is created with:

- **Title:** `Busy (auto-synced)`
- **Visibility:** Private (coworkers see the block but not the title)
- **Transparency:** Opaque (shows you as unavailable in scheduling tools)
- **Extended properties:** Two hidden metadata fields that identify it as a sync block

No details from the source event (title, description, location, attendees) are ever copied to the target calendar.

## Troubleshooting

**"Calendar is not defined" error**
The Advanced Calendar Service API is not enabled. See step 3 above.

**Source calendar events not being read**
The source calendar hasn't been shared with your work account. See step 1 above. Verify the calendar ID is the full email address of the source account's primary calendar.

**Secondary calendars (non-primary)**
If you want to sync a secondary calendar within a Google account (not the main one), find its ID in Google Calendar → Settings → click the calendar → **Calendar ID**. It will look like `c_abc123@group.calendar.google.com`.

## Execution Logs

Apps Script logs each run. To view: **Executions** in the left sidebar. Each run logs how many source events were found, how many existing blocks were loaded, and any create/update/delete operations performed.
