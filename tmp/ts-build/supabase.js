"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.getAdminClient = getAdminClient;
exports.getBrowserClient = getBrowserClient;
exports.verifyJwt = verifyJwt;
exports.getClaimsFromAuthHeader = getClaimsFromAuthHeader;
exports.assertAdminFromAuthHeader = assertAdminFromAuthHeader;
exports.requireInternalKey = requireInternalKey;
// Next.js server-only module: Supabase clients and auth helpers
require("server-only");
const supabase_js_1 = require("@supabase/supabase-js");
const jose_1 = require("jose");
// Lightweight HTTP error for guards
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}
exports.HttpError = HttpError;
let _adminClient = null;
let _anonClient = null;
function getAdminClient() {
    if (_adminClient)
        return _adminClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    }
    _adminClient = (0, supabase_js_1.createClient)(url, serviceKey, {
        auth: { persistSession: false },
        db: { schema: 'core' }
    });
    return _adminClient;
}
function getBrowserClient() {
    if (_anonClient)
        return _anonClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars');
    }
    _anonClient = (0, supabase_js_1.createClient)(url, anonKey, {
        auth: { persistSession: false }
    });
    return _anonClient;
}
function getJwtSecretKey() {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret)
        throw new Error('Missing SUPABASE_JWT_SECRET env var');
    // Try base64 decode first (typical for Supabase), fallback to raw text
    try {
        return new Uint8Array(Buffer.from(secret, 'base64'));
    }
    catch {
        return new TextEncoder().encode(secret);
    }
}
function parseBearer(authorization) {
    if (!authorization)
        return null;
    const [scheme, token] = authorization.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer')
        return null;
    return token;
}
async function verifyJwt(token) {
    const secret = getJwtSecretKey();
    const { payload } = await (0, jose_1.jwtVerify)(token, secret);
    return payload;
}
async function getClaimsFromAuthHeader(req) {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || undefined;
    const token = parseBearer(auth);
    if (!token)
        return null;
    try {
        return await verifyJwt(token);
    }
    catch {
        return null;
    }
}
async function assertAdminFromAuthHeader(req) {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || undefined;
    const token = parseBearer(auth);
    if (!token)
        throw new HttpError(401, 'Missing or invalid Authorization header');
    let claims;
    try {
        claims = await verifyJwt(token);
    }
    catch (e) {
        throw new HttpError(401, 'Invalid token');
    }
    const isAdmin = claims.app_metadata?.role === 'admin' || claims.admin === true;
    if (!isAdmin)
        throw new HttpError(403, 'Admin privileges required');
    return claims;
}
function requireInternalKey(req) {
    const configured = process.env.INTERNAL_API_SECRET;
    if (!configured)
        throw new Error('Missing INTERNAL_API_SECRET env var');
    const provided = req.headers.get('x-internal-key') || req.headers.get('X-Internal-Key');
    if (!provided || provided !== configured) {
        throw new HttpError(403, 'Invalid internal key');
    }
}
