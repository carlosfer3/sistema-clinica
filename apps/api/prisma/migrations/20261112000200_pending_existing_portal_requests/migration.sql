-- Keep already confirmed or clinically started appointments untouched.
WITH changed AS (
  UPDATE cita SET estado = 'pendiente_confirmacion'
  WHERE canal_origen = 'portal' AND estado IN ('programada', 'reprogramada')
    AND fecha_hora_inicio > NOW() AND llegada_en IS NULL
    AND preparacion_completada_en IS NULL
    AND NOT EXISTS (SELECT 1 FROM consulta WHERE cita_id = cita.id)
    AND NOT EXISTS (SELECT 1 FROM evaluacion_previa WHERE cita_id = cita.id)
  RETURNING id
)
INSERT INTO bitacora_auditoria (accion, recurso, detalles)
SELECT 'REQUIRE_PORTAL_CONFIRMATION', 'agenda/appointments/' || id,
  'Portal request moved to pending confirmation by workflow migration.' FROM changed;
