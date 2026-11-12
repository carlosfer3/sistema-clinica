CREATE TABLE cobro (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER NOT NULL REFERENCES paciente(id),
  concepto VARCHAR(160) NOT NULL CHECK (length(trim(concepto)) > 0),
  monto_centimos INTEGER NOT NULL CHECK (monto_centimos > 0),
  estado VARCHAR(16) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por INTEGER NOT NULL REFERENCES usuario(id),
  pagado_en TIMESTAMPTZ,
  pagado_por INTEGER REFERENCES usuario(id),
  metodo_pago VARCHAR(20),
  referencia VARCHAR(100),
  CONSTRAINT ck_cobro_payment CHECK (
    (estado = 'pendiente' AND pagado_en IS NULL AND pagado_por IS NULL AND metodo_pago IS NULL AND referencia IS NULL)
    OR (estado = 'pagado' AND pagado_en IS NOT NULL AND pagado_por IS NOT NULL
        AND metodo_pago IS NOT NULL AND metodo_pago IN ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia')
        AND (metodo_pago = 'efectivo' OR length(trim(referencia)) > 0 AND referencia IS NOT NULL))
  )
);
CREATE INDEX "cobro_paciente_id_creado_en_idx" ON cobro(paciente_id, creado_en);
