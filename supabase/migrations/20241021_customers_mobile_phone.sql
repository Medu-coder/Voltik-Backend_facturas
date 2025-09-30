-- Add mobile phone column to customers table
ALTER TABLE core.customers
  ADD COLUMN mobile_phone text;

COMMENT ON COLUMN core.customers.mobile_phone IS 'Teléfono móvil de contacto.';
