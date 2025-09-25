"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseRoute = exports.supabaseServer = void 0;
const headers_1 = require("next/headers");
const ssr_1 = require("@supabase/ssr");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}
const supabaseServer = () => {
    const cookieStore = (0, headers_1.cookies)();
    return (0, ssr_1.createServerClient)(supabaseUrl, supabaseAnonKey, {
        cookies: {
            get(name) {
                return cookieStore.get(name)?.value;
            },
            set(_name, _value, _options) {
                // no-op on server components (read only)
            },
            remove(_name, _options) {
                // no-op on server components (read only)
            },
        },
    });
};
exports.supabaseServer = supabaseServer;
const supabaseRoute = () => {
    const cookieStore = (0, headers_1.cookies)();
    return (0, ssr_1.createServerClient)(supabaseUrl, supabaseAnonKey, {
        cookies: {
            get(name) {
                return cookieStore.get(name)?.value;
            },
            set(name, value, options) {
                cookieStore.set({ name, value, ...options });
            },
            remove(name, options) {
                cookieStore.delete({ name, ...options });
            },
        },
    });
};
exports.supabaseRoute = supabaseRoute;
