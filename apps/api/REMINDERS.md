# Recordatorios por correo (HU02)

Cada minuto, la API busca citas programadas, confirmadas o reprogramadas que comienzan dentro de las próximas 24 horas. El correo contiene fecha, hora de Lima y especialidad; no incluye diagnóstico, receta ni motivo de consulta. No envía mensajes para solicitudes pendientes de confirmación, citas canceladas, atendidas, pasadas o con llegada registrada.

## Buzón local

1. Aplicar las migraciones desde `apps/api`: `npm.cmd run db:migrate`.
2. Desde la raíz: `docker compose up -d mailpit`.
3. Configurar en `apps/api/.env` las variables de correo de `.env.example`, incluyendo `REMINDERS_ENABLED=true`, `SMTP_HOST=127.0.0.1` y `SMTP_PORT=1025`.
4. Reiniciar la API y abrir `http://localhost:8025`.

Mailpit captura los mensajes sin enviarlos a Internet. Para una demostración, crear una cita futura dentro de 24 horas con un paciente ficticio que tenga correo y esperar hasta un minuto. El buzón mostrará el recordatorio. Las citas posteriores se incorporan automáticamente al entrar en la ventana de 24 horas. Si la API estuvo detenida, envía los pendientes al reiniciar mientras la cita no haya comenzado. La API debe permanecer ejecutándose.

## Persistencia y fallos

`recordatorio_cita` conserva una entrada única por cita e instante de inicio. Una operación atómica reclama cada envío; otras instancias no pueden reclamar la misma entrada. Antes del envío se comprueba de nuevo el estado y horario de la cita. Reprogramar permite un recordatorio para el nuevo horario y omite el antiguo si aún no se envió. Los mensajes ya entregados no pueden retirarse.

Los rechazos temporales explícitos de SMTP y las conexiones rechazadas se reintentan cada cinco minutos, hasta cinco intentos. Un rechazo permanente queda `fallido`. Un resultado ambiguo queda `incierto`, sin reenvío automático para evitar duplicación. Si el proceso termina durante el envío, queda `enviando`; debe revisarse en el buzón antes de decidir su recuperación. SMTP no garantiza entrega exactamente una vez ni confirmación de lectura. Un estado `enviado` significa aceptación por el servidor SMTP.

Consulta operativa, sin direcciones ni contenido de correo:

```sql
SELECT id, cita_id, inicio, estado, intentos, actualizado_en, enviado_en
FROM recordatorio_cita ORDER BY id DESC;
```

## Proveedor externo

Cambiar `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER` y `SMTP_PASSWORD` en el entorno local. Para puerto 465 usar `SMTP_SECURE=true`; en otros puertos se puede negociar STARTTLS. No versionar credenciales. La configuración SMTP se limita al servidor; el navegador no recibe secretos. Las pruebas automatizadas no habilitan el planificador ni contactan pacientes.

## Verificación realizada

Compilación y lint de API correctos. Diez pruebas aprobadas del planificador, formato de Lima, estados excluidos, cambio de horario, reintentos, resultados ambiguos y envío SMTP real a un receptor efímero local. Una prueba PostgreSQL aprobada en esquema aislado aplicando todas las migraciones: dos trabajadores concurrentes entregan una sola vez, persisten el envío y omiten el horario obsoleto. La migración también se aplicó en la base local. Mailpit no pudo iniciarse en esta terminal porque `docker` no está disponible; el planificador requiere habilitación explícita en `.env` y no se envió correo a pacientes reales.
