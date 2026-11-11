// Business rules the app runs on. Change values here; screens and logic read from RULES.

export const RULES = {
  /**
   * Staff per hour = ceil(forecast sales ÷ (target SPLH × planningFactor)), with these limits.
   * Minimum coverage and 3h minimum shifts add hours back, so planning above the target lands
   * the day's SPLH close to the target.
   */
  staffingEquation: { minPerHour: 2, twoLeadsFrom: 8, prepShare: 0.3, planningFactor: 1.3 },
  /** Longest working day for one employee (split shifts allowed within it). */
  maxDailyHours: 8,
  /** Employees under 16: daily hour limit, and warnings this many minutes before reaching it. */
  minorHours: { ageUnder: 16, limitHours: 4.5, warningMinutes: [60, 30] },
  /** Employees under 18 need a break of this length before this many continuous hours. */
  minorBreaks: { ageUnder: 18, maxContinuousHours: 5, breakMinutes: 30 },
  /** Recorded breaks are unpaid; shifts this long without a break are flagged. */
  breaks: { unpaid: true, requiredFromHours: 6 },
  /** Schedule changes adding more labor hours than this need District Manager approval. */
  adjustmentApproval: { immediateIfAddedHoursAtMost: 2 },
}
