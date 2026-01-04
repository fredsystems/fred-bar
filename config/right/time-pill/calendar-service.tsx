// calendar-service.tsx

import Gio from "gi://Gio";
import GLib from "gi://GLib";

const CALENDAR_API_URL = "http://localhost:5090/api/get_today_calendars";
const RETRY_INTERVAL_MS = 60000; // 1 minute when API is unavailable
const UPDATE_INTERVAL_MS = 900000; // 15 minutes when API is available

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  calendar_name: string;
  calendar_url: string;
  calendar_color?: string;
  all_day: boolean;
  rrule?: string;
  status?: string;
  etag?: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  last_sync?: string;
}

type CalendarUpdateCallback = (data: CalendarData | null) => void;

export class CalendarService {
  private data: CalendarData | null = null;
  private callbacks: Set<CalendarUpdateCallback> = new Set();
  private timeoutId: number | null = null;
  private isApiAvailable = false;

  constructor() {
    // Start fetching immediately
    this.fetchCalendarData();
  }

  /**
   * Subscribe to calendar updates
   */
  public subscribe(callback: CalendarUpdateCallback): () => void {
    this.callbacks.add(callback);

    // Immediately call with current data
    callback(this.data);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get current calendar data
   */
  public getData(): CalendarData | null {
    return this.data;
  }

  /**
   * Fetch calendar data from the API
   */
  private fetchCalendarData(): void {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this.performFetch();
      return GLib.SOURCE_REMOVE;
    });
  }

  private performFetch(): void {
    try {
      const file = Gio.File.new_for_uri(CALENDAR_API_URL);

      file.load_contents_async(null, (source, result) => {
        try {
          if (!source) {
            this.handleFetchError("Source is null");
            return;
          }

          const [success, contents] = source.load_contents_finish(result);

          if (success && contents) {
            const decoder = new TextDecoder("utf-8");
            const jsonText = decoder.decode(contents);
            const data = JSON.parse(jsonText) as CalendarData;

            // Successfully fetched data
            this.data = data;
            this.isApiAvailable = true;
            this.notifyCallbacks();

            // Schedule next update with longer interval
            this.scheduleNextFetch(UPDATE_INTERVAL_MS);
          } else {
            this.handleFetchError("Failed to load contents");
          }
        } catch (error) {
          this.handleFetchError(`Parse error: ${error}`);
        }
      });
    } catch (error) {
      this.handleFetchError(`Fetch error: ${error}`);
    }
  }

  private handleFetchError(message: string): void {
    console.warn(`[CalendarService] ${message}`);

    if (this.isApiAvailable) {
      // API was available but failed - might be temporary
      // Keep existing data but retry sooner
      this.scheduleNextFetch(RETRY_INTERVAL_MS);
    } else {
      // API not yet available - retry frequently
      this.data = null;
      this.notifyCallbacks();
      this.scheduleNextFetch(RETRY_INTERVAL_MS);
    }
  }

  private scheduleNextFetch(intervalMs: number): void {
    // Clear existing timeout
    if (this.timeoutId !== null) {
      GLib.source_remove(this.timeoutId);
    }

    // Schedule next fetch
    this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
      this.timeoutId = null;
      this.fetchCalendarData();
      return GLib.SOURCE_REMOVE;
    });
  }

  private notifyCallbacks(): void {
    for (const callback of this.callbacks) {
      try {
        callback(this.data);
      } catch (error) {
        console.error("[CalendarService] Error in callback:", error);
      }
    }
  }

  /**
   * Manually refresh calendar data
   */
  public refresh(): void {
    this.fetchCalendarData();
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.timeoutId !== null) {
      GLib.source_remove(this.timeoutId);
      this.timeoutId = null;
    }
    this.callbacks.clear();
  }
}

// Singleton instance
let instance: CalendarService | null = null;

export function getCalendarService(): CalendarService {
  if (!instance) {
    instance = new CalendarService();
  }
  return instance;
}
