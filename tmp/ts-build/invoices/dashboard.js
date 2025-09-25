"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDashboardData = fetchDashboardData;
const date_1 = require("@/lib/date");
const STATUS_CATEGORIES = [
    { key: 'pending', label: 'Pending', matches: ['pending', 'queued', 'reprocess', 'error'] },
    { key: 'processed', label: 'Processed', matches: ['processed'] },
    { key: 'success', label: 'Success', matches: ['done', 'success'] },
];
async function fetchDashboardData(admin, filters) {
    const sanitized = normalizeFilters(filters);
    const previousRange = (0, date_1.shiftRangeByMonths)({ from: sanitized.fromDate, to: sanitized.toDate }, -1);
    const monthSlices = sliceRangeByMonths({ from: sanitized.fromDate, to: sanitized.toDate });
    const previousYearSlices = monthSlices.map((slice) => shiftRangeByYears(slice, -1));
    const [{ data: aggregates, error: aggregatesError }, { data: invoiceRows, error: invoicesError }] = await Promise.all([
        admin.rpc('dashboard_invoice_aggregates', {
            p_from: sanitized.from,
            p_to: sanitized.to,
            p_query: sanitized.q ?? null,
        }),
        buildInvoicesQuery(admin, {
            from: startOfDayUtc(sanitized.fromDate).toISOString(),
            to: endOfDayUtc(sanitized.toDate).toISOString(),
            q: sanitized.q,
        }, { limit: 20 }),
    ]);
    if (aggregatesError)
        throw aggregatesError;
    if (invoicesError)
        throw invoicesError;
    const normalizedInvoices = (invoiceRows || []).map((row) => normalizeInvoiceRow(row));
    const normalizedAggregates = normalizeAggregates(aggregates);
    const deltaRaw = computeDelta(normalizedAggregates.currentTotal, normalizedAggregates.previousTotal);
    const deltaDirection = deltaRaw == null ? 'flat' : deltaRaw > 0 ? 'up' : deltaRaw < 0 ? 'down' : 'flat';
    const dailySeries = buildMonthlySeries(sanitized.fromDate, normalizedAggregates.monthlyBuckets);
    const monthlyComparisons = buildMonthlyComparisons(monthSlices, previousYearSlices, normalizedAggregates.monthlyBuckets);
    const statusBreakdown = buildStatusBreakdown(normalizedAggregates.statusCounts);
    return {
        filters: {
            from: sanitized.from,
            to: sanitized.to,
            q: sanitized.q,
            previousFrom: (0, date_1.isoDateString)(previousRange.from),
            previousTo: (0, date_1.isoDateString)(previousRange.to),
        },
        headerRangeLabel: (0, date_1.formatDateRange)(sanitized.fromDate, sanitized.toDate),
        totalInvoicesCurrent: normalizedAggregates.currentTotal,
        totalInvoicesPrevious: normalizedAggregates.previousTotal,
        deltaVsPrevious: deltaRaw,
        deltaDirection,
        summaryRangeText: (0, date_1.formatRangeSummary)(sanitized.fromDate, sanitized.toDate),
        previousRangeText: (0, date_1.formatRangeSummary)(previousRange.from, previousRange.to),
        dailySeries,
        monthlyComparisons,
        statusBreakdown,
        invoices: normalizedInvoices.map((row) => ({
            id: row.id,
            customer_name: row.customer?.name || row.customer?.email || row.customer?.id || null,
            customer_email: row.customer?.email || null,
            date_start: row.billing_start_date,
            date_end: row.billing_end_date,
            status: row.status,
            total: row.total_amount_eur,
            created_at: row.created_at,
        })),
    };
}
function normalizeFilters(filters) {
    const today = (0, date_1.todayUtc)();
    const defaultFromDate = (0, date_1.startOfMonthUtc)(today);
    const fromDate = filters.from ? (0, date_1.parseISODate)(filters.from) ?? defaultFromDate : defaultFromDate;
    const toDate = filters.to ? (0, date_1.parseISODate)(filters.to) ?? today : today;
    if (fromDate > toDate) {
        return {
            from: (0, date_1.isoDateString)(toDate),
            to: (0, date_1.isoDateString)(toDate),
            q: sanitizeQuery(filters.q),
            fromDate: toDate,
            toDate,
        };
    }
    return {
        from: (0, date_1.isoDateString)(fromDate),
        to: (0, date_1.isoDateString)(toDate),
        q: sanitizeQuery(filters.q),
        fromDate,
        toDate,
    };
}
function sanitizeQuery(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
}
function buildInvoicesQuery(admin, filters, options) {
    let query = admin
        .from('invoices')
        .select('id, created_at, status, total_amount_eur, billing_start_date, billing_end_date, customer:customer_id (id, name, email)')
        .gte('created_at', filters.from)
        .lte('created_at', filters.to)
        .order('created_at', { ascending: false });
    if (filters.q) {
        const like = `%${filters.q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
        query = query.or(`id.ilike.${like},customer.email.ilike.${like},customer.name.ilike.${like}`);
    }
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    return query;
}
function normalizeInvoiceRow(row) {
    return {
        id: row.id,
        created_at: row.created_at ?? null,
        status: row.status ?? null,
        total_amount_eur: row.total_amount_eur ?? null,
        billing_start_date: row.billing_start_date ?? null,
        billing_end_date: row.billing_end_date ?? null,
        customer: row.customer
            ? {
                id: row.customer.id ?? null,
                name: row.customer.name ?? null,
                email: row.customer.email ?? null,
            }
            : null,
    };
}
function normalizeAggregates(raw) {
    const statusCountsRaw = raw?.statusCounts ?? {};
    const bucketsRaw = Array.isArray(raw?.monthlyBuckets) ? raw.monthlyBuckets : [];
    return {
        currentTotal: Number(raw?.currentTotal ?? 0),
        previousTotal: Number(raw?.previousTotal ?? 0),
        statusCounts: {
            pending: Number(statusCountsRaw.pending ?? 0),
            processed: Number(statusCountsRaw.processed ?? 0),
            success: Number(statusCountsRaw.success ?? 0),
        },
        monthlyBuckets: bucketsRaw.map((bucket) => ({
            monthAnchor: bucket.monthAnchor,
            rangeStart: bucket.rangeStart,
            rangeEnd: bucket.rangeEnd,
            currentCount: Number(bucket.currentCount ?? 0),
            previousYearCount: Number(bucket.previousYearCount ?? 0),
        })),
    };
}
function computeDelta(current, previous) {
    if (previous === 0)
        return current === 0 ? 0 : null;
    const delta = ((current - previous) / previous) * 100;
    return Number.isFinite(delta) ? delta : null;
}
function buildMonthlySeries(from, buckets) {
    const year = from.getUTCFullYear();
    const counts = new Array(12).fill(0);
    buckets.forEach((bucket) => {
        const parsed = new Date(bucket.monthAnchor);
        if (Number.isNaN(parsed.getTime()))
            return;
        if (parsed.getUTCFullYear() !== year)
            return;
        counts[parsed.getUTCMonth()] = bucket.currentCount;
    });
    return {
        year,
        labels: MONTH_LABELS,
        counts,
    };
}
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_LONG_FORMATTER = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });
function buildMonthlyComparisons(monthRanges, previousYearRanges, buckets) {
    return monthRanges.map((range, index) => {
        const previousRange = previousYearRanges[index];
        const month = range.from.getUTCMonth();
        const year = range.from.getUTCFullYear();
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        const label = `${MONTH_LABELS[month]} ${year}`;
        const title = `${capitalize(MONTH_LONG_FORMATTER.format(range.from))} ${year}`;
        const bucket = buckets.find((item) => bucketKey(item.monthAnchor) === key);
        const currentCount = bucket?.currentCount ?? 0;
        const previousCount = bucket?.previousYearCount ?? 0;
        return {
            key,
            label,
            title,
            current: {
                year,
                count: currentCount,
                from: (0, date_1.isoDateString)(range.from),
                to: (0, date_1.isoDateString)(range.to),
                rangeLabel: (0, date_1.formatDateRange)(range.from, range.to),
            },
            previous: {
                year: previousRange.from.getUTCFullYear(),
                count: previousCount,
                from: (0, date_1.isoDateString)(previousRange.from),
                to: (0, date_1.isoDateString)(previousRange.to),
                rangeLabel: (0, date_1.formatDateRange)(previousRange.from, previousRange.to),
            },
        };
    });
}
function shiftRangeByYears(range, years) {
    return {
        from: addYearsUtc(range.from, years),
        to: addYearsUtc(range.to, years),
    };
}
function sliceRangeByMonths(range) {
    const slices = [];
    let cursor = startOfDayUtc(range.from);
    const lastDay = startOfDayUtc(range.to);
    while (cursor.getTime() <= lastDay.getTime()) {
        const sliceFrom = cursor;
        const monthEnd = endOfMonthUtc(sliceFrom);
        const rawEnd = monthEnd.getTime() > lastDay.getTime() ? lastDay : monthEnd;
        const sliceTo = startOfDayUtc(rawEnd);
        slices.push({ from: sliceFrom, to: sliceTo });
        cursor = startOfDayUtc(new Date(Date.UTC(sliceFrom.getUTCFullYear(), sliceFrom.getUTCMonth() + 1, 1)));
    }
    return slices;
}
function addYearsUtc(date, years) {
    const year = date.getUTCFullYear() + years;
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const daysInTarget = daysInUtcMonth(year, month);
    const clampedDay = Math.min(day, daysInTarget);
    return new Date(Date.UTC(year, month, clampedDay));
}
function startOfDayUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function endOfDayUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}
function endOfMonthUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}
function daysInUtcMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
function capitalize(value) {
    if (!value)
        return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function bucketKey(anchor) {
    const date = new Date(anchor);
    if (Number.isNaN(date.getTime()))
        return '';
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
function buildStatusBreakdown(counts) {
    const total = counts.pending + counts.processed + counts.success;
    return STATUS_CATEGORIES.map(({ key, label }) => ({
        key,
        label,
        value: counts[key],
        percentage: total === 0 ? 0 : (counts[key] / total) * 100,
    }));
}
