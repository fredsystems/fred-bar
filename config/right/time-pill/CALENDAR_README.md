# Calendar Integration

This directory contains the calendar view integration for the time-pill component.

## Overview

The calendar integration displays events from the `fredcal` service in the time-pill popover. It shows events in a mobile-style calendar view with:

- **Day navigation** - scroll through past and future days with arrow buttons
- **Today button** - quickly jump back to today's events
- **All-day events** displayed at the top
- **Timed events** shown below with start/end times
- **Scrollable view** that adapts to available space

## Architecture

### Components

1. **`calendar-service.tsx`** - Data fetching and state management
   - Fetches events from `http://localhost:5090/api/get_date_range/:range`
   - Manages current date offset (today, yesterday, tomorrow, etc.)
   - Provides navigation methods (previousDay, nextDay, goToToday)
   - Handles API availability gracefully
   - Implements smart retry logic
   - Provides subscription-based updates

2. **`calendar-view.tsx`** - UI component
   - Renders navigation controls (previous/next day, today button)
   - Displays dynamic date header (Today, Tomorrow, or specific date)
   - Renders the calendar event list
   - Separates all-day and timed events
   - Displays event details (title, time, location, calendar)
   - Shows loading and empty states

3. **`time-pill.tsx`** - Main integration point
   - Embeds calendar view in the popover
   - Positioned above world clocks

### Data Flow

```text
fredcal API (localhost:5090)
    ↓
CalendarService (singleton)
    ↓ (subscription)
CalendarView (widget)
    ↓
Time Pill Popover
```

## API Integration

### Endpoints

The service uses the date range API endpoint:

```shell
GET http://localhost:5090/api/get_date_range/:range
```

**Range Formats:**

- `today` - Today's date
- `tomorrow` - Tomorrow's date
- `+3d` - 3 days from now
- `-2d` - 2 days ago
- `week` - Next 7 days from today
- `month` - Next 30 days from today
- `2026-01-05` - Specific date (returns that day)
- `2026-01-05:2026-01-10` - Date range from start to end
- `+1w` - 1 week from now

### Response Format

```json
{
  "events": [
    {
      "uid": "unique-event-id",
      "summary": "Event Title",
      "description": "Event description",
      "location": "Event location",
      "start": "2026-01-05T10:00:00Z",
      "end": "2026-01-05T11:00:00Z",
      "calendar_name": "Personal",
      "calendar_url": "/calendars/user/personal/",
      "all_day": false,
      "rrule": "FREQ=WEEKLY;BYDAY=MO",
      "status": "CONFIRMED",
      "etag": "..."
    }
  ],
  "last_sync": "2026-01-03T18:30:00Z"
}
```

## Update Strategy

The service uses a smart retry mechanism:

### When API is Available

- Fetches data successfully
- Updates view with events
- Schedules next check in **15 minutes** (900,000ms)

### When API is Unavailable

- Shows "Connecting to calendar..." message
- Retries every **1 minute** (60,000ms)
- Continues until API becomes available

### On Startup

- Immediately attempts to fetch data
- If fredcal is still starting up, gracefully waits
- Automatically connects when service becomes available

## User Interface

### Navigation

- **← / → buttons** - Navigate to previous/next day
- **Today button** - Appears when viewing a date other than today, returns to today
- **Dynamic header** - Shows "Today's Events", "Tomorrow's Events", "Yesterday's Events", or the specific date

### Keyboard Navigation

Currently, navigation is mouse-only. Future enhancement could add keyboard shortcuts.

## Styling

Calendar styles are defined in `config/styles/components/_time.scss`:

- **`.calendar-view`** - Main container
- **`.calendar-header`** - Navigation and title bar
- **`.calendar-nav-button`** - Previous/next day arrow buttons
- **`.calendar-today-button`** - Today navigation button
- **`.calendar-header-title`** - Dynamic date title
- **`.calendar-event`** - Individual event styling
- **`.all-day-event`** - All-day event with purple accent
- **`.timed-event`** - Timed event with blue accent
- **`.calendar-empty`** - Empty state message
- **`.calendar-loading`** - Loading state message

### Color Coding

- All-day events: Purple left border (`$ctp-mauve`)
- Timed events: Blue left border (`$ctp-blue`)
- Calendar name: Sapphire color (`$ctp-sapphire`)

## Future Enhancements

Potential improvements for the calendar view:

- [x] Day scrolling navigation
- [ ] Keyboard shortcuts for navigation (j/k for prev/next day, t for today)
- [ ] Week/month view options
- [ ] Support for TODOs display
- [ ] Multi-day event view
- [ ] Event editing/creation
- [ ] Click to view event details
- [ ] Calendar filtering by calendar name
- [ ] Color-coded events by calendar (per-calendar colors)
- [ ] Time zone handling for events
- [ ] Recurring event indicators
- [ ] Event status indicators (confirmed, tentative, cancelled)
- [ ] Integration with notification system for upcoming events
- [ ] Mini calendar widget to jump to specific dates

## Testing

To test the calendar integration:

1. Ensure `fredcal` is running on port 5090:

   ```bash
   # Check if fredcal is running
   curl http://localhost:5090/api/health
   ```

2. Open the time-pill popover by clicking the time display

3. The calendar view should appear above the world clocks

4. Test scenarios:
   - Start fred-bar before fredcal starts (should show loading, then connect)
   - Stop fredcal while fred-bar is running (should retry)
   - Restart fredcal (should automatically reconnect)
   - Navigate to different days using arrow buttons
   - Click "Today" button to return to current date
   - Verify header updates correctly (Today, Tomorrow, Yesterday, specific dates)

## Debugging

Enable debug logging by checking the console:

```bash
# Messages are logged with [CalendarService] prefix
[CalendarService] Fetch error: ...
[CalendarService] Parse error: ...
```

The service gracefully handles:

- Network errors
- JSON parse errors
- Missing or malformed data
- API unavailability
- Temporary connection issues
