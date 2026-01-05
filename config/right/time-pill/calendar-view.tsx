// calendar-view.tsx

import GLib from "gi://GLib?version=2.0";
import Gtk from "gi://Gtk?version=4.0";
import type { CalendarData, CalendarEvent } from "./calendar-service";
import { getCalendarService } from "./calendar-service";

/**
 * Catppuccin Mocha Color Palette (colorful colors only)
 * Mirrors colors from config/styles/base/_variables.scss
 * Excludes grays (text/overlay/surface) to ensure vibrant color matching
 */
const CATPPUCCIN_COLORS: Record<string, string> = {
  rosewater: "#f5e0dc",
  flamingo: "#f2cdcd",
  pink: "#f5c2e7",
  mauve: "#cba6f7",
  red: "#f38ba8",
  maroon: "#eba0ac",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  sky: "#89dceb",
  sapphire: "#74c7ec",
  blue: "#89b4fa",
  lavender: "#b4befe",
};

/**
 * Parse hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace("#", "");

  if (normalized.length === 6) {
    return {
      r: parseInt(normalized.substring(0, 2), 16),
      g: parseInt(normalized.substring(2, 4), 16),
      b: parseInt(normalized.substring(4, 6), 16),
    };
  }

  if (normalized.length === 8) {
    return {
      r: parseInt(normalized.substring(0, 2), 16),
      g: parseInt(normalized.substring(2, 4), 16),
      b: parseInt(normalized.substring(4, 6), 16),
    };
  }

  return null;
}

/**
 * Convert RGB to HSL color space
 * Returns { h: 0-360, s: 0-100, l: 0-100 }
 */
function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic (gray)
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/**
 * Calculate color distance in HSL space
 * Prioritizes hue matching for vibrant colors, uses luminance for grays
 */
function hslDistance(
  hsl1: { h: number; s: number; l: number },
  hsl2: { h: number; s: number; l: number },
): number {
  // For achromatic colors (low saturation), ignore hue and focus on lightness
  const isAchromatic1 = hsl1.s < 10;
  const isAchromatic2 = hsl2.s < 10;

  if (isAchromatic1 || isAchromatic2) {
    // Match based on lightness for grays
    return Math.abs(hsl1.l - hsl2.l);
  }

  // For colorful colors, prioritize hue, then consider saturation and lightness
  // Hue is circular (0 and 360 are the same)
  let hueDiff = Math.abs(hsl1.h - hsl2.h);
  if (hueDiff > 180) {
    hueDiff = 360 - hueDiff;
  }

  // Weight hue heavily, saturation and lightness less so
  return (
    hueDiff * 2.0 +
    Math.abs(hsl1.s - hsl2.s) * 0.5 +
    Math.abs(hsl1.l - hsl2.l) * 0.5
  );
}

/**
 * Find the closest Catppuccin color to the given color using HSL matching
 */
function findClosestCatppuccinColor(color: string): string {
  // We may want to switch to LAB/LCH color space
  const normalizedInput = normalizeColor(color);
  const inputRgb = hexToRgb(normalizedInput);

  if (!inputRgb) {
    return CATPPUCCIN_COLORS.blue; // Default fallback
  }

  const inputHsl = rgbToHsl(inputRgb.r, inputRgb.g, inputRgb.b);

  let closestColor = CATPPUCCIN_COLORS.blue;
  let _closestName = "blue";
  let minDistance = Infinity;

  for (const [name, hex] of Object.entries(CATPPUCCIN_COLORS)) {
    const ctpRgb = hexToRgb(hex);
    if (!ctpRgb) continue;

    const ctpHsl = rgbToHsl(ctpRgb.r, ctpRgb.g, ctpRgb.b);
    const distance = hslDistance(inputHsl, ctpHsl);

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = hex;
      _closestName = name;
    }
  }

  return closestColor;
}

/**
 * Convert various color formats to 6-digit hex (GTK-compatible)
 * Strips alpha channel as GTK CSS doesn't support it well
 */
function normalizeColor(color: string): string {
  // Handle rgb/rgba format - extract RGB values
  if (color.startsWith("rgb")) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1], 10).toString(16).padStart(2, "0");
      const g = parseInt(match[2], 10).toString(16).padStart(2, "0");
      const b = parseInt(match[3], 10).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
  }

  // Hex format - normalize to 6-digit
  if (color.startsWith("#")) {
    const hex = color.substring(1);

    // 8-digit hex with alpha: #RRGGBBAA -> strip alpha
    if (hex.length === 8) {
      return `#${hex.substring(0, 6)}`;
    }

    // 6-digit hex: #RRGGBB - already good
    if (hex.length === 6) {
      return color;
    }

    // 4-digit hex with alpha: #RGBA -> strip alpha and expand
    if (hex.length === 4) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }

    // 3-digit hex: #RGB -> expand to 6 digits
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
  }

  // Fallback - return as-is
  return color;
}

/**
 * Apply calendar color as inline CSS to a widget
 */
function applyCalendarColor(
  widget: Gtk.Widget,
  color: string | undefined,
): void {
  if (!color) {
    return;
  }

  // Map to closest Catppuccin color
  const ctpColor = findClosestCatppuccinColor(color);

  const cssProvider = new Gtk.CssProvider();
  const css = `.calendar-event { border-left: 3px solid ${ctpColor}; }`;

  try {
    cssProvider.load_from_data(css, -1);
    widget
      .get_style_context()
      .add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
  } catch (error) {
    console.error("Failed to apply CSS:", error);
  }
}

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
 * Format time for display in 24-hour format (e.g., "14:30")
 */
function formatTime(dt: GLib.DateTime): string {
  const hour = dt.get_hour();
  const minute = dt.get_minute();
  const hourStr = hour.toString().padStart(2, "0");
  const minStr = minute.toString().padStart(2, "0");
  return `${hourStr}:${minStr}`;
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

  // Apply calendar color to left border
  applyCalendarColor(box, event.calendar_color);

  const titleLabel = new Gtk.Label({
    label: event.summary || "Untitled Event",
    xalign: 0,
    css_classes: ["event-title"],
    wrap: true,
    wrap_mode: 2, // WORD_CHAR
  });

  box.append(titleLabel);

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

  // Apply calendar color to left border
  applyCalendarColor(box, event.calendar_color);

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

  if (event.location) {
    const locationLabel = new Gtk.Label({
      label: `${event.location}`,
      xalign: 0,
      css_classes: ["event-location"],
      ellipsize: 3, // END
      max_width_chars: 30,
    });
    infoBox.append(locationLabel);
  }

  detailsBox.append(titleLabel);

  if (event.location) {
    detailsBox.append(infoBox);
  }

  box.append(timeLabel);
  box.append(detailsBox);

  return box;
}

/**
 * Format date for header display
 */
function formatHeaderDate(dt: GLib.DateTime | null, isToday: boolean): string {
  if (isToday) {
    return "Today's Events";
  }

  if (!dt) {
    return "Events";
  }

  const now = GLib.DateTime.new_now_local();
  if (!now) return "Events";

  const today = GLib.DateTime.new_local(
    now.get_year(),
    now.get_month(),
    now.get_day_of_month(),
    0,
    0,
    0,
  );
  const targetDate = GLib.DateTime.new_local(
    dt.get_year(),
    dt.get_month(),
    dt.get_day_of_month(),
    0,
    0,
    0,
  );

  if (!today || !targetDate) return "Events";

  // Check if it's tomorrow
  const tomorrow = today.add_days(1);
  if (
    tomorrow &&
    targetDate.get_year() === tomorrow.get_year() &&
    targetDate.get_month() === tomorrow.get_month() &&
    targetDate.get_day_of_month() === tomorrow.get_day_of_month()
  ) {
    return "Tomorrow's Events";
  }

  // Check if it's yesterday
  const yesterday = today.add_days(-1);
  if (
    yesterday &&
    targetDate.get_year() === yesterday.get_year() &&
    targetDate.get_month() === yesterday.get_month() &&
    targetDate.get_day_of_month() === yesterday.get_day_of_month()
  ) {
    return "Yesterday's Events";
  }

  // Format as "Monday, January 5"
  const dayName = dt.format("%A");
  const monthName = dt.format("%B");
  const day = dt.get_day_of_month();
  return `${dayName}, ${monthName} ${day}`;
}

/**
 * Create the calendar view widget
 */
export function CalendarView(timeWindow?: Gtk.Window): Gtk.Box {
  const service = getCalendarService();

  // Main container
  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["calendar-view"],
    visible: true,
    vexpand: true,
  });

  // Header with navigation - top row
  const headerTop = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["calendar-header"],
  });

  // Previous day button
  const prevButton = new Gtk.Button({
    label: "←",
    css_classes: ["calendar-nav-button"],
    focusable: false,
  });

  const headerLabel = new Gtk.Label({
    label: "Today's Events",
    xalign: 0.5,
    hexpand: true,
    css_classes: ["calendar-header-title"],
  });

  // Next day button
  const nextButton = new Gtk.Button({
    label: "→",
    css_classes: ["calendar-nav-button"],
    focusable: false,
  });

  headerTop.append(prevButton);
  headerTop.append(headerLabel);
  headerTop.append(nextButton);

  // Today button and event count in same row using overlay
  const todayButtonRow = new Gtk.Overlay({
    css_classes: ["calendar-today-row"],
    visible: false,
  });

  // Center box for the button
  const centerBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  });

  const todayButton = new Gtk.Button({
    label: "Jump to Today",
    css_classes: ["calendar-today-button"],
    focusable: false,
  });

  centerBox.append(todayButton);
  todayButtonRow.set_child(centerBox);

  // Status label overlaid on the right
  const statusLabel = new Gtk.Label({
    label: "",
    xalign: 1,
    css_classes: ["calendar-status"],
    halign: Gtk.Align.END,
    valign: Gtk.Align.CENTER,
    margin_end: 8,
  });

  todayButtonRow.add_overlay(statusLabel);

  // Scrolled window for events
  const scrolled = new Gtk.ScrolledWindow({
    vexpand: true,
    hexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.NEVER,
    css_classes: ["calendar-scrolled"],
    visible: true,
  });

  // Events container
  const eventsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["calendar-events"],
    visible: true,
    vexpand: true,
  });

  scrolled.set_child(eventsBox);

  container.append(headerTop);
  container.append(todayButtonRow);
  container.append(scrolled);

  // Empty state
  const emptyLabel = new Gtk.Label({
    label: "No events",
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
   * Update header to reflect current date
   */
  function updateHeader(): void {
    const currentDate = service.getCurrentDate();
    const now = GLib.DateTime.new_now_local();

    if (!currentDate || !now) {
      headerLabel.set_label("Events");
      todayButton.set_visible(false);
      return;
    }

    const isToday =
      currentDate.get_year() === now.get_year() &&
      currentDate.get_month() === now.get_month() &&
      currentDate.get_day_of_month() === now.get_day_of_month();

    headerLabel.set_label(formatHeaderDate(currentDate, isToday));
    todayButton.set_visible(!isToday);
    // Always show the row to keep status visible
    todayButtonRow.set_visible(true);
  }

  /**
   * Update the view with new data
   */
  function updateView(data: CalendarData | null): void {
    // Update header to reflect current date
    updateHeader();

    const currentDate = service.getCurrentDate();
    const _dateStr = currentDate ? currentDate.format("%Y-%m-%d") : "unknown";

    // Clear current events
    let child = eventsBox.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      eventsBox.remove(child);
      child = next;
    }

    // Force resize to allow shrinking when content is removed
    eventsBox.set_size_request(-1, -1);
    scrolled.set_size_request(-1, -1);
    container.queue_resize();

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

      const sectionTitle = new Gtk.Label({
        label: "Agenda",
        xalign: 0,
        css_classes: ["section-title"],
      });

      timedSection.append(sectionTitle);

      for (const event of timedEvents) {
        const eventWidget = createTimedEventWidget(event);
        timedSection.append(eventWidget);
      }

      eventsBox.append(timedSection);
    }

    // Update status
    const total = events.length;
    statusLabel.set_label(`${total} event${total !== 1 ? "s" : ""}`);

    // Force window to resize to fit new content
    if (timeWindow) {
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        timeWindow.set_default_size(-1, -1);
        timeWindow.queue_resize();
        container.queue_resize();
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  // Subscribe to calendar updates
  const unsubscribe = service.subscribe(updateView);

  // Navigation button handlers
  prevButton.connect("clicked", () => {
    service.previousDay();
  });

  nextButton.connect("clicked", () => {
    service.nextDay();
  });

  todayButton.connect("clicked", () => {
    service.goToToday();
  });

  // Initial header update
  updateHeader();

  // Cleanup on destroy
  container.connect("destroy", () => {
    unsubscribe();
  });

  return container;
}
