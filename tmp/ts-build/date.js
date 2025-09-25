"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDate = formatDate;
exports.formatDateRange = formatDateRange;
exports.formatRangeSummary = formatRangeSummary;
exports.parseISODate = parseISODate;
exports.isoDateString = isoDateString;
exports.todayUtc = todayUtc;
exports.startOfMonthUtc = startOfMonthUtc;
exports.shiftRangeByMonths = shiftRangeByMonths;
const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' });
const RANGE_SUMMARY_FORMATTER = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
});
function formatDate(value) {
    const date = coerceDate(value);
    if (!date) {
        return typeof value === 'string' ? value : '—';
    }
    return DATE_FORMATTER.format(date);
}
function formatDateRange(start, end) {
    const from = formatDate(start);
    const to = formatDate(end);
    return `${from} — ${to}`;
}
function formatRangeSummary(start, end) {
    const fromDate = coerceDate(start);
    const toDate = coerceDate(end);
    if (!fromDate || !toDate)
        return '—';
    return `Del ${RANGE_SUMMARY_FORMATTER.format(fromDate)} al ${RANGE_SUMMARY_FORMATTER.format(toDate)}`;
}
function parseISODate(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed.length === 10 ? `${trimmed}T00:00:00Z` : trimmed;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}
function isoDateString(date) {
    return date.toISOString().slice(0, 10);
}
function todayUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfMonthUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function shiftRangeByMonths(range, months) {
    return {
        from: addMonthsUtc(range.from, months),
        to: addMonthsUtc(range.to, months),
    };
}
function coerceDate(value) {
    if (!value)
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    return parseISODate(value);
}
function addMonthsUtc(date, months) {
    const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    base.setUTCMonth(base.getUTCMonth() + months);
    const daysInTarget = daysInUtcMonth(base.getUTCFullYear(), base.getUTCMonth());
    const clampedDay = Math.min(date.getUTCDate(), daysInTarget);
    base.setUTCDate(clampedDay);
    return base;
}
function daysInUtcMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
