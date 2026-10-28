Project clinica_san_rafael {
  database_type: 'PostgreSQL'
  Note: 'Modelo objetivo. Implementado en Prisma: usuario, paciente, medico, especialidad, cita, consulta, bitacora_auditoria, antecedente y alergia. Las demas tablas siguen planificadas.'
}

Enum rol_usuario {
  admision
  medico
  enfermeria
  laboratorio
  cajero
  gerencia
  paciente
}

// ===== NUCLEO COMUN (gris) =====
Table usuario [headercolor: #7f8c8d] {
  id int [pk, increment]
  rol rol_usuario [not null]
  username varchar(50) [not null, unique]
  password_hash varchar(255) [not null, note: 'argon2/bcrypt con sal']
  nombres varchar(100) [not null]
  apellidos varchar(100) [not null]
  activo boolean [not null, default: true]
  creado_en timestamptz [not null, default: `now()`]
}

Table especialidad [headercolor: #7f8c8d] {
  id smallint [pk, increment]
  nombre varchar(100) [not null, unique]
  descripcion varchar(255)
}

Table medico [headercolor: #7f8c8d] {
  id int [pk, increment]
  usuario_id int [not null, unique, ref: - usuario.id]
  especialidad_id smallint [not null, ref: > especialidad.id]
  cmp varchar(10) [not null, unique, note: 'Colegio Medico del Peru']
}

Table servicio [headercolor: #7f8c8d] {
  id int [pk, increment]
  codigo varchar(20) [not null, unique]
  nombre varchar(120) [not null]
  tipo varchar(15) [not null, note: 'consulta, laboratorio, imagenes, procedimiento']
}

Table bitacora_auditoria [headercolor: #7f8c8d] {
  id int [pk, increment]
  usuario_id int [ref: > usuario.id, note: 'Nulo para acceso sin autenticacion']
  fecha_hora timestamptz [not null, default: `now()`]
  accion varchar(50) [not null, note: 'LOGIN, LOGIN_FAILED, ACCESS_DENIED, SEARCH_PATIENTS, READ_CLINICAL_PROFILE, CREATE_PATIENT']
  recurso varchar(100) [not null]
  detalles text
  ip_origen varchar(45)
  Note: 'Triggers rechazan UPDATE, DELETE y TRUNCATE. En despliegue usar rol de aplicacion sin privilegios DDL ni superusuario.'
}

// ===== M1 HCE (azul) =====
Table paciente [headercolor: #2980b9] {
  id int [pk, increment]
  usuario_id int [unique, ref: - usuario.id, note: 'Solo si tiene cuenta en el portal']
  tipo_documento varchar(12) [not null, note: 'DNI, CE, PASAPORTE']
  numero_documento varchar(15) [not null]
  nombres varchar(100) [not null]
  apellidos varchar(100) [not null]
  fecha_nacimiento date [not null]
  sexo char(1) [not null, note: 'M, F']
  telefono varchar(20) [not null]
  correo varchar(120) [not null]
  direccion varchar(200)

  indexes {
    (tipo_documento, numero_documento) [unique, name: 'uq_paciente_documento']
    (apellidos, nombres) [name: 'ix_paciente_nombre']
  }
}

Table antecedente [headercolor: #2980b9] {
  id int [pk, increment]
  paciente_id int [not null, ref: > paciente.id]
  tipo varchar(30) [not null, note: 'personal, familiar, quirurgico, cronica']
  descripcion varchar(300) [not null]
  desde date
  registrado_en timestamptz [not null, default: `now()`]
}

Table alergia [headercolor: #2980b9] {
  id int [pk, increment]
  paciente_id int [not null, ref: > paciente.id]
  sustancia varchar(100) [not null]
  reaccion varchar(200)
}

Table cie10 [headercolor: #2980b9] {
  codigo varchar(10) [pk]
  descripcion varchar(250) [not null]
}

Table consulta [headercolor: #2980b9] {
  id int [pk, increment]
  paciente_id int [not null, ref: > paciente.id]
  medico_id int [not null, ref: > medico.id]
  cita_id int [unique, ref: - cita.id, note: 'Opcional: consulta sin cita (emergencia)']
  fecha_hora timestamptz [not null, default: `now()`]
  motivo varchar(300) [not null]
  indicaciones text
  estado varchar(10) [not null, default: 'activo', note: 'activo, anulado']
  motivo_anulacion varchar(300)
  anulado_por int [ref: > usuario.id]
  anulado_en timestamptz

  indexes {
    (paciente_id, fecha_hora) [name: 'ix_consulta_paciente_fecha']
  }
  Note: 'CHECK ck_consulta_anulacion exige motivo no vacio, usuario y fecha al anular. Triggers rechazan DELETE y TRUNCATE.'
}

Table consulta_diagnostico [headercolor: #2980b9] {
  id int [pk, increment]
  consulta_id int [not null, ref: > consulta.id]
  cie10_codigo varchar(10) [not null, ref: > cie10.codigo]
  tipo varchar(15) [not null, default: 'principal', note: 'principal, secundario']

  indexes {
    (consulta_id, cie10_codigo) [unique]
  }
}

Table receta_item [headercolor: #2980b9] {
  id int [pk, increment]
  consulta_id int [not null, ref: > consulta.id]
  medicamento varchar(150) [not null]
  dosis varchar(80) [not null]
  frecuencia varchar(80) [not null]
  duracion_dias smallint [not null]
}

Table signos_vitales [headercolor: #2980b9] {
  id int [pk, increment]
  paciente_id int [not null, ref: > paciente.id]
  registrado_por int [not null, ref: > usuario.id]
  cita_id int [ref: > cita.id]
  fecha_hora timestamptz [not null, default: `now()`]
  presion_sistolica smallint
  presion_diastolica smallint
  frecuencia_cardiaca smallint
  temperatura_c decimal(4,1)
  saturacion_o2 smallint
  peso_kg decimal(5,2)
  talla_cm decimal(5,1)
  estado varchar(10) [not null, default: 'activo', note: 'activo, anulado']
  motivo_anulacion varchar(300)
  anulado_por int [ref: > usuario.id]
  anulado_en timestamptz
  Note: 'CHECK: si estado = anulado, motivo_anulacion, anulado_por y anulado_en son obligatorios.'
}

// ===== M2 CITAS (verde) =====
Table consultorio [headercolor: #27ae60] {
  id smallint [pk, increment]
  nombre varchar(40) [not null, unique]
  activo boolean [not null, default: true]
}

Table horario_medico [headercolor: #27ae60] {
  id int [pk, increment]
  medico_id int [not null, ref: > medico.id]
  consultorio_id smallint [not null, ref: > consultorio.id]
  dia_semana smallint [not null, note: '1=lunes ... 7=domingo']
  hora_inicio time [not null]
  hora_fin time [not null]
  duracion_cita_min smallint [not null, default: 20]

  indexes {
    (medico_id, dia_semana, hora_inicio) [unique]
  }
  Note: 'CHECK: hora_fin > hora_inicio'
}

Table cita [headercolor: #27ae60] {
  id int [pk, increment]
  paciente_id int [not null, ref: > paciente.id]
  medico_id int [not null, ref: > medico.id]
  fecha_hora_inicio timestamptz [not null]
  fecha_hora_fin timestamptz [not null]
  motivo varchar(300)
  estado varchar(15) [not null, default: 'programada', note: 'programada, confirmada, reprogramada, cancelada, atendida, no_asistio']
  canal_origen varchar(12) [not null, default: 'presencial', note: 'presencial, telefono, portal']
  modalidad varchar(10) [not null, default: 'presencial', note: 'presencial, virtual']
  enlace_virtual varchar(300) [note: 'Solo si modalidad = virtual']
  llegada_en timestamptz [note: 'Hora en que el paciente se presenta; base del tiempo de espera']
  creado_por int [not null, ref: > usuario.id, note: 'Si agenda desde el portal, es la cuenta del paciente']
  creado_en timestamptz [not null, default: `now()`]

  indexes {
    (medico_id, fecha_hora_inicio) [name: 'ix_cita_medico_fecha']
    (paciente_id, fecha_hora_inicio) [name: 'ix_cita_paciente_fecha']
  }
  Note: 'UNIQUE parcial (medico_id, fecha_hora_inicio) WHERE estado NOT IN (cancelada, reprogramada): evita doble reserva.'
}

Table notificacion [headercolor: #27ae60] {
  id int [pk, increment]
  cita_id int [not null, ref: > cita.id]
  canal varchar(10) [not null, note: 'sms, correo, whatsapp']
  plantilla varchar(40) [not null, note: 'confirmacion, recordatorio_24h, reprogramacion, cancelacion']
  programada_para timestamptz [not null]
  estado varchar(10) [not null, default: 'pendiente', note: 'pendiente, enviado, fallido']
  intentos smallint [not null, default: 0]
  enviada_en timestamptz

  indexes {
    (estado, programada_para) [name: 'ix_notif_cola']
  }
  Note: 'Destinatario se obtiene del paciente de la cita. Sin datos clinicos.'
}

// ===== M3 LABORATORIO E IMAGENES (naranja) =====
Table orden [headercolor: #e67e22] {
  id int [pk, increment]
  consulta_id int [not null, ref: > consulta.id]
  tipo varchar(12) [not null, note: 'laboratorio, imagenes']
  solicitada_en timestamptz [not null, default: `now()`]
  Note: 'Quien la solicita es el medico de la consulta. Estado se deduce de sus detalles.'
}

Table orden_detalle [headercolor: #e67e22] {
  id int [pk, increment]
  orden_id int [not null, ref: > orden.id]
  servicio_id int [not null, ref: > servicio.id]
  valor text [note: 'Nulo = pendiente']
  unidad varchar(30)
  rango_referencia varchar(60)
  registrado_por int [ref: > usuario.id]
  registrado_en timestamptz

  indexes {
    (orden_id, servicio_id) [unique]
  }
  Note: 'CHECK: valor, registrado_por y registrado_en son todos nulos o todos llenos.'
}

// ===== M4 FACTURACION Y CONVENIOS (morado) =====
Table convenio [headercolor: #8e44ad] {
  id smallint [pk, increment]
  nombre varchar(80) [not null, unique, note: 'Particular, cada EPS/aseguradora, SOAT']
  tipo varchar(12) [not null, note: 'particular, eps, soat']
  copago_porcentaje decimal(5,2) [not null, default: 0]
  activo boolean [not null, default: true]
}

Table paciente_convenio [headercolor: #8e44ad] {
  id int [pk, increment]
  paciente_id int [not null, ref: > paciente.id]
  convenio_id smallint [not null, ref: > convenio.id]
  numero_poliza varchar(40)
  vigente_desde date [not null]
  vigente_hasta date

  indexes {
    (paciente_id, convenio_id, vigente_desde) [unique]
  }
}

Table tarifario [headercolor: #8e44ad] {
  id int [pk, increment]
  convenio_id smallint [not null, ref: > convenio.id]
  servicio_id int [not null, ref: > servicio.id]
  precio decimal(10,2) [not null]

  indexes {
    (convenio_id, servicio_id) [unique]
  }
}

Table comprobante [headercolor: #8e44ad] {
  id int [pk, increment]
  cita_id int [ref: > cita.id]
  paciente_id int [not null, ref: > paciente.id]
  convenio_id smallint [not null, ref: > convenio.id]
  serie varchar(4) [not null]
  numero int [not null]
  total decimal(10,2) [not null]
  copago decimal(10,2) [not null, default: 0]
  estado varchar(10) [not null, default: 'emitido', note: 'emitido, pagado, anulado']
  emitido_por int [not null, ref: > usuario.id]
  emitido_en timestamptz [not null, default: `now()`]
  motivo_anulacion varchar(300)
  anulado_por int [ref: > usuario.id]
  anulado_en timestamptz

  indexes {
    (serie, numero) [unique]
  }
  Note: 'Sin DELETE. Total y copago se guardan como foto al emitir.'
}

Table comprobante_detalle [headercolor: #8e44ad] {
  id int [pk, increment]
  comprobante_id int [not null, ref: > comprobante.id]
  servicio_id int [not null, ref: > servicio.id]
  cantidad smallint [not null, default: 1]
  precio_unitario decimal(10,2) [not null, note: 'Copia del precio vigente al emitir']
}

// ===== GRUPOS =====
TableGroup nucleo_comun {
  usuario
  especialidad
  medico
  servicio
  bitacora_auditoria
}

TableGroup m1_hce {
  paciente
  antecedente
  alergia
  cie10
  consulta
  consulta_diagnostico
  receta_item
  signos_vitales
}

TableGroup m2_citas {
  consultorio
  horario_medico
  cita
  notificacion
}

TableGroup m3_laboratorio_imagenes {
  orden
  orden_detalle
}

TableGroup m4_facturacion {
  convenio
  paciente_convenio
  tarifario
  comprobante
  comprobante_detalle
}
