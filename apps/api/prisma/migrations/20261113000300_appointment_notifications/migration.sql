CREATE TABLE notificacion_cita (
  id SERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL REFERENCES cita(id) ON DELETE RESTRICT,
  tipo VARCHAR(16) NOT NULL CHECK (tipo IN ('registro', 'reprogramacion', 'cancelacion', 'confirmacion')),
  correo VARCHAR(120) NOT NULL,
  inicio TIMESTAMPTZ NOT NULL,
  inicio_anterior TIMESTAMPTZ,
  especialidad TEXT NOT NULL,
  pendiente_confirmacion BOOLEAN NOT NULL DEFAULT false,
  estado VARCHAR(16) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'fallido', 'incierto')),
  intentos INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en TIMESTAMPTZ
);
CREATE INDEX notificacion_cita_pendiente_idx ON notificacion_cita(estado, actualizado_en);

CREATE FUNCTION registrar_notificacion_cita() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE evento TEXT; anterior TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN evento := 'registro';
  ELSIF NEW.estado = 'cancelada' AND OLD.estado <> 'cancelada' THEN evento := 'cancelacion';
  ELSIF NEW.fecha_hora_inicio IS DISTINCT FROM OLD.fecha_hora_inicio THEN
    evento := 'reprogramacion'; anterior := OLD.fecha_hora_inicio;
  ELSIF NEW.estado = 'confirmada' AND OLD.estado = 'pendiente_confirmacion' THEN evento := 'confirmacion';
  ELSE RETURN NEW;
  END IF;
  INSERT INTO notificacion_cita(cita_id, tipo, correo, inicio, inicio_anterior, especialidad, pendiente_confirmacion)
  SELECT NEW.id, evento, p.correo, NEW.fecha_hora_inicio, anterior, e.nombre, NEW.estado = 'pendiente_confirmacion'
  FROM paciente p, medico m JOIN especialidad e ON e.id = m.especialidad_id
  WHERE p.id = NEW.paciente_id AND m.id = NEW.medico_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cita_notificacion AFTER INSERT OR UPDATE ON cita
FOR EACH ROW EXECUTE FUNCTION registrar_notificacion_cita();
