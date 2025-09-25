"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
require("server-only");
const supabase_1 = require("./supabase");
function toMeta(meta) {
    if (meta == null)
        return null;
    if (typeof meta === 'string')
        return { message: meta };
    if (typeof meta === 'object')
        return meta;
    return { value: String(meta) };
}
/**
 * Inserts an audit log row into core.audit_logs using the service role client.
 * Never throws; failures are swallowed to avoid impacting request flow.
 */
async function logAudit(params) {
    try {
        const supabase = (0, supabase_1.getAdminClient)();
        const payload = {
            event: params.event,
            entity: params.entity,
            entity_id: params.entity_id ?? null,
            customer_id: params.customer_id ?? null,
            actor_user_id: params.actor_user_id ?? null,
            actor_role: params.actor_role ?? null,
            level: params.level ?? 'info',
            meta: toMeta(params.meta),
        };
        const { error } = await supabase.from('audit_logs').insert(payload);
        if (error) {
            // eslint-disable-next-line no-console
            console.warn('[audit_logs] insert error', error);
        }
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[audit_logs] unexpected error', err);
    }
}
