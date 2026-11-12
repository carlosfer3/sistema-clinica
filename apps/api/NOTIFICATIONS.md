# Avisos de citas por correo (HU11)

La base de datos registra automáticamente un evento al crear, reprogramar o cancelar una cita, y al confirmar una solicitud del portal. El evento se guarda en la misma transacción que la cita: si falla la reserva o auditoría y se revierte la transacción, no queda ningún aviso. No se generan avisos retroactivos para registros existentes. Actualizaciones sin cambios y confirmaciones repetidas no agregan eventos.

El correo indica número de cita, fecha/hora de Lima y especialidad. La reprogramación incluye el horario anterior; la cancelación identifica el horario cancelado. Las solicitudes del portal dicen explícitamente que están pendientes de confirmación. No contiene diagnósticos, receta ni motivo clínico. La dirección y datos del evento se capturan al realizar la operación. Los avisos describen eventos históricos; el estado actual se consulta en el portal.

## Activación

Aplicar `npm.cmd run db:migrate`, configurar `NOTIFICATIONS_ENABLED=true` en `apps/api/.env` y reiniciar la API. Usa el mismo SMTP de los [recordatorios](REMINDERS.md). Con Mailpit iniciado mediante `docker compose up -d mailpit`, los correos aparecen en `http://localhost:8025`, sin entrega a Internet. Un proceso revisa la cola cada 15 segundos; requiere mantener la API ejecutándose.

La tabla `notificacion_cita` guarda estado, intentos, fechas y los datos mínimos del aviso. Cada evento se reclama atómicamente; se conserva el orden por cita mientras haya eventos previos pendientes o en envío. Conexiones rechazadas y rechazos SMTP temporales se reintentan cada cinco minutos hasta cinco veces. Fallos permanentes quedan `fallido`; resultados ambiguos quedan `incierto` y no se reenvían automáticamente. Un proceso que termina durante el envío puede dejar `enviando`: revisar el buzón antes de recuperar ese registro. SMTP no ofrece garantía de entrega exactamente una vez. `enviado` significa que el servidor SMTP aceptó el mensaje.

No se envía correo desde una petición HTTP: la operación clínica no depende de que SMTP esté disponible. No hay rutas públicas para disparar envíos ni credenciales SMTP en el navegador.

## Validación

Compilación de API, cinco pruebas de contenido y las diez pruebas previas de recordatorios aprobadas, incluyendo envío SMTP real a un receptor local efímero. Dos pruebas PostgreSQL en esquema aislado verifican las migraciones, envío concurrente sin duplicados, eventos de creación/reprogramación/cancelación, ausencia de duplicados en actualizaciones repetidas y reversión del evento con la transacción. Docker no está disponible en esta terminal: Mailpit y la habilitación del entorno local quedan como pasos de configuración; no se contactaron pacientes reales.
