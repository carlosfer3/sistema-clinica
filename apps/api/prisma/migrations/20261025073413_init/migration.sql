-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('admision', 'medico', 'enfermeria', 'laboratorio', 'cajero', 'gerencia', 'paciente');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('programada', 'confirmada', 'reprogramada', 'cancelada', 'atendida', 'no_asistio');

-- CreateEnum
CREATE TYPE "CanalOrigen" AS ENUM ('presencial', 'telefono', 'portal');

-- CreateEnum
CREATE TYPE "ModalidadCita" AS ENUM ('presencial', 'virtual');

-- CreateEnum
CREATE TYPE "EstadoConsulta" AS ENUM ('activo', 'anulado');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paciente" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo_documento" VARCHAR(12) NOT NULL,
    "numero_documento" VARCHAR(15) NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "sexo" CHAR(1) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "correo" VARCHAR(120) NOT NULL,
    "direccion" VARCHAR(200),

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especialidad" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),

    CONSTRAINT "especialidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medico" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "especialidad_id" SMALLINT NOT NULL,
    "cmp" VARCHAR(10) NOT NULL,

    CONSTRAINT "medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cita" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "medico_id" INTEGER NOT NULL,
    "fecha_hora_inicio" TIMESTAMPTZ NOT NULL,
    "fecha_hora_fin" TIMESTAMPTZ NOT NULL,
    "motivo" VARCHAR(300),
    "estado" "EstadoCita" NOT NULL DEFAULT 'programada',
    "canal_origen" "CanalOrigen" NOT NULL DEFAULT 'presencial',
    "modalidad" "ModalidadCita" NOT NULL DEFAULT 'presencial',
    "enlace_virtual" VARCHAR(300),
    "llegada_en" TIMESTAMPTZ,
    "creado_por" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "medico_id" INTEGER NOT NULL,
    "cita_id" INTEGER,
    "fecha_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" VARCHAR(300) NOT NULL,
    "indicaciones" TEXT,
    "estado" "EstadoConsulta" NOT NULL DEFAULT 'activo',
    "motivo_anulacion" VARCHAR(300),
    "anulado_por" INTEGER,
    "anulado_en" TIMESTAMPTZ,

    CONSTRAINT "consulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora_auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "accion" VARCHAR(50) NOT NULL,
    "recurso" VARCHAR(100) NOT NULL,
    "detalles" TEXT,
    "ip_origen" VARCHAR(45),
    "fecha_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_username_key" ON "usuario"("username");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_usuario_id_key" ON "paciente"("usuario_id");

-- CreateIndex
CREATE INDEX "paciente_numero_documento_idx" ON "paciente"("numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_tipo_documento_numero_documento_key" ON "paciente"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "especialidad_nombre_key" ON "especialidad"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "medico_usuario_id_key" ON "medico"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "medico_cmp_key" ON "medico"("cmp");

-- CreateIndex
CREATE INDEX "cita_medico_id_fecha_hora_inicio_idx" ON "cita"("medico_id", "fecha_hora_inicio");

-- CreateIndex
CREATE UNIQUE INDEX "consulta_cita_id_key" ON "consulta"("cita_id");

-- CreateIndex
CREATE INDEX "consulta_paciente_id_fecha_hora_idx" ON "consulta"("paciente_id", "fecha_hora");

-- AddForeignKey
ALTER TABLE "paciente" ADD CONSTRAINT "paciente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medico" ADD CONSTRAINT "medico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medico" ADD CONSTRAINT "medico_especialidad_id_fkey" FOREIGN KEY ("especialidad_id") REFERENCES "especialidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_medico_id_fkey" FOREIGN KEY ("medico_id") REFERENCES "medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta" ADD CONSTRAINT "consulta_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_auditoria" ADD CONSTRAINT "bitacora_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
