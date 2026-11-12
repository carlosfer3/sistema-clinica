--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: CanalOrigen; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CanalOrigen" AS ENUM (
    'presencial',
    'telefono',
    'portal'
);


--
-- Name: EstadoCita; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoCita" AS ENUM (
    'programada',
    'confirmada',
    'reprogramada',
    'cancelada',
    'atendida',
    'no_asistio',
    'pendiente_confirmacion'
);


--
-- Name: EstadoConsulta; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoConsulta" AS ENUM (
    'activo',
    'anulado'
);


--
-- Name: ModalidadCita; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ModalidadCita" AS ENUM (
    'presencial',
    'virtual'
);


--
-- Name: RolUsuario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RolUsuario" AS ENUM (
    'admision',
    'medico',
    'enfermeria',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
    'admin'
);


--
-- Name: asignar_codigo_actor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_codigo_actor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: conservar_contenido_consulta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conservar_contenido_consulta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF ROW(NEW.paciente_id, NEW.medico_id, NEW.cita_id, NEW.fecha_hora, NEW.motivo, NEW.indicaciones)
     IS DISTINCT FROM ROW(OLD.paciente_id, OLD.medico_id, OLD.cita_id, OLD.fecha_hora, OLD.motivo, OLD.indicaciones) THEN
    RAISE EXCEPTION 'Consultation content is immutable; use annulment';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: conservar_detalle_consulta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conservar_detalle_consulta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Consultation details are immutable; annul the consultation instead'; END;
$$;


--
-- Name: generar_codigo_actor(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_codigo_actor(prefijo text) RETURNS text
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: preserve_evaluacion_previa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preserve_evaluacion_previa() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Nursing evaluations cannot be updated or deleted';
END;
$$;


--
-- Name: rechazar_borrado_clinico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rechazar_borrado_clinico() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Clinical records cannot be deleted or truncated; use annulment';
END;
$$;


--
-- Name: rechazar_cambio_auditoria(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rechazar_cambio_auditoria() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;


--
-- Name: registrar_notificacion_cita(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_notificacion_cita() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: actor_codigo_reservado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actor_codigo_reservado (
    codigo character varying(4) NOT NULL,
    CONSTRAINT actor_codigo_reservado_codigo_check CHECK (((codigo)::text ~ '^[PEDALCGT][0-9]{3}$'::text))
);


--
-- Name: alergia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alergia (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    sustancia character varying(100) NOT NULL,
    reaccion character varying(200)
);


--
-- Name: alergia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alergia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alergia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alergia_id_seq OWNED BY public.alergia.id;


--
-- Name: antecedente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.antecedente (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    tipo character varying(30) NOT NULL,
    descripcion character varying(300) NOT NULL,
    desde date,
    registrado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: antecedente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.antecedente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: antecedente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.antecedente_id_seq OWNED BY public.antecedente.id;


--
-- Name: bitacora_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bitacora_auditoria (
    id integer NOT NULL,
    usuario_id integer,
    accion character varying(50) NOT NULL,
    recurso character varying(100) NOT NULL,
    detalles text,
    ip_origen character varying(45),
    fecha_hora timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bitacora_auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bitacora_auditoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bitacora_auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bitacora_auditoria_id_seq OWNED BY public.bitacora_auditoria.id;


--
-- Name: cie10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cie10 (
    codigo character varying(10) NOT NULL,
    descripcion character varying(250) NOT NULL,
    CONSTRAINT cie10_codigo_check CHECK (((codigo)::text ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'::text)),
    CONSTRAINT cie10_descripcion_check CHECK ((length(btrim((descripcion)::text)) > 0))
);


--
-- Name: cita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cita (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    medico_id integer NOT NULL,
    fecha_hora_inicio timestamp with time zone NOT NULL,
    fecha_hora_fin timestamp with time zone NOT NULL,
    motivo character varying(300),
    estado public."EstadoCita" DEFAULT 'programada'::public."EstadoCita" NOT NULL,
    canal_origen public."CanalOrigen" DEFAULT 'presencial'::public."CanalOrigen" NOT NULL,
    modalidad public."ModalidadCita" DEFAULT 'presencial'::public."ModalidadCita" NOT NULL,
    enlace_virtual character varying(300),
    llegada_en timestamp with time zone,
    creado_por integer NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    consultorio_id smallint,
    preparacion_completada_en timestamp with time zone,
    CONSTRAINT ck_cita_intervalo CHECK ((fecha_hora_fin > fecha_hora_inicio)),
    CONSTRAINT ck_cita_preparacion_llegada CHECK (((preparacion_completada_en IS NULL) OR ((llegada_en IS NOT NULL) AND (preparacion_completada_en >= llegada_en))))
);


--
-- Name: cita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cita_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cita_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cita_id_seq OWNED BY public.cita.id;


--
-- Name: cobro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cobro (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    concepto character varying(160) NOT NULL,
    monto_centimos integer NOT NULL,
    estado character varying(16) DEFAULT 'pendiente'::character varying NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    creado_por integer NOT NULL,
    pagado_en timestamp with time zone,
    pagado_por integer,
    metodo_pago character varying(20),
    referencia character varying(100),
    CONSTRAINT ck_cobro_payment CHECK (((((estado)::text = 'pendiente'::text) AND (pagado_en IS NULL) AND (pagado_por IS NULL) AND (metodo_pago IS NULL) AND (referencia IS NULL)) OR (((estado)::text = 'pagado'::text) AND (pagado_en IS NOT NULL) AND (pagado_por IS NOT NULL) AND (metodo_pago IS NOT NULL) AND ((metodo_pago)::text = ANY ((ARRAY['efectivo'::character varying, 'tarjeta'::character varying, 'yape'::character varying, 'plin'::character varying, 'transferencia'::character varying])::text[])) AND (((metodo_pago)::text = 'efectivo'::text) OR ((length(TRIM(BOTH FROM referencia)) > 0) AND (referencia IS NOT NULL)))))),
    CONSTRAINT cobro_concepto_check CHECK ((length(TRIM(BOTH FROM concepto)) > 0)),
    CONSTRAINT cobro_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'pagado'::character varying])::text[]))),
    CONSTRAINT cobro_monto_centimos_check CHECK ((monto_centimos > 0))
);


--
-- Name: cobro_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cobro_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cobro_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cobro_id_seq OWNED BY public.cobro.id;


--
-- Name: consulta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consulta (
    id integer NOT NULL,
    paciente_id integer NOT NULL,
    medico_id integer NOT NULL,
    cita_id integer,
    fecha_hora timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    motivo character varying(300) NOT NULL,
    indicaciones text,
    estado public."EstadoConsulta" DEFAULT 'activo'::public."EstadoConsulta" NOT NULL,
    motivo_anulacion character varying(300),
    anulado_por integer,
    anulado_en timestamp with time zone,
    CONSTRAINT ck_consulta_anulacion CHECK (((estado <> 'anulado'::public."EstadoConsulta") OR ((motivo_anulacion IS NOT NULL) AND (length(btrim((motivo_anulacion)::text)) > 0) AND (anulado_por IS NOT NULL) AND (anulado_en IS NOT NULL))))
);


--
-- Name: consulta_diagnostico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consulta_diagnostico (
    id integer NOT NULL,
    consulta_id integer NOT NULL,
    cie10_codigo character varying(10) NOT NULL,
    descripcion character varying(250) NOT NULL,
    tipo character varying(15) NOT NULL,
    orden integer NOT NULL,
    CONSTRAINT consulta_diagnostico_descripcion_check CHECK ((length(btrim((descripcion)::text)) > 0)),
    CONSTRAINT consulta_diagnostico_orden_check CHECK ((orden > 0)),
    CONSTRAINT consulta_diagnostico_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['principal'::character varying, 'secundario'::character varying])::text[])))
);


--
-- Name: consulta_diagnostico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consulta_diagnostico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consulta_diagnostico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consulta_diagnostico_id_seq OWNED BY public.consulta_diagnostico.id;


--
-- Name: consulta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consulta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consulta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consulta_id_seq OWNED BY public.consulta.id;


--
-- Name: consultorio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultorio (
    id smallint NOT NULL,
    nombre character varying(40) NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: consultorio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consultorio_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consultorio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consultorio_id_seq OWNED BY public.consultorio.id;


--
-- Name: especialidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.especialidad (
    id smallint NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion character varying(255)
);


--
-- Name: especialidad_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.especialidad_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: especialidad_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.especialidad_id_seq OWNED BY public.especialidad.id;


--
-- Name: evaluacion_previa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluacion_previa (
    id integer NOT NULL,
    cita_id integer NOT NULL,
    registrado_por integer NOT NULL,
    registrado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    temperatura_c double precision NOT NULL,
    presion_sistolica integer NOT NULL,
    presion_diastolica integer NOT NULL,
    frecuencia_cardiaca integer NOT NULL,
    frecuencia_respiratoria integer NOT NULL,
    saturacion_oxigeno double precision NOT NULL,
    peso_kg double precision,
    talla_cm double precision,
    observaciones character varying(1000),
    CONSTRAINT evaluacion_previa_frecuencia_cardiaca_check CHECK (((frecuencia_cardiaca >= 1) AND (frecuencia_cardiaca <= 1000))),
    CONSTRAINT evaluacion_previa_frecuencia_respiratoria_check CHECK (((frecuencia_respiratoria >= 1) AND (frecuencia_respiratoria <= 1000))),
    CONSTRAINT evaluacion_previa_peso_kg_check CHECK (((peso_kg > (0)::double precision) AND (peso_kg <= (2000)::double precision))),
    CONSTRAINT evaluacion_previa_presion_diastolica_check CHECK (((presion_diastolica >= 1) AND (presion_diastolica <= 1000))),
    CONSTRAINT evaluacion_previa_presion_sistolica_check CHECK (((presion_sistolica >= 1) AND (presion_sistolica <= 1000))),
    CONSTRAINT evaluacion_previa_saturacion_oxigeno_check CHECK (((saturacion_oxigeno >= (0)::double precision) AND (saturacion_oxigeno <= (100)::double precision))),
    CONSTRAINT evaluacion_previa_talla_cm_check CHECK (((talla_cm > (0)::double precision) AND (talla_cm <= (400)::double precision))),
    CONSTRAINT evaluacion_previa_temperatura_c_check CHECK (((temperatura_c > (0)::double precision) AND (temperatura_c <= (100)::double precision)))
);


--
-- Name: evaluacion_previa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluacion_previa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluacion_previa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluacion_previa_id_seq OWNED BY public.evaluacion_previa.id;


--
-- Name: horario_medico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horario_medico (
    id integer NOT NULL,
    medico_id integer NOT NULL,
    consultorio_id smallint NOT NULL,
    dia_semana smallint NOT NULL,
    hora_inicio time(0) without time zone NOT NULL,
    hora_fin time(0) without time zone NOT NULL,
    duracion_cita_min smallint DEFAULT 20 NOT NULL,
    CONSTRAINT ck_horario_dia CHECK (((dia_semana >= 1) AND (dia_semana <= 7))),
    CONSTRAINT ck_horario_duracion CHECK (((duracion_cita_min > 0) AND (((duracion_cita_min * 60))::numeric <= EXTRACT(epoch FROM (hora_fin - hora_inicio))))),
    CONSTRAINT ck_horario_intervalo CHECK (((hora_fin > hora_inicio) AND (hora_fin < '24:00:00'::time without time zone))),
    CONSTRAINT ck_horario_minutos CHECK (((EXTRACT(second FROM hora_inicio) = (0)::numeric) AND (EXTRACT(second FROM hora_fin) = (0)::numeric)))
);


--
-- Name: horario_medico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.horario_medico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: horario_medico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.horario_medico_id_seq OWNED BY public.horario_medico.id;


--
-- Name: medico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medico (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    especialidad_id smallint NOT NULL,
    cmp character varying(10) NOT NULL,
    codigo character varying(4) NOT NULL
);


--
-- Name: medico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medico_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medico_id_seq OWNED BY public.medico.id;


--
-- Name: notificacion_cita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacion_cita (
    id integer NOT NULL,
    cita_id integer NOT NULL,
    tipo character varying(16) NOT NULL,
    correo character varying(120) NOT NULL,
    inicio timestamp with time zone NOT NULL,
    inicio_anterior timestamp with time zone,
    especialidad text NOT NULL,
    pendiente_confirmacion boolean DEFAULT false NOT NULL,
    estado character varying(16) DEFAULT 'pendiente'::character varying NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    enviado_en timestamp with time zone,
    CONSTRAINT notificacion_cita_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'enviando'::character varying, 'enviado'::character varying, 'fallido'::character varying, 'incierto'::character varying])::text[]))),
    CONSTRAINT notificacion_cita_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['registro'::character varying, 'reprogramacion'::character varying, 'cancelacion'::character varying, 'confirmacion'::character varying])::text[])))
);


--
-- Name: notificacion_cita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificacion_cita_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificacion_cita_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificacion_cita_id_seq OWNED BY public.notificacion_cita.id;


--
-- Name: notificacion_portal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacion_portal (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    titulo character varying(100) NOT NULL,
    detalle character varying(500) NOT NULL,
    leida boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notificacion_portal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificacion_portal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificacion_portal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificacion_portal_id_seq OWNED BY public.notificacion_portal.id;


--
-- Name: paciente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paciente (
    id integer NOT NULL,
    usuario_id integer,
    tipo_documento character varying(12) NOT NULL,
    numero_documento character varying(15) NOT NULL,
    fecha_nacimiento date NOT NULL,
    sexo character(1) NOT NULL,
    telefono character varying(20) NOT NULL,
    correo character varying(120) NOT NULL,
    direccion character varying(200),
    nombres character varying(100) NOT NULL,
    apellidos character varying(100) NOT NULL,
    codigo character varying(4) NOT NULL
);


--
-- Name: paciente_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.paciente_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: paciente_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.paciente_id_seq OWNED BY public.paciente.id;


--
-- Name: preferencias_portal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preferencias_portal (
    usuario_id integer NOT NULL,
    sms boolean DEFAULT false NOT NULL,
    correo boolean DEFAULT false NOT NULL,
    whatsapp boolean DEFAULT false NOT NULL
);


--
-- Name: receta_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receta_item (
    id integer NOT NULL,
    consulta_id integer NOT NULL,
    orden integer NOT NULL,
    medicamento character varying(150) NOT NULL,
    dosis character varying(100) NOT NULL,
    via character varying(80) NOT NULL,
    frecuencia character varying(100) NOT NULL,
    duracion character varying(100) NOT NULL,
    indicaciones character varying(500),
    CONSTRAINT receta_item_dosis_check CHECK ((length(btrim((dosis)::text)) > 0)),
    CONSTRAINT receta_item_duracion_check CHECK ((length(btrim((duracion)::text)) > 0)),
    CONSTRAINT receta_item_frecuencia_check CHECK ((length(btrim((frecuencia)::text)) > 0)),
    CONSTRAINT receta_item_medicamento_check CHECK ((length(btrim((medicamento)::text)) > 0)),
    CONSTRAINT receta_item_orden_check CHECK ((orden > 0)),
    CONSTRAINT receta_item_via_check CHECK ((length(btrim((via)::text)) > 0))
);


--
-- Name: receta_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receta_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receta_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receta_item_id_seq OWNED BY public.receta_item.id;


--
-- Name: recordatorio_cita; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recordatorio_cita (
    id integer NOT NULL,
    cita_id integer NOT NULL,
    inicio timestamp with time zone NOT NULL,
    estado character varying(16) DEFAULT 'pendiente'::character varying NOT NULL,
    intentos integer DEFAULT 0 NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    enviado_en timestamp with time zone,
    CONSTRAINT recordatorio_cita_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'enviando'::character varying, 'enviado'::character varying, 'omitido'::character varying, 'incierto'::character varying, 'fallido'::character varying])::text[])))
);


--
-- Name: recordatorio_cita_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recordatorio_cita_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recordatorio_cita_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recordatorio_cita_id_seq OWNED BY public.recordatorio_cita.id;


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    id integer NOT NULL,
    rol public."RolUsuario" NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    nombres character varying(100) NOT NULL,
    apellidos character varying(100) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    codigo character varying(4) NOT NULL
);


--
-- Name: usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_id_seq OWNED BY public.usuario.id;


--
-- Name: alergia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alergia ALTER COLUMN id SET DEFAULT nextval('public.alergia_id_seq'::regclass);


--
-- Name: antecedente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecedente ALTER COLUMN id SET DEFAULT nextval('public.antecedente_id_seq'::regclass);


--
-- Name: bitacora_auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria ALTER COLUMN id SET DEFAULT nextval('public.bitacora_auditoria_id_seq'::regclass);


--
-- Name: cita id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita ALTER COLUMN id SET DEFAULT nextval('public.cita_id_seq'::regclass);


--
-- Name: cobro id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobro ALTER COLUMN id SET DEFAULT nextval('public.cobro_id_seq'::regclass);


--
-- Name: consulta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta ALTER COLUMN id SET DEFAULT nextval('public.consulta_id_seq'::regclass);


--
-- Name: consulta_diagnostico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta_diagnostico ALTER COLUMN id SET DEFAULT nextval('public.consulta_diagnostico_id_seq'::regclass);


--
-- Name: consultorio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultorio ALTER COLUMN id SET DEFAULT nextval('public.consultorio_id_seq'::regclass);


--
-- Name: especialidad id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especialidad ALTER COLUMN id SET DEFAULT nextval('public.especialidad_id_seq'::regclass);


--
-- Name: evaluacion_previa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_previa ALTER COLUMN id SET DEFAULT nextval('public.evaluacion_previa_id_seq'::regclass);


--
-- Name: horario_medico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_medico ALTER COLUMN id SET DEFAULT nextval('public.horario_medico_id_seq'::regclass);


--
-- Name: medico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medico ALTER COLUMN id SET DEFAULT nextval('public.medico_id_seq'::regclass);


--
-- Name: notificacion_cita id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_cita ALTER COLUMN id SET DEFAULT nextval('public.notificacion_cita_id_seq'::regclass);


--
-- Name: notificacion_portal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_portal ALTER COLUMN id SET DEFAULT nextval('public.notificacion_portal_id_seq'::regclass);


--
-- Name: paciente id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente ALTER COLUMN id SET DEFAULT nextval('public.paciente_id_seq'::regclass);


--
-- Name: receta_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_item ALTER COLUMN id SET DEFAULT nextval('public.receta_item_id_seq'::regclass);


--
-- Name: recordatorio_cita id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordatorio_cita ALTER COLUMN id SET DEFAULT nextval('public.recordatorio_cita_id_seq'::regclass);


--
-- Name: usuario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario ALTER COLUMN id SET DEFAULT nextval('public.usuario_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: actor_codigo_reservado actor_codigo_reservado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actor_codigo_reservado
    ADD CONSTRAINT actor_codigo_reservado_pkey PRIMARY KEY (codigo);


--
-- Name: alergia alergia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alergia
    ADD CONSTRAINT alergia_pkey PRIMARY KEY (id);


--
-- Name: antecedente antecedente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecedente
    ADD CONSTRAINT antecedente_pkey PRIMARY KEY (id);


--
-- Name: bitacora_auditoria bitacora_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria
    ADD CONSTRAINT bitacora_auditoria_pkey PRIMARY KEY (id);


--
-- Name: cie10 cie10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cie10
    ADD CONSTRAINT cie10_pkey PRIMARY KEY (codigo);


--
-- Name: cita cita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT cita_pkey PRIMARY KEY (id);


--
-- Name: cobro cobro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobro
    ADD CONSTRAINT cobro_pkey PRIMARY KEY (id);


--
-- Name: consulta_diagnostico consulta_diagnostico_consulta_id_cie10_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta_diagnostico
    ADD CONSTRAINT consulta_diagnostico_consulta_id_cie10_codigo_key UNIQUE (consulta_id, cie10_codigo);


--
-- Name: consulta_diagnostico consulta_diagnostico_consulta_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta_diagnostico
    ADD CONSTRAINT consulta_diagnostico_consulta_id_orden_key UNIQUE (consulta_id, orden);


--
-- Name: consulta_diagnostico consulta_diagnostico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta_diagnostico
    ADD CONSTRAINT consulta_diagnostico_pkey PRIMARY KEY (id);


--
-- Name: consulta consulta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta
    ADD CONSTRAINT consulta_pkey PRIMARY KEY (id);


--
-- Name: consultorio consultorio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultorio
    ADD CONSTRAINT consultorio_pkey PRIMARY KEY (id);


--
-- Name: especialidad especialidad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.especialidad
    ADD CONSTRAINT especialidad_pkey PRIMARY KEY (id);


--
-- Name: evaluacion_previa evaluacion_previa_cita_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_previa
    ADD CONSTRAINT evaluacion_previa_cita_id_key UNIQUE (cita_id);


--
-- Name: evaluacion_previa evaluacion_previa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_previa
    ADD CONSTRAINT evaluacion_previa_pkey PRIMARY KEY (id);


--
-- Name: cita ex_cita_consultorio_horario; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT ex_cita_consultorio_horario EXCLUDE USING gist (consultorio_id WITH =, tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)'::text) WITH &&) WHERE ((estado = ANY (ARRAY['programada'::public."EstadoCita", 'confirmada'::public."EstadoCita", 'reprogramada'::public."EstadoCita", 'atendida'::public."EstadoCita", 'no_asistio'::public."EstadoCita"])));


--
-- Name: cita ex_cita_medico_horario; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT ex_cita_medico_horario EXCLUDE USING gist (medico_id WITH =, tstzrange(fecha_hora_inicio, fecha_hora_fin, '[)'::text) WITH &&) WHERE ((estado = ANY (ARRAY['programada'::public."EstadoCita", 'confirmada'::public."EstadoCita", 'reprogramada'::public."EstadoCita", 'atendida'::public."EstadoCita", 'no_asistio'::public."EstadoCita"])));


--
-- Name: horario_medico ex_horario_consultorio_solapamiento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_medico
    ADD CONSTRAINT ex_horario_consultorio_solapamiento EXCLUDE USING gist (consultorio_id WITH =, dia_semana WITH =, int4range(((EXTRACT(epoch FROM hora_inicio))::integer / 60), ((EXTRACT(epoch FROM hora_fin))::integer / 60), '[)'::text) WITH &&);


--
-- Name: horario_medico ex_horario_medico_solapamiento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_medico
    ADD CONSTRAINT ex_horario_medico_solapamiento EXCLUDE USING gist (medico_id WITH =, dia_semana WITH =, int4range(((EXTRACT(epoch FROM hora_inicio))::integer / 60), ((EXTRACT(epoch FROM hora_fin))::integer / 60), '[)'::text) WITH &&);


--
-- Name: horario_medico horario_medico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_medico
    ADD CONSTRAINT horario_medico_pkey PRIMARY KEY (id);


--
-- Name: medico medico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medico
    ADD CONSTRAINT medico_pkey PRIMARY KEY (id);


--
-- Name: notificacion_cita notificacion_cita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_cita
    ADD CONSTRAINT notificacion_cita_pkey PRIMARY KEY (id);


--
-- Name: notificacion_portal notificacion_portal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_portal
    ADD CONSTRAINT notificacion_portal_pkey PRIMARY KEY (id);


--
-- Name: paciente paciente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente
    ADD CONSTRAINT paciente_pkey PRIMARY KEY (id);


--
-- Name: preferencias_portal preferencias_portal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_portal
    ADD CONSTRAINT preferencias_portal_pkey PRIMARY KEY (usuario_id);


--
-- Name: receta_item receta_item_consulta_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_item
    ADD CONSTRAINT receta_item_consulta_id_orden_key UNIQUE (consulta_id, orden);


--
-- Name: receta_item receta_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_item
    ADD CONSTRAINT receta_item_pkey PRIMARY KEY (id);


--
-- Name: recordatorio_cita recordatorio_cita_cita_id_inicio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordatorio_cita
    ADD CONSTRAINT recordatorio_cita_cita_id_inicio_key UNIQUE (cita_id, inicio);


--
-- Name: recordatorio_cita recordatorio_cita_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordatorio_cita
    ADD CONSTRAINT recordatorio_cita_pkey PRIMARY KEY (id);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id);


--
-- Name: cita_medico_id_fecha_hora_inicio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cita_medico_id_fecha_hora_inicio_idx ON public.cita USING btree (medico_id, fecha_hora_inicio);


--
-- Name: cobro_paciente_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cobro_paciente_id_creado_en_idx ON public.cobro USING btree (paciente_id, creado_en);


--
-- Name: consulta_cita_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX consulta_cita_id_key ON public.consulta USING btree (cita_id);


--
-- Name: consulta_diagnostico_principal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX consulta_diagnostico_principal ON public.consulta_diagnostico USING btree (consulta_id) WHERE ((tipo)::text = 'principal'::text);


--
-- Name: consulta_paciente_id_fecha_hora_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consulta_paciente_id_fecha_hora_idx ON public.consulta USING btree (paciente_id, fecha_hora);


--
-- Name: consultorio_nombre_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX consultorio_nombre_key ON public.consultorio USING btree (nombre);


--
-- Name: especialidad_nombre_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX especialidad_nombre_key ON public.especialidad USING btree (nombre);


--
-- Name: horario_medico_medico_id_dia_semana_hora_inicio_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX horario_medico_medico_id_dia_semana_hora_inicio_key ON public.horario_medico USING btree (medico_id, dia_semana, hora_inicio);


--
-- Name: medico_cmp_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX medico_cmp_key ON public.medico USING btree (cmp);


--
-- Name: medico_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX medico_codigo_key ON public.medico USING btree (codigo);


--
-- Name: medico_usuario_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX medico_usuario_id_key ON public.medico USING btree (usuario_id);


--
-- Name: notificacion_cita_pendiente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notificacion_cita_pendiente_idx ON public.notificacion_cita USING btree (estado, actualizado_en);


--
-- Name: notificacion_portal_usuario_id_creado_en_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notificacion_portal_usuario_id_creado_en_idx ON public.notificacion_portal USING btree (usuario_id, creado_en);


--
-- Name: paciente_apellidos_nombres_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paciente_apellidos_nombres_idx ON public.paciente USING btree (apellidos, nombres);


--
-- Name: paciente_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX paciente_codigo_key ON public.paciente USING btree (codigo);


--
-- Name: paciente_numero_documento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paciente_numero_documento_idx ON public.paciente USING btree (numero_documento);


--
-- Name: paciente_tipo_documento_numero_documento_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX paciente_tipo_documento_numero_documento_key ON public.paciente USING btree (tipo_documento, numero_documento);


--
-- Name: paciente_usuario_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX paciente_usuario_id_key ON public.paciente USING btree (usuario_id);


--
-- Name: recordatorio_cita_pendiente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recordatorio_cita_pendiente_idx ON public.recordatorio_cita USING btree (estado, actualizado_en);


--
-- Name: usuario_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuario_codigo_key ON public.usuario USING btree (codigo);


--
-- Name: usuario_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuario_username_key ON public.usuario USING btree (username);


--
-- Name: alergia alergia_sin_borrado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER alergia_sin_borrado BEFORE DELETE ON public.alergia FOR EACH ROW EXECUTE FUNCTION public.rechazar_borrado_clinico();


--
-- Name: alergia alergia_sin_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER alergia_sin_truncate BEFORE TRUNCATE ON public.alergia FOR EACH STATEMENT EXECUTE FUNCTION public.rechazar_borrado_clinico();


--
-- Name: antecedente antecedente_sin_borrado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER antecedente_sin_borrado BEFORE DELETE ON public.antecedente FOR EACH ROW EXECUTE FUNCTION public.rechazar_borrado_clinico();


--
-- Name: antecedente antecedente_sin_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER antecedente_sin_truncate BEFORE TRUNCATE ON public.antecedente FOR EACH STATEMENT EXECUTE FUNCTION public.rechazar_borrado_clinico();


--
-- Name: bitacora_auditoria auditoria_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditoria_inmutable BEFORE DELETE OR UPDATE ON public.bitacora_auditoria FOR EACH ROW EXECUTE FUNCTION public.rechazar_cambio_auditoria();


--
-- Name: bitacora_auditoria auditoria_sin_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditoria_sin_truncate BEFORE TRUNCATE ON public.bitacora_auditoria FOR EACH STATEMENT EXECUTE FUNCTION public.rechazar_cambio_auditoria();


--
-- Name: cita cita_notificacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cita_notificacion AFTER INSERT OR UPDATE ON public.cita FOR EACH ROW EXECUTE FUNCTION public.registrar_notificacion_cita();


--
-- Name: consulta consulta_contenido_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consulta_contenido_inmutable BEFORE UPDATE ON public.consulta FOR EACH ROW EXECUTE FUNCTION public.conservar_contenido_consulta();


--
-- Name: consulta consulta_sin_borrado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consulta_sin_borrado BEFORE DELETE ON public.consulta FOR EACH ROW EXECUTE FUNCTION public.rechazar_borrado_clinico();


--
-- Name: consulta consulta_sin_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consulta_sin_truncate BEFORE TRUNCATE ON public.consulta FOR EACH STATEMENT EXECUTE FUNCTION public.rechazar_borrado_clinico();


--
-- Name: consulta_diagnostico diagnostico_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER diagnostico_inmutable BEFORE DELETE OR UPDATE ON public.consulta_diagnostico FOR EACH ROW EXECUTE FUNCTION public.conservar_detalle_consulta();


--
-- Name: consulta_diagnostico diagnostico_sin_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER diagnostico_sin_truncate BEFORE TRUNCATE ON public.consulta_diagnostico FOR EACH STATEMENT EXECUTE FUNCTION public.conservar_detalle_consulta();


--
-- Name: evaluacion_previa evaluacion_previa_preserve; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER evaluacion_previa_preserve BEFORE DELETE OR UPDATE ON public.evaluacion_previa FOR EACH ROW EXECUTE FUNCTION public.preserve_evaluacion_previa();


--
-- Name: medico medico_codigo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER medico_codigo BEFORE INSERT OR UPDATE ON public.medico FOR EACH ROW EXECUTE FUNCTION public.asignar_codigo_actor();


--
-- Name: paciente paciente_codigo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER paciente_codigo BEFORE INSERT OR UPDATE ON public.paciente FOR EACH ROW EXECUTE FUNCTION public.asignar_codigo_actor();


--
-- Name: receta_item receta_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receta_inmutable BEFORE DELETE OR UPDATE ON public.receta_item FOR EACH ROW EXECUTE FUNCTION public.conservar_detalle_consulta();


--
-- Name: receta_item receta_sin_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receta_sin_truncate BEFORE TRUNCATE ON public.receta_item FOR EACH STATEMENT EXECUTE FUNCTION public.conservar_detalle_consulta();


--
-- Name: usuario usuario_codigo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER usuario_codigo BEFORE INSERT OR UPDATE ON public.usuario FOR EACH ROW EXECUTE FUNCTION public.asignar_codigo_actor();


--
-- Name: alergia alergia_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alergia
    ADD CONSTRAINT alergia_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.paciente(id) ON DELETE RESTRICT;


--
-- Name: antecedente antecedente_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecedente
    ADD CONSTRAINT antecedente_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.paciente(id) ON DELETE RESTRICT;


--
-- Name: bitacora_auditoria bitacora_auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria
    ADD CONSTRAINT bitacora_auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cita cita_consultorio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT cita_consultorio_id_fkey FOREIGN KEY (consultorio_id) REFERENCES public.consultorio(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cita cita_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT cita_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cita cita_medico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT cita_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medico(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cita cita_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cita
    ADD CONSTRAINT cita_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.paciente(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cobro cobro_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobro
    ADD CONSTRAINT cobro_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuario(id);


--
-- Name: cobro cobro_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobro
    ADD CONSTRAINT cobro_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.paciente(id);


--
-- Name: cobro cobro_pagado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobro
    ADD CONSTRAINT cobro_pagado_por_fkey FOREIGN KEY (pagado_por) REFERENCES public.usuario(id);


--
-- Name: consulta consulta_anulado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta
    ADD CONSTRAINT consulta_anulado_por_fkey FOREIGN KEY (anulado_por) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: consulta consulta_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta
    ADD CONSTRAINT consulta_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.cita(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: consulta_diagnostico consulta_diagnostico_cie10_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta_diagnostico
    ADD CONSTRAINT consulta_diagnostico_cie10_codigo_fkey FOREIGN KEY (cie10_codigo) REFERENCES public.cie10(codigo) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: consulta_diagnostico consulta_diagnostico_consulta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta_diagnostico
    ADD CONSTRAINT consulta_diagnostico_consulta_id_fkey FOREIGN KEY (consulta_id) REFERENCES public.consulta(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: consulta consulta_medico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta
    ADD CONSTRAINT consulta_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medico(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: consulta consulta_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consulta
    ADD CONSTRAINT consulta_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.paciente(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evaluacion_previa evaluacion_previa_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_previa
    ADD CONSTRAINT evaluacion_previa_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.cita(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evaluacion_previa evaluacion_previa_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluacion_previa
    ADD CONSTRAINT evaluacion_previa_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: horario_medico horario_medico_consultorio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_medico
    ADD CONSTRAINT horario_medico_consultorio_id_fkey FOREIGN KEY (consultorio_id) REFERENCES public.consultorio(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: horario_medico horario_medico_medico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_medico
    ADD CONSTRAINT horario_medico_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medico(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: medico medico_especialidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medico
    ADD CONSTRAINT medico_especialidad_id_fkey FOREIGN KEY (especialidad_id) REFERENCES public.especialidad(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: medico medico_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medico
    ADD CONSTRAINT medico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notificacion_cita notificacion_cita_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_cita
    ADD CONSTRAINT notificacion_cita_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.cita(id) ON DELETE RESTRICT;


--
-- Name: notificacion_portal notificacion_portal_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacion_portal
    ADD CONSTRAINT notificacion_portal_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: paciente paciente_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paciente
    ADD CONSTRAINT paciente_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: preferencias_portal preferencias_portal_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_portal
    ADD CONSTRAINT preferencias_portal_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuario(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: receta_item receta_item_consulta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receta_item
    ADD CONSTRAINT receta_item_consulta_id_fkey FOREIGN KEY (consulta_id) REFERENCES public.consulta(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: recordatorio_cita recordatorio_cita_cita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordatorio_cita
    ADD CONSTRAINT recordatorio_cita_cita_id_fkey FOREIGN KEY (cita_id) REFERENCES public.cita(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--


