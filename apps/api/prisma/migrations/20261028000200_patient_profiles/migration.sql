-- A patient does not require a portal account (portal belongs to Sprint 2).
ALTER TABLE paciente ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE paciente ADD COLUMN nombres varchar(100), ADD COLUMN apellidos varchar(100);
UPDATE paciente p SET nombres = u.nombres, apellidos = u.apellidos
FROM usuario u WHERE p.usuario_id = u.id;
ALTER TABLE paciente ALTER COLUMN nombres SET NOT NULL, ALTER COLUMN apellidos SET NOT NULL;
CREATE INDEX paciente_apellidos_nombres_idx ON paciente(apellidos, nombres);

CREATE TABLE antecedente (
  id SERIAL PRIMARY KEY,
  paciente_id integer NOT NULL REFERENCES paciente(id) ON DELETE RESTRICT,
  tipo varchar(30) NOT NULL,
  descripcion varchar(300) NOT NULL,
  desde date,
  registrado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alergia (
  id SERIAL PRIMARY KEY,
  paciente_id integer NOT NULL REFERENCES paciente(id) ON DELETE RESTRICT,
  sustancia varchar(100) NOT NULL,
  reaccion varchar(200)
);

CREATE TRIGGER antecedente_sin_borrado BEFORE DELETE ON antecedente
  FOR EACH ROW EXECUTE FUNCTION rechazar_borrado_clinico();
CREATE TRIGGER antecedente_sin_truncate BEFORE TRUNCATE ON antecedente
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_borrado_clinico();
CREATE TRIGGER alergia_sin_borrado BEFORE DELETE ON alergia
  FOR EACH ROW EXECUTE FUNCTION rechazar_borrado_clinico();
CREATE TRIGGER alergia_sin_truncate BEFORE TRUNCATE ON alergia
  FOR EACH STATEMENT EXECUTE FUNCTION rechazar_borrado_clinico();
