-- Crear tabla de ofertas para facturas
-- Permite asociar múltiples ofertas (PDFs) a cada factura

-- 1. Crear tabla core.offers
CREATE TABLE core.offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    provider_name text NOT NULL,
    storage_object_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offers_pkey PRIMARY KEY (id),
    CONSTRAINT offers_invoice_id_fkey FOREIGN KEY (invoice_id) 
        REFERENCES core.invoices(id) ON DELETE CASCADE
);

-- 2. Crear índices para optimizar consultas
CREATE INDEX idx_offers_invoice_id ON core.offers(invoice_id);
CREATE INDEX idx_offers_created_at ON core.offers(created_at DESC);

-- 3. Crear trigger para updated_at
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offers_set_updated_at
    BEFORE UPDATE ON core.offers
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();

-- 4. Crear políticas RLS (solo admin puede acceder)
ALTER TABLE core.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY offers_admin_read ON core.offers
    FOR SELECT
    USING (core.is_admin());

CREATE POLICY offers_admin_insert ON core.offers
    FOR INSERT
    WITH CHECK (core.is_admin());

CREATE POLICY offers_admin_update ON core.offers
    FOR UPDATE
    USING (core.is_admin())
    WITH CHECK (core.is_admin());

CREATE POLICY offers_admin_delete ON core.offers
    FOR DELETE
    USING (core.is_admin());

-- 5. Comentarios para documentación
COMMENT ON TABLE core.offers IS 'Ofertas asociadas a facturas. Cada factura puede tener múltiples ofertas de diferentes comercializadoras.';
COMMENT ON COLUMN core.offers.id IS 'Identificador único de la oferta';
COMMENT ON COLUMN core.offers.invoice_id IS 'ID de la factura asociada (FK a core.invoices)';
COMMENT ON COLUMN core.offers.provider_name IS 'Nombre de la comercializadora/proveedor que hace la oferta';
COMMENT ON COLUMN core.offers.storage_object_path IS 'Ruta del archivo PDF en el bucket de ofertas';

-- 6. Registrar migración en audit_logs
INSERT INTO core.audit_logs (event, entity, level, meta)
VALUES (
    'offers_table_created',
    'system',
    'info',
    jsonb_build_object(
        'migration_date', now(),
        'table_name', 'core.offers',
        'features', ARRAY['RLS policies', 'FK cascade delete', 'indexes']
    )
);
