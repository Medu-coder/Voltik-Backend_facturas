"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = supabaseAdmin;
// Server-only admin client using service role key
const supabase_js_1 = require("@supabase/supabase-js");
function supabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return (0, supabase_js_1.createClient)(url, serviceKey, { db: { schema: 'core' } });
}
