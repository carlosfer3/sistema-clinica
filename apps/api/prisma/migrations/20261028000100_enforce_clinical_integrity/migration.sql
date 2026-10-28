-- Keep this migration separate from the already published initial migration.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

ALTER TABLE consulta ADD CONSTRAINT ck_consulta_anulacion CHECK (
  estado <> 'anulado' OR (
    motivo_anulacion IS NOT NULL AND length(btrim(motivo_anulacion)) > 0
    AND anulado_por IS NOT NULL AND anulado_en IS NOT NULL
  )
);

ALTER TABLE cita ADD CONSTRAINT ck_cita_intervalo
  CHECK (fecha_hora_fin > fecha_hora_inicio);

-- Half-open intervals allow one appointment to begin when another ends.
ALTER TABLE cita ADD CONSTRAINT ex_cita_medico_horario
  EXCLUDE USING gist (
    medico_id public.gist_int4_ops WITH =,
    tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)') WITH &&
  ) WHERE (estado IN ('programada', 'confirmada', 'reprogramada', 'atendida', 'no_asistio'));

CREATE FUNCTION rechazar_borrado_clinico() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Clinical records cannot be deleted or truncated; use annulment';
END;
$$;

CREATE TRIGGER consulta_sin_borrado BEFORE DELETE ON consulta
  FOR EACH ROW EXECUTE FUNCTION rechazar_borrado_clinico();
CREATE TRIGGER consulta_sin_truncate BEFORE TRUNCATE ON consulta
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_borrado_clinico();

CREATE FUNCTION rechazar_cambio_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;

CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON bitacora_auditoria
  FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_auditoria();
CREATE TRIGGER auditoria_sin_truncate BEFORE TRUNCATE ON bitacora_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_cambio_auditoria();
