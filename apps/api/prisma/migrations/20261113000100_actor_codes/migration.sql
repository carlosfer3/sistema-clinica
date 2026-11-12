-- Reservations remain even if an actor is deleted: codes are never reused.
CREATE TABLE actor_codigo_reservado (
  codigo VARCHAR(4) PRIMARY KEY CHECK (codigo ~ '^[PEDALCGT][0-9]{3}$')
);

CREATE FUNCTION generar_codigo_actor(prefijo TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE candidato TEXT; intentos INTEGER := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(81724, ascii(prefijo));
  IF (SELECT count(*) FROM actor_codigo_reservado WHERE left(codigo, 1) = prefijo) >= 999 THEN
    RAISE EXCEPTION 'No quedan códigos disponibles para el prefijo % (001-999)', prefijo;
  END IF;
  LOOP
    candidato := prefijo || lpad((1 + floor(random() * 999)::integer)::text, 3, '0');
    INSERT INTO actor_codigo_reservado(codigo) VALUES (candidato) ON CONFLICT DO NOTHING;
    IF FOUND THEN RETURN candidato; END IF;
    intentos := intentos + 1;
    -- Bounded retries near capacity; choose randomly among the remaining codes.
    IF intentos >= 100 THEN
      SELECT prefijo || lpad(n::text, 3, '0') INTO candidato
      FROM generate_series(1, 999) n
      WHERE NOT EXISTS (SELECT 1 FROM actor_codigo_reservado r WHERE r.codigo = prefijo || lpad(n::text, 3, '0'))
      ORDER BY random() LIMIT 1;
      INSERT INTO actor_codigo_reservado(codigo) VALUES (candidato);
      RETURN candidato;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE usuario ADD COLUMN codigo VARCHAR(4);
ALTER TABLE paciente ADD COLUMN codigo VARCHAR(4);
ALTER TABLE medico ADD COLUMN codigo VARCHAR(4);

CREATE FUNCTION asignar_codigo_actor() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE prefijo TEXT;
BEGIN
  IF TG_TABLE_NAME = 'usuario' THEN
    IF TG_OP = 'INSERT' OR NEW.codigo IS NULL THEN
      prefijo := CASE NEW.rol::text WHEN 'paciente' THEN 'P' WHEN 'enfermeria' THEN 'E' WHEN 'medico' THEN 'D' WHEN 'admision' THEN 'A' WHEN 'laboratorio' THEN 'L' WHEN 'cajero' THEN 'C' WHEN 'gerencia' THEN 'G' END;
      IF NEW.rol::text = 'admin' THEN prefijo := 'T'; END IF;
      NEW.codigo := generar_codigo_actor(prefijo);
    END IF;
  ELSIF TG_TABLE_NAME = 'paciente' THEN
    IF TG_OP = 'INSERT' OR NEW.codigo IS NULL THEN
      IF NEW.usuario_id IS NOT NULL THEN
        SELECT codigo INTO NEW.codigo FROM usuario WHERE id = NEW.usuario_id AND rol = 'paciente';
      END IF;
      IF NEW.codigo IS NULL THEN NEW.codigo := generar_codigo_actor('P'); END IF;
    END IF;
    IF NEW.usuario_id IS NOT NULL THEN
      UPDATE usuario SET codigo = NEW.codigo WHERE id = NEW.usuario_id AND rol = 'paciente';
    END IF;
  ELSE
    SELECT codigo INTO NEW.codigo FROM usuario WHERE id = NEW.usuario_id AND rol = 'medico';
    IF NEW.codigo IS NULL THEN RAISE EXCEPTION 'El médico requiere una cuenta de rol medico'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER usuario_codigo BEFORE INSERT OR UPDATE ON usuario FOR EACH ROW EXECUTE FUNCTION asignar_codigo_actor();
CREATE TRIGGER paciente_codigo BEFORE INSERT OR UPDATE ON paciente FOR EACH ROW EXECUTE FUNCTION asignar_codigo_actor();
CREATE TRIGGER medico_codigo BEFORE INSERT OR UPDATE ON medico FOR EACH ROW EXECUTE FUNCTION asignar_codigo_actor();
UPDATE usuario SET codigo = NULL;
UPDATE paciente SET codigo = NULL;
UPDATE medico SET codigo = NULL;
ALTER TABLE usuario ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE paciente ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE medico ALTER COLUMN codigo SET NOT NULL;
CREATE UNIQUE INDEX usuario_codigo_key ON usuario(codigo);
CREATE UNIQUE INDEX paciente_codigo_key ON paciente(codigo);
CREATE UNIQUE INDEX medico_codigo_key ON medico(codigo);
