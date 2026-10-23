"use client";

import { useState, useEffect, useCallback } from "react";

export interface TimezoneItem {
  id: string; // IANA name, e.g. "America/Los_Angeles" or "autodetect"
  label: string; // User-friendly label
  region: string;
  cities: string;
}

export const MAIN_TIMEZONES: TimezoneItem[] = [
  // Universal
  {
    id: "UTC",
    label: "UTC / Coordinated Universal Time",
    region: "Universal",
    cities: "UTC, GMT",
  },

  // North America
  {
    id: "America/Los_Angeles",
    label: "Pacific Time (PT)",
    region: "North America",
    cities: "Los Angeles, San Francisco, Seattle, Vancouver",
  },
  {
    id: "America/Denver",
    label: "Mountain Time (MT)",
    region: "North America",
    cities: "Denver, Salt Lake City, Calgary, Edmonton",
  },
  {
    id: "America/Phoenix",
    label: "Arizona (MST, no DST)",
    region: "North America",
    cities: "Phoenix, Tucson, Scottsdale",
  },
  {
    id: "America/Chicago",
    label: "Central Time (CT)",
    region: "North America",
    cities: "Chicago, Dallas, Houston, Austin, Winnipeg",
  },
  {
    id: "America/New_York",
    label: "Eastern Time (ET)",
    region: "North America",
    cities: "New York, Toronto, Miami, Atlanta, Boston, Montreal",
  },
  {
    id: "America/Halifax",
    label: "Atlantic Time (AT)",
    region: "North America",
    cities: "Halifax, Moncton",
  },
  {
    id: "America/Anchorage",
    label: "Alaska Time (AKT)",
    region: "North America",
    cities: "Anchorage, Juneau, Fairbanks",
  },
  {
    id: "Pacific/Honolulu",
    label: "Hawaii Time (HST)",
    region: "North America",
    cities: "Honolulu, Oahu, Maui",
  },

  // Latin & South America
  {
    id: "America/Mexico_City",
    label: "Mexico Central Time (CST)",
    region: "Latin America",
    cities: "Mexico City, Guadalajara, Monterrey",
  },
  {
    id: "America/Bogota",
    label: "Colombia / Peru (COT/PET)",
    region: "Latin America",
    cities: "Bogotá, Medellín, Lima, Quito",
  },
  {
    id: "America/Santiago",
    label: "Chile Time (CLT)",
    region: "Latin America",
    cities: "Santiago, Valparaíso",
  },
  {
    id: "America/Sao_Paulo",
    label: "Brasília Time (BRT)",
    region: "Latin America",
    cities: "São Paulo, Rio de Janeiro, Brasília",
  },
  {
    id: "America/Argentina/Buenos_Aires",
    label: "Argentina Time (ART)",
    region: "Latin America",
    cities: "Buenos Aires, Córdoba, Rosario",
  },

  // Europe & UK
  {
    id: "Europe/London",
    label: "London / Dublin / Lisbon (GMT/BST)",
    region: "Europe & UK",
    cities: "London, Dublin, Lisbon, Edinburgh",
  },
  {
    id: "Europe/Paris",
    label: "Paris / Western Europe (CET/CEST)",
    region: "Europe & UK",
    cities: "Paris, Madrid, Barcelona, Brussels, Amsterdam",
  },
  {
    id: "Europe/Berlin",
    label: "Berlin / Central Europe (CET/CEST)",
    region: "Europe & UK",
    cities: "Berlin, Frankfurt, Rome, Milan, Vienna, Zurich",
  },
  {
    id: "Europe/Athens",
    label: "Athens / Eastern Europe (EET/EEST)",
    region: "Europe & UK",
    cities: "Athens, Helsinki, Bucharest, Sofia, Kyiv",
  },
  {
    id: "Europe/Istanbul",
    label: "Istanbul / Turkey (TRT)",
    region: "Europe & UK",
    cities: "Istanbul, Ankara, Izmir",
  },
  {
    id: "Europe/Moscow",
    label: "Moscow Standard Time (MSK)",
    region: "Europe & UK",
    cities: "Moscow, Saint Petersburg",
  },

  // Middle East & Africa
  {
    id: "Asia/Dubai",
    label: "Gulf Standard Time (GST)",
    region: "Middle East & Africa",
    cities: "Dubai, Abu Dhabi, Muscat",
  },
  {
    id: "Asia/Riyadh",
    label: "Arabia Standard Time (AST)",
    region: "Middle East & Africa",
    cities: "Riyadh, Jeddah, Kuwait City, Doha",
  },
  {
    id: "Asia/Jerusalem",
    label: "Israel Time (IDT/IST)",
    region: "Middle East & Africa",
    cities: "Jerusalem, Tel Aviv, Haifa",
  },
  {
    id: "Africa/Cairo",
    label: "Cairo Time (EET)",
    region: "Middle East & Africa",
    cities: "Cairo, Alexandria, Giza",
  },
  {
    id: "Africa/Johannesburg",
    label: "South Africa Time (SAST)",
    region: "Middle East & Africa",
    cities: "Johannesburg, Cape Town, Durban, Pretoria",
  },
  {
    id: "Africa/Lagos",
    label: "West Africa Time (WAT)",
    region: "Middle East & Africa",
    cities: "Lagos, Abuja, Accra",
  },
  {
    id: "Africa/Nairobi",
    label: "East Africa Time (EAT)",
    region: "Middle East & Africa",
    cities: "Nairobi, Addis Ababa, Kampala",
  },
  {
    id: "Africa/Casablanca",
    label: "Morocco Time (WET/WEST)",
    region: "Middle East & Africa",
    cities: "Casablanca, Rabat, Marrakech",
  },

  // South & Central Asia
  {
    id: "Asia/Kolkata",
    label: "India Standard Time (IST)",
    region: "South Asia",
    cities: "Mumbai, New Delhi, Bengaluru, Hyderabad, Chennai",
  },
  {
    id: "Asia/Karachi",
    label: "Pakistan Standard Time (PKT)",
    region: "South Asia",
    cities: "Karachi, Lahore, Islamabad",
  },
  {
    id: "Asia/Dhaka",
    label: "Bangladesh Standard Time (BST)",
    region: "South Asia",
    cities: "Dhaka, Chittagong",
  },
  {
    id: "Asia/Kathmandu",
    label: "Nepal Time (NPT)",
    region: "South Asia",
    cities: "Kathmandu, Pokhara",
  },

  // East & Southeast Asia
  {
    id: "Asia/Bangkok",
    label: "Indochina Time (ICT)",
    region: "East & Southeast Asia",
    cities: "Bangkok, Hanoi, Ho Chi Minh City, Jakarta",
  },
  {
    id: "Asia/Singapore",
    label: "Singapore Standard Time (SGT)",
    region: "East & Southeast Asia",
    cities: "Singapore, Kuala Lumpur",
  },
  {
    id: "Asia/Hong_Kong",
    label: "Hong Kong Time (HKT)",
    region: "East & Southeast Asia",
    cities: "Hong Kong, Macau",
  },
  {
    id: "Asia/Shanghai",
    label: "China Standard Time (CST)",
    region: "East & Southeast Asia",
    cities: "Beijing, Shanghai, Shenzhen, Guangzhou",
  },
  {
    id: "Asia/Tokyo",
    label: "Japan Standard Time (JST)",
    region: "East & Southeast Asia",
    cities: "Tokyo, Osaka, Kyoto, Yokohama",
  },
  {
    id: "Asia/Seoul",
    label: "Korea Standard Time (KST)",
    region: "East & Southeast Asia",
    cities: "Seoul, Busan, Incheon",
  },
  {
    id: "Asia/Manila",
    label: "Philippine Time (PHT)",
    region: "East & Southeast Asia",
    cities: "Manila, Quezon City, Cebu",
  },
  {
    id: "Asia/Taipei",
    label: "Taipei Standard Time (CST)",
    region: "East & Southeast Asia",
    cities: "Taipei, Kaohsiung",
  },

  // Australia & Pacific
  {
    id: "Australia/Perth",
    label: "Western Australia (AWST)",
    region: "Australia & Pacific",
    cities: "Perth, Fremantle",
  },
  {
    id: "Australia/Adelaide",
    label: "South Australia (ACST/ACDT)",
    region: "Australia & Pacific",
    cities: "Adelaide",
  },
  {
    id: "Australia/Sydney",
    label: "Eastern Australia (AEST/AEDT)",
    region: "Australia & Pacific",
    cities: "Sydney, Melbourne, Canberra, Hobart",
  },
  {
    id: "Australia/Brisbane",
    label: "Queensland (AEST, no DST)",
    region: "Australia & Pacific",
    cities: "Brisbane, Gold Coast, Cairns",
  },
  {
    id: "Pacific/Auckland",
    label: "New Zealand (NZST/NZDT)",
    region: "Australia & Pacific",
    cities: "Auckland, Wellington, Christchurch",
  },
  {
    id: "Pacific/Fiji",
    label: "Fiji Time (FJT)",
    region: "Australia & Pacific",
    cities: "Suva, Nadi",
  },
  {
    id: "Pacific/Guam",
    label: "Guam / Chamorro (ChST)",
    region: "Australia & Pacific",
    cities: "Guam, Saipan",
  },
];

export const TIMEZONE_STORAGE_KEY = "playhead_user_timezone";
export const TIMEZONE_EVENT_NAME = "playhead_timezone_changed";

/**
 * Gets the browser's automatically detected timezone.
 */
export function getDetectedTimezone(): string {
  if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) return resolved;
    } catch {
      // fallback
    }
  }
  return "UTC";
}

/**
 * Returns the saved timezone preference or "autodetect" by default.
 */
export function getSavedTimezonePreference(): string {
  if (typeof window === "undefined") return "autodetect";
  try {
    const val = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    return val || "autodetect";
  } catch {
    return "autodetect";
  }
}

/**
 * Sets and broadcasts the user timezone preference.
 */
export function setSavedTimezonePreference(tz: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
    window.dispatchEvent(new CustomEvent(TIMEZONE_EVENT_NAME, { detail: tz }));
  } catch {
    // ignore
  }
}

/**
 * Resolves the effective IANA timezone string (resolves "autodetect" to system timezone).
 */
export function resolveEffectiveTimezone(preference?: string): string {
  const pref = preference || getSavedTimezonePreference();
  if (!pref || pref === "autodetect") {
    return getDetectedTimezone();
  }
  return pref;
}

/**
 * Returns formatted GMT offset, e.g. "GMT-7", "GMT+5:30", "GMT+0"
 */
export function getTimezoneOffsetString(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart ? tzPart.value : "GMT";
  } catch {
    return "GMT";
  }
}

/**
 * Returns short abbreviation, e.g. "PDT", "IST", "EDT", "UTC"
 */
export function getTimezoneAbbr(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart ? tzPart.value : "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Formats a clean badge string without duplicating offset (e.g. "PDT · GMT-7" or "GMT+5:30")
 */
export function formatTimezoneBadge(timeZone: string, date: Date = new Date()): string {
  const offset = getTimezoneOffsetString(timeZone, date);
  const abbr = getTimezoneAbbr(timeZone, date);
  if (!abbr || abbr === offset || abbr.startsWith("GMT") || abbr.startsWith("UTC")) {
    return offset;
  }
  return `${abbr} · ${offset}`;
}

/**
 * Formats a user-friendly label for a timezone
 */
export function getTimezoneFullLabel(tzId: string): string {
  if (tzId === "autodetect") {
    const detected = getDetectedTimezone();
    const badge = formatTimezoneBadge(detected);
    return `Autodetect (${detected} · ${badge})`;
  }

  const found = MAIN_TIMEZONES.find((t) => t.id === tzId);
  const badge = formatTimezoneBadge(tzId);
  if (found) {
    return `${found.label} (${badge})`;
  }
  return `${tzId} (${badge})`;
}

/**
 * React hook to observe and update user timezone preference across components.
 */
export function useUserTimezone() {
  const [preference, setPreference] = useState<string>("autodetect");
  const [detected, setDetected] = useState<string>("UTC");

  useEffect(() => {
    setDetected(getDetectedTimezone());
    setPreference(getSavedTimezonePreference());

    function handleUpdate(e: any) {
      if (e?.detail) {
        setPreference(e.detail);
      } else {
        setPreference(getSavedTimezonePreference());
      }
    }

    function handleStorage(e: StorageEvent) {
      if (e.key === TIMEZONE_STORAGE_KEY) {
        setPreference(e.newValue || "autodetect");
      }
    }

    window.addEventListener(TIMEZONE_EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(TIMEZONE_EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const effectiveTimezone = preference === "autodetect" ? detected : preference;
  const isAutodetect = preference === "autodetect";

  const changeTimezone = useCallback((newTz: string) => {
    setSavedTimezonePreference(newTz);
    setPreference(newTz);
  }, []);

  return {
    preference,
    effectiveTimezone,
    detectedTimezone: detected,
    isAutodetect,
    setTimezone: changeTimezone,
  };
}

/**
 * Helper to get the offset difference in milliseconds between UTC and wall-time in a given timezone.
 */
function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    parts.forEach((p) => {
      map[p.type] = p.value;
    });
    const targetUtcMs = Date.UTC(
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      parseInt(map.hour, 10),
      parseInt(map.minute, 10),
      parseInt(map.second, 10)
    );
    return targetUtcMs - date.getTime();
  } catch {
    return 0;
  }
}

/**
 * Converts wall-clock date components (year, month 0-11, day, hour 0-23, minute 0-59)
 * in a specified IANA timezone into an exact UTC Date.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const wallUtcMs = Date.UTC(year, month, day, hour, minute, 0);
  const testDate = new Date(wallUtcMs);
  const offsetMs = getTimezoneOffsetMs(testDate, timeZone);
  const actualUtcMs = wallUtcMs - offsetMs;
  const refinedOffsetMs = getTimezoneOffsetMs(new Date(actualUtcMs), timeZone);
  return new Date(wallUtcMs - refinedOffsetMs);
}

/**
 * Extracts wall-clock date components (year, month 0-11, day, hour 0-23, minute 0-59)
 * for a Date/ISO string when viewed in a specified IANA timezone.
 */
export function getZonedParts(
  dateInput: Date | string,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    parts.forEach((p) => {
      map[p.type] = p.value;
    });
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10) - 1,
      day: parseInt(map.day, 10),
      hour: parseInt(map.hour, 10),
      minute: parseInt(map.minute, 10),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

/**
 * Formats a friendly deadline date string (e.g. "Tomorrow, Oct 24 · 6:00 PM (PDT)")
 * evaluated in the specified timezone.
 */
export function formatFriendlyDateInTimezone(
  isoString?: string,
  targetTimezone?: string
): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const timeZone = resolveEffectiveTimezone(targetTimezone);
  const targetParts = getZonedParts(date, timeZone);
  const nowParts = getZonedParts(new Date(), timeZone);

  // Compare calendar days in target timezone
  const targetDayUtc = Date.UTC(targetParts.year, targetParts.month, targetParts.day);
  const nowDayUtc = Date.UTC(nowParts.year, nowParts.month, nowParts.day);
  const diffDays = Math.round((targetDayUtc - nowDayUtc) / (1000 * 60 * 60 * 24));

  // Time string in 12-hour format
  const hours = targetParts.hour;
  const minutes = targetParts.minute.toString().padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const timeStr = `${displayHours}:${minutes} ${period}`;

  // Month & Day
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthStr = monthNames[targetParts.month] || "Oct";
  const dayNum = targetParts.day;

  // Timezone short code or offset
  const tzAbbr = getTimezoneAbbr(timeZone, date);
  const tzOffset = getTimezoneOffsetString(timeZone, date);
  const tzBadge =
    !tzAbbr || tzAbbr === tzOffset || tzAbbr.startsWith("GMT") || tzAbbr.startsWith("UTC")
      ? tzOffset
      : tzAbbr;

  if (diffDays === 0) {
    return `Today · ${timeStr} (${tzBadge})`;
  }
  if (diffDays === 1) {
    return `Tomorrow, ${monthStr} ${dayNum} · ${timeStr} (${tzBadge})`;
  }

  // Weekday short name
  const dayOfWeekFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const weekdayStr = dayOfWeekFormatter.format(date);

  return `${weekdayStr}, ${monthStr} ${dayNum} · ${timeStr} (${tzBadge})`;
}
