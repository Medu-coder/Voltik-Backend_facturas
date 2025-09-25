"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureCustomer = ensureCustomer;
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
async function ensureCustomer(admin, { name, email, userId }) {
    const trimmedName = name?.trim() || '';
    const normalizedEmail = normalizeEmail(email || '');
    if (!trimmedName)
        throw new Error('Customer name is required');
    if (!normalizedEmail)
        throw new Error('Customer email is required');
    const { data: matches, error: searchErr } = await admin
        .from('customers')
        .select('id, name, email, user_id')
        .eq('email', normalizedEmail);
    if (searchErr)
        throw new Error(`Customer lookup failed: ${searchErr.message}`);
    const normalizedName = trimmedName.toLowerCase();
    const existing = (matches || []).find((row) => (row.name || '').trim().toLowerCase() === normalizedName);
    if (existing)
        return existing;
    const fallbackUserId = userId || process.env.ADMIN_USER_ID || null;
    if (!fallbackUserId) {
        throw new Error('Missing ADMIN_USER_ID env var to create customers');
    }
    const insertPayload = {
        name: trimmedName,
        email: normalizedEmail,
        user_id: fallbackUserId,
    };
    const { data: created, error: insertErr } = await admin
        .from('customers')
        .insert(insertPayload)
        .select('id, name, email, user_id')
        .single();
    if (insertErr)
        throw new Error(`Customer creation failed: ${insertErr.message}`);
    return created;
}
