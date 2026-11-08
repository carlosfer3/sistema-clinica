-- Preparation is independent of the appointment lifecycle and arrival.
-- HU10 will set this timestamp when nursing records the pre-consultation evaluation.
ALTER TABLE cita ADD COLUMN preparacion_completada_en TIMESTAMPTZ;
ALTER TABLE cita ADD CONSTRAINT ck_cita_preparacion_llegada CHECK (
  preparacion_completada_en IS NULL OR
  (llegada_en IS NOT NULL AND preparacion_completada_en >= llegada_en)
);
