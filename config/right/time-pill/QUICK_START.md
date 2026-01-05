# Calendar Integration - Quick Start Guide

## What You Get

A calendar view integrated into the time-pill popover that displays events from `fredcal` with day-by-day navigation.

## Visual Preview

```text
┌──────────────────────────────────────────────┐
│  12:45:30  Wednesday, January 3rd, 2026      │ ← Time Pill (click me!)
└──────────────────────────────────────────────┘
                    ↓ (opens popover)
┌──────────────────────────────────────────────┐
│            World Clocks                      │
│  [Clock] [Clock] [Clock]                     │
├──────────────────────────────────────────────┤
│  ←  Today's Events  →  [Today]      5 events │ ← Navigation controls
├──────────────────────────────────────────────┤
│ ALL DAY                                      │
│ ┌──────────────────────────────────────────┐ │
│ │ Team Building Day                        │ │
│ │ Work                                     │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ 9:00 AM - 9:30 AM      Daily Standup         │
│                        Work • Conf Room A    │
│                                              │
│ 10:30 AM - 12:00 PM    Project Planning      │
│                        Work • Zoom           │
│                                              │
│ 12:30 PM - 1:30 PM     Lunch with Sarah      │
│                        Personal • Cafe       │
└──────────────────────────────────────────────┘
```

## Prerequisites

1. **fredcal must be running** on port 5090

   ```bash
   # Check if it's running:
   curl http://localhost:5090/api/health

   # Should return something like:
   # {"status":"ok","timestamp":"2026-01-03T12:00:00Z"}
   ```

2. **fred-bar installed** via Home Manager (see main README.md)

## Navigation

- **← button**: Go to previous day
- **→ button**: Go to next day
- **Today button**: Jump back to today (only visible when viewing other dates)
- **Header**: Shows "Today's Events", "Tomorrow's Events", "Yesterday's Events", or specific date like "Monday, January 5"

## How It Works

1. **On Startup**: Calendar service tries to connect to fredcal
   - If fredcal isn't ready: Shows "Connecting to calendar..." and retries every minute
   - Once connected: Displays events

2. **Navigation**:
   - Click ← or → to browse days
   - Header updates to show the current date
   - "Today" button appears when viewing past/future dates
   - Each navigation fetches fresh data for that day

3. **Updates**:
   - Checks for new events every 15 minutes
   - fredcal syncs with CalDAV every 15 minutes
   - Times are aligned, so you see fresh data

4. **Display**:
   - All-day events shown first with purple accent
   - Timed events below, sorted by start time with blue accent
   - Shows: title, time, calendar name, location
   - Dynamic header changes based on the date being viewed

## Files Overview

```text
config/right/time-pill/
├── calendar-service.tsx    # Fetches data from fredcal API
├── calendar-view.tsx       # Displays the events (GTK widgets)
├── time-pill.tsx          # Main component (modified)
├── mock-calendar-data.tsx # Test data generator
├── CALENDAR_README.md     # Detailed docs
└── QUICK_START.md        # This file
```

## Testing Without fredcal

If you want to test the UI without fredcal running:

1. Edit `calendar-service.tsx`
2. Add import at top:

   ```typescript
   import { generateMockCalendarData } from "./mock-calendar-data";
   ```

3. In `performFetch()` method, replace the file loading with:

   ```typescript
   const data = generateMockCalendarData();
   this.data = data;
   this.isApiAvailable = true;
   this.notifyCallbacks();
   this.scheduleNextFetch(UPDATE_INTERVAL_MS);
   ```

4. Run fred-bar: `ags run -d config`

## Troubleshooting

### "Connecting to calendar..." never goes away

**Problem**: fredcal isn't running or not on port 5090

**Solution**:

```bash
# Check if fredcal is running
curl http://localhost:5090/api/health

# Check fredcal logs
journalctl --user -u fredcal -f
```

### Events don't appear

**Problem**: API might be returning empty or malformed data

**Solution**:

```bash
# Check what fredcal returns
curl http://localhost:5090/api/get_today_calendars | jq

# Look for fred-bar logs (console output)
# Should see: [CalendarService] messages
```

### Calendar takes up too much space

**Problem**: Many events make the view very tall

**Solution**: The view has a max height (400px) and scrolls automatically. It will fit to content if there are fewer events.

### Navigation doesn't work

**Problem**: Buttons don't respond or API calls fail

**Solution**:

```bash
# Make sure fredcal supports the date range API
curl http://localhost:5090/api/get_date_range/today
curl http://localhost:5090/api/get_date_range/tomorrow
curl http://localhost:5090/api/get_date_range/+1d
curl http://localhost:5090/api/get_date_range/-1d
```

### Want to see TODOs too?

**Current limitation**: TODOs are NOT implemented yet. This version only shows calendar events.

**Future enhancement**: Can be added by:

- Fetching from `/api/get_today` instead of using the date range API
- Adding TODO section to calendar-view.tsx
- Styling TODO items differently

## What's Next?

Current implementation is **view-only** with day navigation. Potential enhancements:

- [x] Day scrolling navigation
- [ ] Keyboard shortcuts (j/k for prev/next, t for today)
- [ ] Week/month view
- [ ] Click to view event details
- [ ] Add TODOs display
- [ ] Create/edit events
- [ ] Color-code by calendar source
- [ ] Notifications for upcoming events
- [ ] Mini calendar for date jumping

See `CALENDAR_README.md` for the full enhancement wishlist.

## Need Help?

1. Check console output for `[CalendarService]` messages
2. Verify fredcal API manually with curl
3. Try mock data to isolate UI vs API issues
4. Read `CALENDAR_README.md` for architecture details
5. Check `CALENDAR_IMPLEMENTATION.md` for implementation notes

## Example API Responses

### Today

```bash
curl http://localhost:5090/api/get_date_range/today
```

### Tomorrow

```bash
curl http://localhost:5090/api/get_date_range/tomorrow
```

### 3 days from now

```bash
curl http://localhost:5090/api/get_date_range/+3d
```

### Response format

```json
{
  "events": [
    {
      "uid": "event-123",
      "summary": "Team Meeting",
      "description": "Weekly sync",
      "location": "Conference Room",
      "start": "2026-01-03T14:00:00Z",
      "end": "2026-01-03T15:00:00Z",
      "calendar_name": "Work",
      "calendar_url": "/calendars/work/",
      "all_day": false,
      "status": "CONFIRMED"
    }
  ],
  "last_sync": "2026-01-03T12:00:00Z"
}
```

---

**That's it!** Click the time pill, see your calendar, navigate through days. Simple as that.
