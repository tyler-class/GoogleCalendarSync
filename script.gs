const CONFIG = {
  SOURCE_CALENDAR_IDS: [
    'sourceCalendar1@gmail.com',
    'sourceCalendar2@gmail.com'
  ],
  TARGET_CALENDAR_ID: 'targetWorkCalendar@gmail.com',
  DAYS_AHEAD: 60,
  SYNC_TAG_KEY: 'busyBlockerCalSyncKey',
  TRIGGER_INTERVAL_MINUTES: 15,
};

// ─── SETUP: Run once ─────────────────────────────────────────────────────────
function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncBusyBlocks')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncBusyBlocks')
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_INTERVAL_MINUTES)
    .create();

  Logger.log('Trigger installed.');
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function toRFC3339(date) {
  return date.toISOString();
}

function getSyncKey(event) {
  return event?.extendedProperties?.private?.[CONFIG.SYNC_TAG_KEY] ?? null;
}

// ─── MAIN SYNC ───────────────────────────────────────────────────────────────
function syncBusyBlocks() {
  const now = new Date();
  const end = new Date();
  end.setDate(now.getDate() + CONFIG.DAYS_AHEAD);

  // ── 1. Collect source events ──────────────────────────────────────────────
  const desiredMap = {};

  CONFIG.SOURCE_CALENDAR_IDS.forEach(calId => {
    let pageToken = null;
    do {
      const params = {
        timeMin: toRFC3339(now),
        timeMax: toRFC3339(end),
        singleEvents: true,
        maxResults: 250,
      };
      if (pageToken) params.pageToken = pageToken;

      let response;
      try {
        response = Calendar.Events.list(calId, params);
      } catch (e) {
        Logger.log('ERROR reading calendar %s: %s', calId, e.message);
        return;
      }

      (response.items || []).forEach(event => {
        // Skip all-day events (they have date, not dateTime)
        if (!event.start?.dateTime) return;
        // Skip cancelled events
        if (event.status === 'cancelled') return;

        const key = `${calId}::${event.id}`;
        desiredMap[key] = {
          key,
          start: event.start.dateTime,
          end: event.end.dateTime,
        };
      });

      pageToken = response.nextPageToken;
    } while (pageToken);
  });

  // ── 2. Load existing sync blocks from target ──────────────────────────────
  const existingMap = {};
  let pageToken = null;

  do {
    const params = {
      timeMin: toRFC3339(now),
      timeMax: toRFC3339(end),
      privateExtendedProperty: `calSyncMarker=exists`, // filter to only our blocks
      singleEvents: true,
      maxResults: 250,
    };
    if (pageToken) params.pageToken = pageToken;

    let response;
    try {
      response = Calendar.Events.list(CONFIG.TARGET_CALENDAR_ID, params);
    } catch (e) {
      Logger.log('ERROR reading target calendar: %s', e.message);
      return;
    }

    (response.items || []).forEach(event => {
      if (event.status === 'cancelled') return;
      const key = getSyncKey(event);
      if (key) existingMap[key] = event;
    });

    pageToken = response.nextPageToken;
  } while (pageToken);

  // ── 3. Delete stale blocks ────────────────────────────────────────────────
  Object.keys(existingMap).forEach(key => {
    if (!desiredMap[key]) {
      try {
        Calendar.Events.remove(CONFIG.TARGET_CALENDAR_ID, existingMap[key].id);
        Logger.log('Deleted stale block: %s', key);
      } catch (e) {
        Logger.log('ERROR deleting block %s: %s', key, e.message);
      }
    }
  });

  // ── 4. Create or update blocks ────────────────────────────────────────────
  Object.values(desiredMap).forEach(desired => {
    const existing = existingMap[desired.key];

    if (!existing) {
      // Create
      try {
        Calendar.Events.insert({
          summary: 'Busy (auto-synced)',
          start: { dateTime: desired.start },
          end: { dateTime: desired.end },
          visibility: 'private',
          transparency: 'opaque', // shows as Busy to others
          extendedProperties: {
            private: {
              [CONFIG.SYNC_TAG_KEY]: desired.key, // the source event key
              calSyncMarker: 'exists',             // used for list filter
            }
          }
        }, CONFIG.TARGET_CALENDAR_ID);
        Logger.log('Created block: %s', desired.key);
      } catch (e) {
        Logger.log('ERROR creating block %s: %s', desired.key, e.message);
      }
    } else {
      // Update only if times changed
      const startChanged = existing.start.dateTime !== desired.start;
      const endChanged = existing.end.dateTime !== desired.end;
      if (startChanged || endChanged) {
        try {
          Calendar.Events.patch({
            start: { dateTime: desired.start },
            end: { dateTime: desired.end },
          }, CONFIG.TARGET_CALENDAR_ID, existing.id);
          Logger.log('Updated block: %s', desired.key);
        } catch (e) {
          Logger.log('ERROR updating block %s: %s', desired.key, e.message);
        }
      }
    }
  });

  Logger.log('Sync complete. Desired: %s, Existing: %s', 
    Object.keys(desiredMap).length, Object.keys(existingMap).length);
}
