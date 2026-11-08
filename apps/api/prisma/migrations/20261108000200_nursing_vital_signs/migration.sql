CREATE TABLE evaluacion_previa (
  id SERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL UNIQUE REFERENCES cita(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  registrado_por INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  temperatura_c DOUBLE PRECISION NOT NULL CHECK (temperatura_c > 0 AND temperatura_c <= 100),
  presion_sistolica INTEGER NOT NULL CHECK (presion_sistolica BETWEEN 1 AND 1000),
  presion_diastolica INTEGER NOT NULL CHECK (presion_diastolica BETWEEN 1 AND 1000),
  frecuencia_cardiaca INTEGER NOT NULL CHECK (frecuencia_cardiaca BETWEEN 1 AND 1000),
  frecuencia_respiratoria INTEGER NOT NULL CHECK (frecuencia_respiratoria BETWEEN 1 AND 1000),
  saturacion_oxigeno DOUBLE PRECISION NOT NULL CHECK (saturacion_oxigeno BETWEEN 0 AND 100),
  peso_kg DOUBLE PRECISION CHECK (peso_kg > 0 AND peso_kg <= 2000),
  talla_cm DOUBLE PRECISION CHECK (talla_cm > 0 AND talla_cm <= 400),
  observaciones VARCHAR(1000)
);
-- Preserve original clinical measurements. Corrections need a future versioned workflow.
CREATE FUNCTION preserve_evaluacion_previa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Nursing evaluations cannot be updated or deleted';
END;
$$;
CREATE TRIGGER evaluacion_previa_preserve BEFORE UPDATE OR DELETE ON evaluacion_previa
FOR EACH ROW EXECUTE FUNCTION preserve_evaluacion_previa();
