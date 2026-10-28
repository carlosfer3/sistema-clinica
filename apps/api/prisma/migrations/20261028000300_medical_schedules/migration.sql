CREATE TABLE consultorio (
  id SMALLSERIAL PRIMARY KEY,
  nombre varchar(40) NOT NULL,
  activo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX consultorio_nombre_key ON consultorio(nombre);

-- Weekly local times in America/Lima: 1=Monday ... 7=Sunday.
-- Blocks stay within one day (00:00 through 23:59). Only whole minutes are used.
CREATE TABLE horario_medico (
  id SERIAL PRIMARY KEY,
  medico_id integer NOT NULL,
  consultorio_id smallint NOT NULL,
  dia_semana smallint NOT NULL,
  hora_inicio time(0) NOT NULL,
  hora_fin time(0) NOT NULL,
  duracion_cita_min smallint NOT NULL DEFAULT 20,
  CONSTRAINT horario_medico_medico_id_fkey FOREIGN KEY (medico_id)
    REFERENCES medico(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT horario_medico_consultorio_id_fkey FOREIGN KEY (consultorio_id)
    REFERENCES consultorio(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_horario_dia CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT ck_horario_intervalo CHECK (
    hora_fin > hora_inicio AND hora_fin < time '24:00:00'
  ),
  CONSTRAINT ck_horario_minutos CHECK (
    extract(second FROM hora_inicio) = 0 AND extract(second FROM hora_fin) = 0
  ),
  CONSTRAINT ck_horario_duracion CHECK (
    duracion_cita_min > 0
    AND duracion_cita_min * 60 <= extract(epoch FROM (hora_fin - hora_inicio))
  ),
  CONSTRAINT ex_horario_medico_solapamiento EXCLUDE USING gist (
    medico_id public.gist_int4_ops WITH =,
    dia_semana public.gist_int2_ops WITH =,
    int4range(
      extract(epoch FROM hora_inicio)::integer / 60,
      extract(epoch FROM hora_fin)::integer / 60, '[)'
    ) WITH &&
  ),
  CONSTRAINT ex_horario_consultorio_solapamiento EXCLUDE USING gist (
    consultorio_id public.gist_int2_ops WITH =,
    dia_semana public.gist_int2_ops WITH =,
    int4range(
      extract(epoch FROM hora_inicio)::integer / 60,
      extract(epoch FROM hora_fin)::integer / 60, '[)'
    ) WITH &&
  )
);

CREATE UNIQUE INDEX horario_medico_medico_id_dia_semana_hora_inicio_key
  ON horario_medico(medico_id, dia_semana, hora_inicio);
