"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronDown,
} from "@/components/ui/icon";

interface CustomDatePickerProps {
  value?: string; // ISO UTC string, e.g. "2026-10-24T18:00:00Z"
  onChange: (isoString: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["M", "T", "W", "T", "F", "S", "S"];

// Generates 15-minute time intervals across 24 hours: "12:00 AM" to "11:45 PM"
function generateTimeOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = h.toString().padStart(2, "0");
      const mm = m.toString().padStart(2, "0");
      const timeVal = `${hh}:${mm}`;
      const period = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const displayM = mm;
      options.push({
        label: `${displayH}:${displayM} ${period}`,
        value: timeVal,
      });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

export function formatFriendlyDate(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = targetDay.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Format time (e.g. "6:00 PM")
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const timeStr = `${displayHours}:${minutes} ${period}`;

  // Month & Day (e.g. "Oct 24")
  const monthStr = date.toLocaleDateString("en-US", { month: "short" });
  const dayNum = date.getDate();

  if (diffDays === 0) {
    return `Today · ${timeStr}`;
  }
  if (diffDays === 1) {
    return `Tomorrow, ${monthStr} ${dayNum} · ${timeStr}`;
  }

  // e.g. "Fri, Oct 30 · 6:00 PM"
  const weekdayStr = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekdayStr}, ${monthStr} ${dayNum} · ${timeStr}`;
}

export function CustomDatePicker({
  value,
  onChange,
  placeholder = "Select deadline",
  disabled = false,
  className = "",
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);

  // Parse current selected date or fallback to default
  const parsedDate = value ? new Date(value) : null;
  const validParsed = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

  // Internal state for calendar navigation
  const [viewYear, setViewYear] = useState<number>(
    validParsed ? validParsed.getFullYear() : new Date().getFullYear()
  );
  const [viewMonth, setViewMonth] = useState<number>(
    validParsed ? validParsed.getMonth() : new Date().getMonth()
  );

  // Selected date components
  const [selectedYear, setSelectedYear] = useState<number | null>(
    validParsed ? validParsed.getFullYear() : null
  );
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    validParsed ? validParsed.getMonth() : null
  );
  const [selectedDay, setSelectedDay] = useState<number | null>(
    validParsed ? validParsed.getDate() : null
  );

  // Selected time: default to 18:00 (6:00 PM)
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    if (validParsed) {
      const hh = validParsed.getHours().toString().padStart(2, "0");
      const mm = validParsed.getMinutes().toString().padStart(2, "0");
      return `${hh}:${mm}`;
    }
    return "18:00";
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const timeListRef = useRef<HTMLDivElement>(null);

  // Sync state if external value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedYear(d.getFullYear());
        setSelectedMonth(d.getMonth());
        setSelectedDay(d.getDate());
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        const hh = d.getHours().toString().padStart(2, "0");
        const mm = d.getMinutes().toString().padStart(2, "0");
        setSelectedTime(`${hh}:${mm}`);
      }
    }
  }, [value]);

  // Click outside listener to close picker
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setTimeDropdownOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Scroll time dropdown to selected item when opened
  useEffect(() => {
    if (timeDropdownOpen && timeListRef.current) {
      const activeEl = timeListRef.current.querySelector("[data-selected='true']");
      if (activeEl) {
        (activeEl as HTMLElement).scrollIntoView({ block: "center" });
      }
    }
  }, [timeDropdownOpen]);

  // Commit selected date + time into ISO UTC string
  function commitSelection(year: number, month: number, day: number, timeStr: string) {
    const [h, m] = timeStr.split(":").map(Number);
    // Construct in local viewer time, then convert to UTC ISO string
    const localDate = new Date(year, month, day, h, m, 0, 0);
    onChange(localDate.toISOString());
  }

  // Handle day click
  function handleSelectDay(day: number) {
    setSelectedYear(viewYear);
    setSelectedMonth(viewMonth);
    setSelectedDay(day);
    commitSelection(viewYear, viewMonth, day, selectedTime);
  }

  // Handle time change
  function handleSelectTime(timeVal: string) {
    setSelectedTime(timeVal);
    setTimeDropdownOpen(false);
    if (selectedYear !== null && selectedMonth !== null && selectedDay !== null) {
      commitSelection(selectedYear, selectedMonth, selectedDay, timeVal);
    } else {
      // If no day picked yet, default to Tomorrow or Today
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      setSelectedYear(tomorrow.getFullYear());
      setSelectedMonth(tomorrow.getMonth());
      setSelectedDay(tomorrow.getDate());
      commitSelection(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), timeVal);
    }
  }

  // Quick chips
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
  const daysUntilNextMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilNextMon);

  function isChipActive(targetDate: Date): boolean {
    if (selectedYear === null || selectedMonth === null || selectedDay === null) return false;
    return (
      selectedYear === targetDate.getFullYear() &&
      selectedMonth === targetDate.getMonth() &&
      selectedDay === targetDate.getDate()
    );
  }

  function handleSelectChip(targetDate: Date) {
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();
    const d = targetDate.getDate();
    setSelectedYear(y);
    setSelectedMonth(m);
    setSelectedDay(d);
    setViewYear(y);
    setViewMonth(m);
    commitSelection(y, m, d, selectedTime);
  }

  // Month navigation
  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  }

  // Calculate calendar grid for viewYear, viewMonth (Monday start)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday = 0, Tuesday = 1, ... Sunday = 6
  const startDayIndex = (firstDayOfMonth.getDay() + 6) % 7;

  // Calendar cells
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < startDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setTimeDropdownOpen(false);
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (selectedDay !== null) {
        const prevDate = new Date(selectedYear || viewYear, selectedMonth || viewMonth, selectedDay - 1);
        if (prevDate >= today) {
          handleSelectChip(prevDate);
        }
      } else {
        handleSelectChip(today);
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (selectedDay !== null) {
        const nextDate = new Date(selectedYear || viewYear, selectedMonth || viewMonth, selectedDay + 1);
        handleSelectChip(nextDate);
      } else {
        handleSelectChip(today);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (selectedDay !== null) {
        const prevWeek = new Date(selectedYear || viewYear, selectedMonth || viewMonth, selectedDay - 7);
        if (prevWeek >= today) {
          handleSelectChip(prevWeek);
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (selectedDay !== null) {
        const nextWeek = new Date(selectedYear || viewYear, selectedMonth || viewMonth, selectedDay + 7);
        handleSelectChip(nextWeek);
      } else {
        handleSelectChip(today);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      setIsOpen(false);
    }
  }

  const friendlyDisplay = formatFriendlyDate(value);
  const currentTimeOption = TIME_OPTIONS.find((t) => t.value === selectedTime) || {
    label: "6:00 PM",
    value: "18:00",
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Field */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`h-11 w-full rounded-[10px] bg-[var(--input)] border px-3.5 flex items-center justify-between text-[14px] text-white transition-all text-left select-none ${
          isOpen
            ? "border-[#4876F3] ring-1 ring-[#4876F3]"
            : "border-[var(--border)] hover:border-[var(--border-strong)]"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <CalendarIcon size={16} className="text-[var(--text-3)] shrink-0" />
          <span className={friendlyDisplay ? "text-white truncate" : "text-[var(--text-3)] truncate"}>
            {friendlyDisplay || placeholder}
          </span>
        </div>
      </button>

      {/* Connected Dropdown Date Picker Popover */}
      {isOpen && (
        <div
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="absolute top-full mt-1.5 left-0 w-full rounded-[16px] bg-[#161618] border border-[var(--border)] p-3.5 shadow-xl z-50 text-[13px] animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          {/* Quick Chips Row */}
          <div className="flex items-center gap-1.5 mb-3.5">
            <button
              type="button"
              onClick={() => handleSelectChip(today)}
              className={`flex-1 py-1.5 px-3 rounded-full text-[13px] font-medium transition-colors text-center ${
                isChipActive(today)
                  ? "bg-[#4876F3] text-white"
                  : "bg-[var(--input)] text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)]"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleSelectChip(tomorrow)}
              className={`flex-1 py-1.5 px-3 rounded-full text-[13px] font-medium transition-colors text-center ${
                isChipActive(tomorrow)
                  ? "bg-[#4876F3] text-white"
                  : "bg-[var(--input)] text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)]"
              }`}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => handleSelectChip(nextMonday)}
              className={`flex-1 py-1.5 px-3 rounded-full text-[13px] font-medium transition-colors text-center ${
                isChipActive(nextMonday)
                  ? "bg-[#4876F3] text-white"
                  : "bg-[var(--input)] text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)]"
              }`}
            >
              Next Monday
            </button>
          </div>

          {/* Month Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[14px] font-semibold text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                className="h-7 w-7 rounded-[6px] flex items-center justify-center text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next month"
                className="h-7 w-7 rounded-[6px] flex items-center justify-center text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Days of Week Row */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {WEEKDAY_NAMES.map((name, i) => (
              <span key={i} className="text-[13px] font-medium text-[var(--text-3)]">
                {name}
              </span>
            ))}
          </div>

          {/* Day Numbers Grid */}
          <div className="grid grid-cols-7 gap-1 text-center mb-4">
            {calendarCells.map((dayNum, idx) => {
              if (dayNum === null) {
                return <div key={`empty-${idx}`} className="h-8 w-8" />;
              }

              const cellDate = new Date(viewYear, viewMonth, dayNum);
              const isPast = cellDate < today;
              const isToday =
                dayNum === today.getDate() &&
                viewMonth === today.getMonth() &&
                viewYear === today.getFullYear();
              const isSelected =
                dayNum === selectedDay &&
                viewMonth === selectedMonth &&
                viewYear === selectedYear;

              let cellClass =
                "h-8 w-8 mx-auto rounded-full flex items-center justify-center text-[13px] transition-all ";

              if (isSelected) {
                cellClass += "bg-[#4876F3] text-white font-semibold shadow-sm";
              } else if (isToday) {
                cellClass +=
                  "border border-white/60 text-white font-medium hover:bg-[var(--hover)] cursor-pointer";
              } else if (isPast) {
                cellClass += "text-[var(--text-3)]/30 cursor-not-allowed pointer-events-none";
              } else {
                cellClass += "text-white hover:bg-[var(--hover)] cursor-pointer";
              }

              return (
                <button
                  key={`day-${dayNum}`}
                  type="button"
                  disabled={isPast}
                  onClick={() => handleSelectDay(dayNum)}
                  className={cellClass}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="h-px bg-[var(--border)] -mx-4 mb-3" />

          {/* Time Selector Row */}
          <div className="flex items-center justify-between relative px-1">
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
              <Clock size={16} className="text-[var(--text-3)]" />
              <span>Time</span>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setTimeDropdownOpen((prev) => !prev)}
                className="h-8 px-3 rounded-[8px] bg-[var(--input)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[13px] font-medium text-white flex items-center gap-2 transition-colors"
              >
                <span>{currentTimeOption.label}</span>
                <ChevronDown size={14} className="text-[var(--text-3)]" />
              </button>

              {/* Time Dropdown Menu connected to bottom */}
              {timeDropdownOpen && (
                <div
                  ref={timeListRef}
                  className="absolute bottom-full mb-1.5 right-0 w-32 max-h-48 overflow-y-auto rounded-[10px] bg-[var(--panel-raised)] border border-[var(--border)] py-1 shadow-xl z-50 text-[13px]"
                >
                  {TIME_OPTIONS.map((opt) => {
                    const isSelected = opt.value === selectedTime;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-selected={isSelected}
                        onClick={() => handleSelectTime(opt.value)}
                        className={`w-full px-3 py-1.5 text-left text-[13px] transition-colors flex items-center justify-between ${
                          isSelected
                            ? "bg-[#4876F3] text-white font-semibold"
                            : "text-white hover:bg-[var(--hover)]"
                        }`}
                      >
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
