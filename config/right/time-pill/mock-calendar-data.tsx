// mock-calendar-data.tsx
// Mock data for testing calendar view without fredcal running

import GLib from "gi://GLib";
import type { CalendarData, CalendarEvent } from "./calendar-service";

/**
 * Generate mock calendar events for testing
 */
export function generateMockCalendarData(): CalendarData {
  const now = GLib.DateTime.new_now_local();

  // Helper to create ISO timestamp
  function makeTimestamp(hour: number, minute: number): string {
    const dt = GLib.DateTime.new_local(
      now.get_year(),
      now.get_month(),
      now.get_day_of_month(),
      hour,
      minute,
      0,
    );
    return dt?.format_iso8601() ?? "";
  }

  const events: CalendarEvent[] = [
    // All-day event
    {
      uid: "mock-allday-1",
      summary: "Team Building Day",
      description: "Company-wide team building activities",
      location: "Office Campus",
      start: makeTimestamp(0, 0),
      end: makeTimestamp(23, 59),
      calendar_name: "Work",
      calendar_url: "/calendars/work/",
      all_day: true,
      status: "CONFIRMED",
    },

    // Morning meeting
    {
      uid: "mock-timed-1",
      summary: "Daily Standup",
      description: "Team sync meeting",
      location: "Conference Room A",
      start: makeTimestamp(9, 0),
      end: makeTimestamp(9, 30),
      calendar_name: "Work",
      calendar_url: "/calendars/work/",
      all_day: false,
      status: "CONFIRMED",
    },

    // Mid-morning
    {
      uid: "mock-timed-2",
      summary: "Project Planning Session",
      description: "Q1 planning for new features",
      location: "Zoom",
      start: makeTimestamp(10, 30),
      end: makeTimestamp(12, 0),
      calendar_name: "Work",
      calendar_url: "/calendars/work/",
      all_day: false,
      status: "CONFIRMED",
    },

    // Lunch
    {
      uid: "mock-timed-3",
      summary: "Lunch with Sarah",
      description: "",
      location: "Downtown Cafe",
      start: makeTimestamp(12, 30),
      end: makeTimestamp(13, 30),
      calendar_name: "Personal",
      calendar_url: "/calendars/personal/",
      all_day: false,
      status: "CONFIRMED",
    },

    // Afternoon
    {
      uid: "mock-timed-4",
      summary: "Code Review",
      description: "Review PRs from team members",
      location: "",
      start: makeTimestamp(14, 0),
      end: makeTimestamp(15, 0),
      calendar_name: "Work",
      calendar_url: "/calendars/work/",
      all_day: false,
      status: "CONFIRMED",
    },

    // Late afternoon
    {
      uid: "mock-timed-5",
      summary: "1:1 with Manager",
      description: "Weekly check-in",
      location: "Office",
      start: makeTimestamp(16, 0),
      end: makeTimestamp(16, 30),
      calendar_name: "Work",
      calendar_url: "/calendars/work/",
      all_day: false,
      status: "CONFIRMED",
    },

    // Evening
    {
      uid: "mock-timed-6",
      summary: "Gym Session",
      description: "Cardio and weights",
      location: "24/7 Fitness",
      start: makeTimestamp(18, 0),
      end: makeTimestamp(19, 0),
      calendar_name: "Personal",
      calendar_url: "/calendars/personal/",
      all_day: false,
      status: "CONFIRMED",
    },
  ];

  return {
    events,
    last_sync: now.format_iso8601() ?? undefined,
  };
}

/**
 * Generate empty calendar data (no events)
 */
export function generateEmptyCalendarData(): CalendarData {
  const now = GLib.DateTime.new_now_local();
  return {
    events: [],
    last_sync: now.format_iso8601() ?? undefined,
  };
}

/**
 * Generate calendar data with only all-day events
 */
export function generateAllDayOnlyData(): CalendarData {
  const now = GLib.DateTime.new_now_local();

  function makeTimestamp(hour: number, minute: number): string {
    const dt = GLib.DateTime.new_local(
      now.get_year(),
      now.get_month(),
      now.get_day_of_month(),
      hour,
      minute,
      0,
    );
    return dt?.format_iso8601() ?? "";
  }

  return {
    events: [
      {
        uid: "allday-1",
        summary: "Holiday - Office Closed",
        description: "National Holiday",
        location: "",
        start: makeTimestamp(0, 0),
        end: makeTimestamp(23, 59),
        calendar_name: "Holidays",
        calendar_url: "/calendars/holidays/",
        all_day: true,
        status: "CONFIRMED",
      },
      {
        uid: "allday-2",
        summary: "Birthday - John Doe",
        description: "",
        location: "",
        start: makeTimestamp(0, 0),
        end: makeTimestamp(23, 59),
        calendar_name: "Personal",
        calendar_url: "/calendars/personal/",
        all_day: true,
        status: "CONFIRMED",
      },
    ],
    last_sync: now.format_iso8601() ?? undefined,
  };
}

/**
 * Usage instructions:
 *
 * To use mock data instead of the API, modify calendar-service.tsx:
 *
 * 1. Import this file:
 *    import { generateMockCalendarData } from "./mock-calendar-data";
 *
 * 2. In the performFetch() method, replace the API call with:
 *    const data = generateMockCalendarData();
 *    this.data = data;
 *    this.isApiAvailable = true;
 *    this.notifyCallbacks();
 *    this.scheduleNextFetch(UPDATE_INTERVAL_MS);
 *
 * This allows testing the calendar view without running fredcal.
 */
