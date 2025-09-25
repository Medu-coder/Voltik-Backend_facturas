"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseClient = void 0;
const ssr_1 = require("@supabase/ssr");
const supabaseClient = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    return (0, ssr_1.createBrowserClient)(url, anonKey);
};
exports.supabaseClient = supabaseClient;
