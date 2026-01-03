# Calendar Integration Implementation Summary

## Overview

This document describes the implementation of calendar event viewing in the fred-bar time-pill component. The integration connects to the `fredcal` service to display today's events in a mobile-style calendar view.

## What Was Implemented

### 1. Calendar Service (`config/right/time-pill/calendar-service.tsx`)

A singleton service that manages calendar data fetching and distribution:

**Key Features:**

- Fetches events from `http://localhost:5090/api/get_today_calendars`
- Smart retry mechanism:
  - Checks every 1 minute when API is unavailable (e.g., on startup)
  - Checks every 15 minutes when API is working
- Subscription-based architecture for reactive updates
- Graceful error handling with automatic recovery
- TypeScript interfaces for type safety

**API:**

```typescript
const service = getCalendarService();
const unsubscribe = service.subscribe((data: CalendarData | null) => {
  // Handle updates
});
```

### 2. Calendar View (`config/right/time-pill/calendar-view.tsx`)

A GTK4 widget that displays calendar events in a user-friendly format:

**Layout:**

```text
┌─────────────────────────────────────┐
│ Today's Events          [3 events]  │ ← Header
├─────────────────────────────────────┤
│ ALL DAY                             │
│ ┌─────────────────────────────────┐ │
│ │ Team Standup                    │ │ ← All-day event
│ │ Work                            │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ 9:00 AM - 10:00 AM                  │
│ Project Meeting                     │ ← Timed event
│ Work • Conference Room A            │
│                                     │
│ 2:30 PM - 3:30 PM                   │
│ Design Review                       │
│ Personal • Office                   │
└─────────────────────────────────────┘
```

**Features:**

- Separate sections for all-day and timed events
- Sorted by time (earliest first)
- Shows event title, time (in local timezone), calendar name, and location
- Fits to content size with max height of 400px (scrolls if needed)
- UTC timestamps converted to local timezone for display
- Loading state: "Connecting to calendar..."
- Empty state: "No events today"
- Status indicator showing event count

### 3. Time Pill Integration (`config/right/time-pill/time-pill.tsx`)

Modified the existing time-pill popover to include the calendar view:

**Changes:**

- Import and instantiate `CalendarView()`
- Added calendar view below world clocks
- Added visual separator between sections
- Increased popover width from 320px to 450px to accommodate calendar

**Popover Layout:**

1. World Clocks (existing, on top)
2. Separator
3. Calendar View (new, below)

### 4. Styling (`config/styles/components/_time.scss`)

Comprehensive CSS styling using Catppuccin color scheme:

**Key Styles:**

- `.calendar-view` - Main container with subtle background
- `.calendar-event` - Individual event cards with hover effects
- `.all-day-event` - Purple left border for visual distinction
- `.timed-event` - Blue left border for timed events
- Color-coded elements:
  - Calendar names: Sapphire
  - Event titles: Primary text color
  - Times: Subtle gray
  - Locations: Muted

## File Structure

```shell
config/right/time-pill/
├── calendar-service.tsx      # Data fetching and state management
├── calendar-view.tsx          # UI component
├── time-pill.tsx             # Main integration (modified)
├── CALENDAR_README.md        # Detailed documentation
└── (existing time-pill files)

config/styles/components/
└── _time.scss                # Styling (modified)
```

## Data Flow

```text
┌──────────────────┐
│  fredcal API     │ http://localhost:5090/api/get_today_calendars
│  (port 5090)     │
└────────┬─────────┘
         │ HTTP GET (async)
         ↓
┌──────────────────────┐
│ CalendarService      │ Singleton, manages fetching & retries
│ - fetchCalendarData()│
│ - subscribe()        │
└────────┬─────────────┘
         │ Subscription callback
         ↓
┌──────────────────────┐
│ CalendarView         │ GTK4 Widget
│ - updateView()       │
│ - render events      │
└────────┬─────────────┘
         │ Child widget
         ↓
┌──────────────────────┐
│ Time Pill Popover    │ Popover displayed on click
└──────────────────────┘
```

## Error Handling

The implementation handles several failure modes gracefully:

1. **fredcal not started yet**
   - Shows "Connecting to calendar..."
   - Retries every 60 seconds
   - Automatically connects when service becomes available

2. **Network errors**
   - Logs warning to console
   - Maintains last known good data
   - Retries on schedule

3. **Invalid JSON response**
   - Catches parse errors
   - Shows loading state
   - Retries on schedule

4. **Empty events**
   - Shows "No events today" message
   - Still displays event count (0 events)

## Testing

### Manual Testing Steps

1. **Test normal operation:**

   ```bash
   # Ensure fredcal is running
   curl http://localhost:5090/api/health

   # Run fred-bar
   ags run -d config

   # Click on time pill to open popover
   # Verify calendar events appear
   ```

2. **Test startup resilience:**

   ```bash
   # Stop fredcal
   # Start fred-bar
   # Should show "Connecting to calendar..."
   # Start fredcal
   # Should automatically connect and show events
   ```

3. **Test API failure handling:**

   ```bash
   # While fred-bar is running, stop fredcal
   # Calendar should retry gracefully
   # Restart fredcal
   # Calendar should reconnect
   ```

### Expected Behavior

- **On click:** Time pill popover opens showing world clocks, then calendar below
- **Events displayed:** All-day events on top, timed events below sorted by time (in local timezone)
- **Scrolling:** Calendar fits to content, up to max 400px height, then scrolls
- **Updates:** Events refresh every 15 minutes automatically
- **Status:** Event count shown in header (e.g., "3 events")
- **Timezone:** All times displayed in local timezone (converted from UTC)

## Current Limitations

These features are **not** implemented (as requested):

- ✗ TODO items display
- ✗ Event editing or modification
- ✗ Multi-day views (only shows today)
- ✗ Click actions on events
- ✗ Event details popover
- ✗ Calendar color coding by source
- ✗ Recurring event indicators

## Future Enhancements

Potential additions mentioned in CALENDAR_README.md:

- TODO integration from fredcal
- Week/month view
- Event creation/editing UI
- Click to open event details
- Filter by calendar source
- Color-coded events per calendar
- Timezone support
- Recurring event badges
- Event status indicators (confirmed/tentative/cancelled)
- Integration with notifications for upcoming events

## Technical Notes

### TypeScript Interfaces

```typescript
interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO 8601 format
  end: string; // ISO 8601 format
  calendar_name: string;
  calendar_url: string;
  all_day: boolean;
  rrule?: string;
  status?: string;
  etag?: string;
}

interface CalendarData {
  events: CalendarEvent[];
  last_sync?: string;
}
```

### Date/Time Handling

- Uses `GLib.DateTime.new_from_iso8601()` for parsing UTC timestamps
- Explicitly converts from UTC to local timezone using `to_local()`
- Formats as 12-hour time with AM/PM in local time
- All-day events show "All Day" instead of times
- Handles timezone conversion properly (fredcal returns UTC, displays in local time)

### GTK Widgets Used

- `Gtk.Box` - Layout containers
- `Gtk.Label` - Text display
- `Gtk.ScrolledWindow` - Scrollable event list
- `Gtk.Separator` - Visual dividers
- CSS classes for styling

### Performance Considerations

- Single HTTP request per fetch (no polling per event)
- Subscription pattern prevents unnecessary re-renders
- Async file loading prevents UI blocking
- Smart retry intervals reduce network traffic

## Conclusion

This implementation provides a clean, read-only view of today's calendar events integrated into the existing time-pill component. It handles API unavailability gracefully and automatically recovers when the service becomes available. The design follows the existing fred-bar patterns and styling conventions.
