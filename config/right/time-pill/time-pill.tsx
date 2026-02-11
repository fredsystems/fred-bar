// time-pill.tsx

import GLib from "gi://GLib?version=2.0";
import Gtk from "gi://Gtk?version=4.0";
import { Astal } from "ags/gtk4";
import type Cairo from "cairo";
import { setupBackdrop } from "helpers/backdrop";
import { attachTooltip } from "helpers/tooltip";
import { getWindowManager } from "services/window-manager";
import { CalendarView } from "./calendar-view";

type WorldClock = {
  label: string;
  tzid: string;
};

const CLOCKS: WorldClock[] = [
  { label: "Local", tzid: "" },
  { label: "UTC", tzid: "UTC" },
  { label: "New York", tzid: "America/New_York" },
  { label: "London", tzid: "Europe/London" },
  { label: "Tokyo", tzid: "Asia/Tokyo" },
];

function nowIn(tzid: string): GLib.DateTime | null {
  try {
    if (!tzid) return GLib.DateTime.new_now_local();
    return GLib.DateTime.new_now(GLib.TimeZone.new(tzid));
  } catch {
    return null;
  }
}

export function TimePill(): Gtk.Button {
  const windowManager = getWindowManager();
  let hovered = false;
  let expanded = false;
  let windowOpen = false;

  /* ───────── Button ───────── */

  const button = new Gtk.Button({
    css_classes: ["time-pill", "pill"],
    focusable: false,
  });

  button.set_has_frame(false);
  button.remove_css_class("button");

  /* ───────── Labels ───────── */

  const shortLabel = new Gtk.Label({
    css_classes: ["time-label", "time-short"],
    xalign: 0.5,
  });

  shortLabel.set_max_width_chars(8);

  const longLabel = new Gtk.Label({
    css_classes: ["time-label", "time-long"],
    xalign: 0.5,
  });

  /* ───────── Revealer (the important part) ───────── */

  const revealer = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.SLIDE_RIGHT,
    transition_duration: 180, // match your CSS transition vibe
    reveal_child: false,
    hexpand: false,
  });

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 0,
    valign: Gtk.Align.CENTER,
  });

  box.append(shortLabel);
  revealer.set_child(longLabel);
  box.append(revealer);

  button.set_child(box);

  /* ───────── Window ───────── */

  const { TOP, RIGHT } = Astal.WindowAnchor;

  const timeWindow = (
    <window
      name="time-pill-calendar"
      visible={false}
      anchor={TOP | RIGHT}
      class="time-window"
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
    />
  ) as unknown as Gtk.Window;

  const popRoot = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["time-popover"],
  });

  popRoot.set_hexpand(true);
  popRoot.set_vexpand(true);
  popRoot.set_halign(Gtk.Align.FILL);
  popRoot.set_valign(Gtk.Align.FILL);
  timeWindow.set_child(popRoot);

  const title = new Gtk.Label({
    label: "World Clocks",
    css_classes: ["time-popover-title"],
    xalign: 0.0,
  });

  const clocksGrid = new Gtk.Grid({
    column_spacing: 8,
    row_spacing: 8,
    column_homogeneous: true,
  });

  popRoot.append(title);
  popRoot.append(clocksGrid);

  const clockDrawingAreas = new Map<string, Gtk.DrawingArea>();
  const clockBoxes = new Map<string, Gtk.Box>();

  let clockIndex = 0;

  function drawAnalogClock(
    _area: Gtk.DrawingArea,
    cr: Cairo.Context,
    width: number,
    height: number,
    dt: GLib.DateTime | null,
    isDay: boolean,
  ) {
    if (!dt) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 4;

    // Background circle
    cr.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    if (isDay) {
      cr.setSourceRGBA(0.976, 0.886, 0.686, 0.2); // Yellow with transparency
    } else {
      cr.setSourceRGBA(0.537, 0.706, 0.98, 0.2); // Blue with transparency
    }
    cr.fillPreserve();

    // Border
    if (isDay) {
      cr.setSourceRGBA(0.976, 0.886, 0.686, 0.8); // Yellow
    } else {
      cr.setSourceRGBA(0.455, 0.78, 0.925, 0.8); // Sapphire
    }
    cr.setLineWidth(2);
    cr.stroke();

    // Hour marks
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6 - Math.PI / 2;
      const x1 = centerX + Math.cos(angle) * (radius - 8);
      const y1 = centerY + Math.sin(angle) * (radius - 8);
      const x2 = centerX + Math.cos(angle) * (radius - 3);
      const y2 = centerY + Math.sin(angle) * (radius - 3);

      cr.moveTo(x1, y1);
      cr.lineTo(x2, y2);
      cr.setSourceRGBA(0.804, 0.839, 0.957, 0.6); // Text color dimmed
      cr.setLineWidth(2);
      cr.stroke();
    }

    const hour = dt.get_hour() % 12;
    const minute = dt.get_minute();
    const second = dt.get_second();

    // Hour hand
    const hourAngle = ((hour + minute / 60) * Math.PI) / 6 - Math.PI / 2;
    cr.moveTo(centerX, centerY);
    cr.lineTo(
      centerX + Math.cos(hourAngle) * (radius * 0.5),
      centerY + Math.sin(hourAngle) * (radius * 0.5),
    );
    cr.setSourceRGBA(0.804, 0.839, 0.957, 1); // Text color
    cr.setLineWidth(3);
    cr.stroke();

    // Minute hand
    const minuteAngle = ((minute + second / 60) * Math.PI) / 30 - Math.PI / 2;
    cr.moveTo(centerX, centerY);
    cr.lineTo(
      centerX + Math.cos(minuteAngle) * (radius * 0.7),
      centerY + Math.sin(minuteAngle) * (radius * 0.7),
    );
    cr.setSourceRGBA(0.804, 0.839, 0.957, 1); // Text color
    cr.setLineWidth(2);
    cr.stroke();

    // Second hand
    const secondAngle = (second * Math.PI) / 30 - Math.PI / 2;
    cr.moveTo(centerX, centerY);
    cr.lineTo(
      centerX + Math.cos(secondAngle) * (radius * 0.8),
      centerY + Math.sin(secondAngle) * (radius * 0.8),
    );
    if (isDay) {
      cr.setSourceRGBA(0.976, 0.886, 0.686, 1); // Yellow
    } else {
      cr.setSourceRGBA(0.455, 0.78, 0.925, 1); // Sapphire
    }
    cr.setLineWidth(1);
    cr.stroke();

    // Center dot
    cr.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    cr.setSourceRGBA(0.804, 0.839, 0.957, 1); // Text color
    cr.fill();
  }

  for (const c of CLOCKS) {
    const line = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      hexpand: true,
      css_classes: ["clock-line"],
    });

    const clockArea = new Gtk.DrawingArea({
      content_width: 60,
      content_height: 60,
    });

    clockArea.set_draw_func((area, cr, width, height) => {
      const dt = nowIn(c.tzid);
      const isDay = dt ? isDaytime(dt) : true;
      drawAnalogClock(area, cr, width, height, dt, isDay);
    });

    const label = new Gtk.Label({
      label: c.label,
      xalign: 0.5,
      hexpand: true,
    });

    line.append(clockArea);
    line.append(label);

    const col = clockIndex % 3;
    const row = Math.floor(clockIndex / 3);
    clocksGrid.attach(line, col, row, 1, 1);

    clockDrawingAreas.set(c.tzid, clockArea);
    clockBoxes.set(c.tzid, line);

    // Attach tooltip with live updates
    attachTooltip(line, {
      text: () => {
        const dt = nowIn(c.tzid);
        return dt ? format12Hour(dt) : "--:--";
      },
      updateInterval: 1000, // Update every second
    });

    clockIndex++;
  }

  // Separator between clocks and calendar
  const separator = new Gtk.Separator({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["time-popover-separator"],
  });
  popRoot.append(separator);

  // Calendar view - pass window reference for resizing
  const calendarView = CalendarView(timeWindow);
  popRoot.append(calendarView);

  timeWindow.set_child(popRoot);

  // Create backdrop window for click-outside-to-close
  const _backdrop = setupBackdrop(timeWindow, () => {
    windowManager.hide("time-pill-calendar");
  });

  // Register with window manager and provide deactivation callback
  windowManager.register("time-pill-calendar", timeWindow, () => {
    // When another window opens, collapse the label if window isn't actually open
    if (!windowOpen && expanded) {
      applyExpanded(false);
    }
  });

  // Handle ESC key to close
  const keyController = new Gtk.EventControllerKey();
  keyController.connect("key-pressed", (_ctrl, keyval) => {
    if (keyval === 65307) {
      // ESC key
      windowManager.hide("time-pill-calendar");
      return true;
    }
    return false;
  });
  timeWindow.add_controller(keyController);

  // Handle visibility changes
  timeWindow.connect("notify::visible", () => {
    const wasOpen = windowOpen;
    windowOpen = timeWindow.visible;

    // Only trigger expand/collapse when transitioning from open to closed
    if (wasOpen && !timeWindow.visible) {
      if (hovered) scheduleExpand();
      else scheduleCollapse();
    }
  });

  /* ───────── Helpers ───────── */

  function applyExpanded(next: boolean) {
    if (windowOpen) return;

    if (expanded === next) return;
    expanded = next;

    revealer.set_reveal_child(expanded);

    if (expanded) button.add_css_class("expanded");
    else button.remove_css_class("expanded");

    updateLabels();
  }

  function ordinal(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 13) {
      return "th";
    }

    switch (n % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  }

  function format12Hour(dt: GLib.DateTime): string {
    const hour = dt.get_hour();
    const minute = dt.get_minute();
    const second = dt.get_second();
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour < 12 ? "AM" : "PM";
    const minStr = minute.toString().padStart(2, "0");
    const secStr = second.toString().padStart(2, "0");
    return `${hour12}:${minStr}:${secStr} ${ampm}`;
  }

  function isDaytime(dt: GLib.DateTime): boolean {
    const hour = dt.get_hour();
    return hour >= 6 && hour < 18;
  }

  function updateLabels() {
    const now = GLib.DateTime.new_now_local();

    // Main clock
    shortLabel.set_label(now.format("%H:%M:%S") ?? "");

    if (expanded) {
      const day = now.get_day_of_month();
      longLabel.set_label(
        `${now.format(" %A, %B")} ${day}${ordinal(day)}, ${now.format("%Y")}`,
      );
    } else {
      longLabel.set_label("");
    }

    // Window clocks
    if (windowOpen) {
      for (const [tzid, area] of clockDrawingAreas.entries()) {
        const dt = nowIn(tzid);

        // Apply day/night styling
        const box = clockBoxes.get(tzid);
        if (box && dt) {
          box.remove_css_class("daytime");
          box.remove_css_class("nighttime");
          box.add_css_class(isDaytime(dt) ? "daytime" : "nighttime");
        }

        // Redraw the clock
        if (area) {
          area.queue_draw();
        }
      }
    }
  }

  /* ───────── Tick ───────── */

  const tickTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    updateLabels();
    return GLib.SOURCE_CONTINUE;
  });

  /* ───────── Hover ───────── */

  const motion = new Gtk.EventControllerMotion();

  motion.connect("enter", () => {
    hovered = true;
    if (windowOpen) return;
    scheduleExpand();
  });

  motion.connect("leave", () => {
    hovered = false;
    if (windowOpen) return;
    scheduleCollapse();
  });

  button.add_controller(motion);

  let expandTimeoutId: number | null = null;
  let collapseTimeoutId: number | null = null;

  const EXPAND_DELAY_MS = 600;
  const COLLAPSE_DELAY_MS = 400;

  function clearTimeoutId(id: number | null): null {
    if (id !== null) GLib.source_remove(id);
    return null;
  }

  function scheduleExpand() {
    expandTimeoutId = clearTimeoutId(expandTimeoutId);
    collapseTimeoutId = clearTimeoutId(collapseTimeoutId);

    expandTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      EXPAND_DELAY_MS,
      () => {
        expandTimeoutId = null;
        if (hovered && !windowOpen) applyExpanded(true);
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  function scheduleCollapse() {
    expandTimeoutId = clearTimeoutId(expandTimeoutId);
    collapseTimeoutId = clearTimeoutId(collapseTimeoutId);

    collapseTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      COLLAPSE_DELAY_MS,
      () => {
        collapseTimeoutId = null;
        if (!hovered && !windowOpen) applyExpanded(false);
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  /* ───────── Click ───────── */

  button.connect("clicked", () => {
    if (windowOpen) {
      windowOpen = false;
      windowManager.hide("time-pill-calendar");
      return;
    }

    // Set state before showing to prevent race conditions
    windowOpen = true;

    // Freeze stack state for window lifetime
    applyExpanded(true);

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      windowManager.show("time-pill-calendar");
      updateLabels();
      return GLib.SOURCE_REMOVE;
    });
  });

  updateLabels();

  /* ───────── Cleanup ───────── */

  (button as Gtk.Widget & { _cleanup?: () => void })._cleanup = () => {
    if (expandTimeoutId !== null) GLib.source_remove(expandTimeoutId);
    if (collapseTimeoutId !== null) GLib.source_remove(collapseTimeoutId);
    if (tickTimeoutId !== null) GLib.source_remove(tickTimeoutId);
  };

  return button;
}
