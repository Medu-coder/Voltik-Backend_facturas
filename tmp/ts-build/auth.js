"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
exports.getAdminSession = getAdminSession;
const navigation_1 = require("next/navigation");
const server_1 = require("@/lib/supabase/server");
function isAdminEmail(email) {
    if (!email)
        return false;
    const fromEnv = process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS;
    if (!fromEnv)
        return false;
    const allowed = fromEnv
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    return allowed.includes(email.toLowerCase());
}
function hasAdminRole(session) {
    const role = session?.user?.app_metadata?.role;
    const isAdminFlag = session?.user?.app_metadata?.admin;
    return role === 'admin' || isAdminFlag === true;
}
async function requireAdmin() {
    const supabase = (0, server_1.supabaseServer)();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session)
        (0, navigation_1.redirect)('/login');
    const email = session.user?.email;
    if (!hasAdminRole(session) && !isAdminEmail(email)) {
        (0, navigation_1.redirect)('/login');
    }
    return session;
}
async function getAdminSession() {
    const supabase = (0, server_1.supabaseServer)();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session)
        return null;
    const email = session.user?.email;
    if (!hasAdminRole(session) && !isAdminEmail(email))
        return null;
    return session;
}
