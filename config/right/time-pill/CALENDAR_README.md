# Calendar Integration

This directory contains the calendar view integration for the time-pill component.

## Overview

The calendar integration displays today's events from the `fredcal` service in the time-pill popover. It shows events in a mobile-style calendar view with:

- **All-day events** displayed at the top
- **Timed events** shown below with start/end times
- **Scrollable view** that adapts to available space

## Architecture

### Components

1. **`calendar-service.tsx`** - Data fetching and state management
   - Fetches events from `http://localhost:5090/api/get_today_calendars`
   - Handles API availability gracefully
   - Implements smart retry logic
   - Provides subscription-based updates

2. **`calendar-view.tsx`** - UI component
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

### Endpoint

```shell
GET http://localhost:5090/api/get_today_calendars
```

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

## Styling

Calendar styles are defined in `config/styles/components/_time.scss`:

- **`.calendar-view`** - Main container
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

- [ ] Support for TODOs display
- [ ] Multi-day event view
- [ ] Event editing/creation
- [ ] Click to view event details
- [ ] Calendar filtering by calendar name
- [ ] Color-coded events by calendar
- [ ] Time zone handling for events
- [ ] Recurring event indicators
- [ ] Event status indicators (confirmed, tentative, cancelled)
- [ ] Integration with notification system for upcoming events

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
