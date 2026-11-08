CREATE TABLE cie10 (
  codigo VARCHAR(10) PRIMARY KEY CHECK (codigo ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'),
  descripcion VARCHAR(250) NOT NULL CHECK (length(btrim(descripcion)) > 0)
);
CREATE TABLE consulta_diagnostico (
  id SERIAL PRIMARY KEY,
  consulta_id INTEGER NOT NULL REFERENCES consulta(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  cie10_codigo VARCHAR(10) NOT NULL REFERENCES cie10(codigo) ON DELETE RESTRICT ON UPDATE CASCADE,
  descripcion VARCHAR(250) NOT NULL CHECK (length(btrim(descripcion)) > 0),
  tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('principal', 'secundario')),
  orden INTEGER NOT NULL CHECK (orden > 0),
  UNIQUE (consulta_id, cie10_codigo), UNIQUE (consulta_id, orden)
);
CREATE UNIQUE INDEX consulta_diagnostico_principal ON consulta_diagnostico(consulta_id) WHERE tipo = 'principal';
CREATE TABLE receta_item (
  id SERIAL PRIMARY KEY,
  consulta_id INTEGER NOT NULL REFERENCES consulta(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  orden INTEGER NOT NULL CHECK (orden > 0),
  medicamento VARCHAR(150) NOT NULL CHECK (length(btrim(medicamento)) > 0),
  dosis VARCHAR(100) NOT NULL CHECK (length(btrim(dosis)) > 0),
  via VARCHAR(80) NOT NULL CHECK (length(btrim(via)) > 0),
  frecuencia VARCHAR(100) NOT NULL CHECK (length(btrim(frecuencia)) > 0),
  duracion VARCHAR(100) NOT NULL CHECK (length(btrim(duracion)) > 0),
  indicaciones VARCHAR(500),
  UNIQUE (consulta_id, orden)
);
CREATE FUNCTION conservar_detalle_consulta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Consultation details are immutable; annul the consultation instead'; END;
$$;
CREATE TRIGGER diagnostico_inmutable BEFORE UPDATE OR DELETE ON consulta_diagnostico FOR EACH ROW EXECUTE FUNCTION conservar_detalle_consulta();
CREATE TRIGGER diagnostico_sin_truncate BEFORE TRUNCATE ON consulta_diagnostico FOR EACH STATEMENT EXECUTE FUNCTION conservar_detalle_consulta();
CREATE TRIGGER receta_inmutable BEFORE UPDATE OR DELETE ON receta_item FOR EACH ROW EXECUTE FUNCTION conservar_detalle_consulta();
CREATE TRIGGER receta_sin_truncate BEFORE TRUNCATE ON receta_item FOR EACH STATEMENT EXECUTE FUNCTION conservar_detalle_consulta();
CREATE FUNCTION conservar_contenido_consulta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.paciente_id, NEW.medico_id, NEW.cita_id, NEW.fecha_hora, NEW.motivo, NEW.indicaciones)
     IS DISTINCT FROM ROW(OLD.paciente_id, OLD.medico_id, OLD.cita_id, OLD.fecha_hora, OLD.motivo, OLD.indicaciones) THEN
    RAISE EXCEPTION 'Consultation content is immutable; use annulment';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER consulta_contenido_inmutable BEFORE UPDATE ON consulta FOR EACH ROW EXECUTE FUNCTION conservar_contenido_consulta();
