// calendar-view.tsx

import GLib from "gi://GLib?version=2.0";
import Gtk from "gi://Gtk?version=4.0";
import type { CalendarData, CalendarEvent } from "./calendar-service";
import { getCalendarService } from "./calendar-service";

/**
 * Parse ISO date string to GLib.DateTime in local timezone
 */
function parseDateTime(isoString: string): GLib.DateTime | null {
  try {
    // ISO format: 2026-01-05T10:00:00Z
    // Parse as UTC first
    const utcDt = GLib.DateTime.new_from_iso8601(
      isoString,
      GLib.TimeZone.new_utc(),
    );
    if (utcDt) {
      // Convert to local timezone
      return utcDt.to_local();
    }
  } catch (error) {
    console.error(`Failed to parse date: ${isoString}`, error);
  }
  return null;
}

/**
 * Format time for display (e.g., "2:30 PM")
 */
function formatTime(dt: GLib.DateTime): string {
  const hour = dt.get_hour();
  const minute = dt.get_minute();
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  const minStr = minute.toString().padStart(2, "0");
  return `${hour12}:${minStr} ${ampm}`;
}

/**
 * Format time range for an event
 */
function formatTimeRange(event: CalendarEvent): string {
  if (event.all_day) {
    return "All Day";
  }

  const start = parseDateTime(event.start);
  const end = parseDateTime(event.end);

  if (!start || !end) {
    return "Invalid time";
  }

  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Create an all-day event widget
 */
function createAllDayEventWidget(event: CalendarEvent): Gtk.Box {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 2,
    css_classes: ["calendar-event", "all-day-event"],
    hexpand: true,
  });

  const titleLabel = new Gtk.Label({
    label: event.summary || "Untitled Event",
    xalign: 0,
    css_classes: ["event-title"],
    wrap: true,
    wrap_mode: 2, // WORD_CHAR
  });

  const calendarLabel = new Gtk.Label({
    label: event.calendar_name,
    xalign: 0,
    css_classes: ["event-calendar"],
  });

  box.append(titleLabel);
  box.append(calendarLabel);

  return box;
}

/**
 * Create a timed event widget
 */
function createTimedEventWidget(event: CalendarEvent): Gtk.Box {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["calendar-event", "timed-event"],
    hexpand: true,
  });

  // Time column
  const timeLabel = new Gtk.Label({
    label: formatTimeRange(event),
    xalign: 0,
    css_classes: ["event-time"],
    width_chars: 15,
  });

  // Event details column
  const detailsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 2,
    hexpand: true,
  });

  const titleLabel = new Gtk.Label({
    label: event.summary || "Untitled Event",
    xalign: 0,
    css_classes: ["event-title"],
    wrap: true,
    wrap_mode: 2, // WORD_CHAR
    hexpand: true,
  });

  const infoBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 4,
  });

  const calendarLabel = new Gtk.Label({
    label: event.calendar_name,
    xalign: 0,
    css_classes: ["event-calendar"],
  });

  infoBox.append(calendarLabel);

  if (event.location) {
    const locationLabel = new Gtk.Label({
      label: `• ${event.location}`,
      xalign: 0,
      css_classes: ["event-location"],
      ellipsize: 3, // END
      max_width_chars: 30,
    });
    infoBox.append(locationLabel);
  }

  detailsBox.append(titleLabel);
  detailsBox.append(infoBox);

  box.append(timeLabel);
  box.append(detailsBox);

  return box;
}

/**
 * Create the calendar view widget
 */
export function CalendarView(): Gtk.Box {
  const service = getCalendarService();

  // Main container
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["calendar-view"],
    visible: true,
  });

  // Header
  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["calendar-header"],
  });

  const headerLabel = new Gtk.Label({
    label: "Today's Events",
    xalign: 0,
    hexpand: true,
    css_classes: ["calendar-header-title"],
  });

  const statusLabel = new Gtk.Label({
    label: "",
    xalign: 1,
    css_classes: ["calendar-status"],
  });

  header.append(headerLabel);
  header.append(statusLabel);

  // Scrolled window for events
  const scrolled = new Gtk.ScrolledWindow({
    vexpand: false,
    hexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    css_classes: ["calendar-scrolled"],
    visible: true,
  });

  scrolled.set_min_content_height(0);
  scrolled.set_max_content_height(400);
  scrolled.set_propagate_natural_height(true);

  // Events container
  const eventsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["calendar-events"],
    visible: true,
  });

  scrolled.set_child(eventsBox);

  container.append(header);
  container.append(scrolled);

  // Empty state
  const emptyLabel = new Gtk.Label({
    label: "No events today",
    css_classes: ["calendar-empty"],
    vexpand: true,
    valign: Gtk.Align.CENTER,
  });

  // Loading state
  const loadingLabel = new Gtk.Label({
    label: "Connecting to calendar...",
    css_classes: ["calendar-loading"],
    vexpand: true,
    valign: Gtk.Align.CENTER,
  });

  /**
   * Update the view with new data
   */
  function updateView(data: CalendarData | null): void {
    // Clear current events
    let child = eventsBox.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      eventsBox.remove(child);
      child = next;
    }

    if (!data) {
      // Show loading state

      eventsBox.append(loadingLabel);
      statusLabel.set_label("⟳");
      return;
    }

    const events = data.events || [];

    if (events.length === 0) {
      // Show empty state
      eventsBox.append(emptyLabel);
      statusLabel.set_label("✓");
      return;
    }

    // Separate all-day and timed events
    const allDayEvents = events.filter((e) => e.all_day);
    const timedEvents = events.filter((e) => !e.all_day);

    // Sort timed events by start time
    timedEvents.sort((a, b) => {
      const aStart = parseDateTime(a.start);
      const bStart = parseDateTime(b.start);
      if (!aStart || !bStart) return 0;
      return aStart.compare(bStart);
    });

    // Add all-day events section
    if (allDayEvents.length > 0) {
      const allDaySection = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 4,
        css_classes: ["calendar-section", "all-day-section"],
      });

      const sectionTitle = new Gtk.Label({
        label: "All Day",
        xalign: 0,
        css_classes: ["section-title"],
      });

      allDaySection.append(sectionTitle);

      for (const event of allDayEvents) {
        const eventWidget = createAllDayEventWidget(event);
        allDaySection.append(eventWidget);
      }

      eventsBox.append(allDaySection);

      // Add separator if there are timed events
      if (timedEvents.length > 0) {
        const separator = new Gtk.Separator({
          orientation: Gtk.Orientation.HORIZONTAL,
          css_classes: ["calendar-separator"],
        });
        eventsBox.append(separator);
      }
    }

    // Add timed events section
    if (timedEvents.length > 0) {
      const timedSection = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        css_classes: ["calendar-section", "timed-section"],
      });

      for (const event of timedEvents) {
        const eventWidget = createTimedEventWidget(event);
        timedSection.append(eventWidget);
      }

      eventsBox.append(timedSection);
    }

    // Update status
    const total = events.length;
    statusLabel.set_label(`${total} event${total !== 1 ? "s" : ""}`);
  }

  // Subscribe to calendar updates
  const unsubscribe = service.subscribe(updateView);

  // Cleanup on destroy
  container.connect("destroy", () => {
    unsubscribe();
  });

  return container;
}
