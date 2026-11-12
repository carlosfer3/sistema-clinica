CREATE TABLE recordatorio_cita (
  id SERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL REFERENCES cita(id) ON DELETE RESTRICT,
  inicio TIMESTAMPTZ NOT NULL,
  estado VARCHAR(16) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'omitido', 'incierto', 'fallido')),
  intentos INTEGER NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en TIMESTAMPTZ,
  UNIQUE(cita_id, inicio)
);
CREATE INDEX recordatorio_cita_pendiente_idx ON recordatorio_cita(estado, actualizado_en);
