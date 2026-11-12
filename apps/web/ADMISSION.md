# Interfaz de admisión

Desde `apps/web`, instalar dependencias con `npm.cmd ci`, copiar `.env.example` a `.env.local` y ejecutar `npm.cmd run dev`. `VITE_API_URL` apunta a la API con el prefijo `/api` (por defecto `http://localhost:3000/api`). El `CORS_ORIGIN` del backend debe coincidir con el origen de la web.

El acceso usa `POST /api/auth/login` y comprueba el rol actual con `GET /api/auth/me`. La vista de admisión requiere `admision`; las cuentas `enfermeria` acceden a su propia pantalla de evaluación previa. El backend conserva sus propias restricciones. La sesión del personal se conserva en `sessionStorage` durante la pestaña y se revalida con la API al recargar. Cerrar sesión o recibir 401 elimina el token; no se guardan contraseñas. No hay recuperación de contraseña ni creación de cuentas desde esta pantalla.

El flujo de agenda permite buscar pacientes existentes, consultar especialidades y médicos con horarios habilitados (`GET /api/agenda/catalog`), filtrar disponibilidad por fecha y reservar una cita presencial. Los horarios se muestran siempre en `America/Lima`, independientemente de la zona del equipo. El motivo es opcional y el canal de solicitud puede ser presencial o telefónico.

Antes de confirmar se muestra el paciente, médico, consultorio y horario. Una respuesta 409 elimina la selección y actualiza los turnos; una respuesta 401 descarta la sesión y los datos de la pantalla. No se reintentan automáticamente las reservas: ante un fallo de conexión o del servidor, el resultado puede ser incierto y se pide verificarlo antes de volver a reservar. Cambiar los filtros invalida los turnos anteriores. El botón de confirmación y la salida se deshabilitan mientras se envía una reserva.

El registro de pacientes está disponible en **Reservar cita → Registrar nuevo paciente**. En **Citas del día** se puede reprogramar con motivo obligatorio y disponibilidad del mismo médico, cancelar y registrar llegada mediante modales. La administración de horarios sigue pendiente. Si no hay médicos con horarios, cargar los datos ficticios siguiendo el README de la raíz; no se crean automáticamente desde la web.

## Registro de pacientes desde admisión

El formulario solicita tipo y número de documento, nombres, apellidos, fecha de nacimiento, sexo, teléfono y correo obligatorios; dirección opcional. DNI requiere ocho dígitos y conserva ceros iniciales; CE y pasaporte aceptan hasta quince letras o números. No admite nacimiento futuro. Solo se envían datos demográficos y de contacto a `POST /patients`, sin antecedentes, alergias ni cuenta de portal. La API conserva sus validaciones, permisos de admisión y auditoría transaccional existentes.

Al guardar, el paciente queda seleccionado y se puede consultar disponibilidad y confirmar su cita sin pasar por Swagger. Si se buscó previamente un DNI completo, se precarga al abrir el formulario. Abrir el registro descarta la selección previa de paciente y turno para evitar una reserva con datos anteriores. Cancelar descarta el borrador sin escribir en la API.

Un 409 indica documento existente: el formulario conserva los datos ingresados y permite **Consultar paciente existente**, usando el ID entregado por el servidor. Se comprueba el documento y se muestra su identidad antes de ofrecer **Seleccionar paciente existente**. No se sobrescribe información ni se crea un segundo paciente. El alta también admite CE/pasaporte y su selección inmediata; la búsqueda general continúa limitada a DNI exacto.

Durante el envío se bloquean edición, cancelación, reserva, navegación y cierre de sesión; un bloqueo adicional impide solicitudes simultáneas. Un 400 conserva los datos para corregirlos, 403 informa falta de permisos y 401 cierra sesión y descarta el formulario. Los fallos de conexión/servidor muestran resultado incierto y piden verificar el registro antes de un nuevo envío; nunca se reintenta automáticamente. El borrador permanece solo en memoria.

Pruebas: `npm.cmd run test:e2e -- patient-registration.spec.ts`. Incluyen creación y reserva, duplicado y revisión de identidad, ceros iniciales, tipos de documento, validación, cancelación, permisos visuales, sesión, red y pantalla móvil. Usan API simulada; las pruebas PostgreSQL del backend (`npm.cmd run test:db -- integrity.db-spec.ts`) verifican persistencia, duplicados, permisos y auditoría por separado.

Verificación: `npm.cmd run build`, `npm.cmd run lint` y `npm.cmd run test:e2e`. Las pruebas de navegador usan Playwright con Microsoft Edge instalado. Para otro navegador Chromium compatible, definir `PLAYWRIGHT_CHANNEL` (por ejemplo, `chrome`). Las pruebas interceptan la API y usan datos ficticios; no equivalen a una prueba integrada con PostgreSQL.

## Citas del día

La navegación permite alternar entre **Reservar cita** y **Citas del día**. El selector **Fecha de las citas** permite consultar días pasados, hoy y fechas futuras; el botón **Hoy** vuelve a la fecha actual de Lima. El listado usa `GET /api/agenda/appointments?fecha=YYYY-MM-DD`, páginas de 20 registros y filtro por estado. Cambiar la fecha conserva el estado, vuelve a la primera página, descarta la confirmación de llegada y elimina resultados anteriores mientras carga. Actualizar y paginar conservan la fecha. Si se vacía el selector, se pide una fecha y no se envía una consulta vacía. No muestra información clínica.

La API interpreta el día entre medianoche local inclusive y la siguiente medianoche exclusiva en `America/Lima` (UTC−05:00). `fecha` es opcional por compatibilidad: si se omite, se usa hoy según el servidor. Se rechazan formatos distintos de `YYYY-MM-DD` y fechas inexistentes. Permisos, auditoría y filtros por médico/estado siguen vigentes. No requiere migración ni seed.

**Registrar llegada** solo se ofrece al consultar hoy. En otros días se muestran las citas sin esa acción, y la API rechaza igualmente cualquier intento de registrar llegada fuera de hoy. La bandeja de enfermería y la médica continúan limitadas a hoy.

**Registrar llegada** muestra paciente, documento, médico y hora para confirmar identidad y presencia física antes de enviar `POST /api/agenda/appointments/:id/arrival` con `{}`. La API mantiene la validación final. Una respuesta exitosa actualiza la lista sin marcar la cita como atendida; los reintentos conservan la primera llegada. Citas virtuales, canceladas, atendidas, con inasistencia o con llegada registrada no muestran el botón. Se bloquean navegación, filtros y cierre de sesión durante el envío. Un 401 cierra la sesión; los conflictos actualizan la lista y los fallos inciertos piden comprobar el resultado sin reintentar automáticamente.

## Enfermería: evaluación previa (HU04/HU10)

Ingresar con una cuenta activa de enfermería (por ejemplo, `demo.enfermeria` creada por el seed y su contraseña local). El rol se comprueba con `/auth/me`; la web muestra directamente **Evaluación previa** y oculta las opciones de admisión. Los roles restantes todavía no tienen pantalla en esta versión.

La lista de pendientes usa `/agenda/nursing-queue`, con páginas de 20 registros, fecha de Lima y orden del servidor. Solo aparecen pacientes con asistencia registrada y preparación pendiente. Se muestran identificación, edad, cita, llegada, médico y especialidad. **Registrar signos vitales** abre el formulario de la cita seleccionada y muestra su identificación antes de guardar.

Son obligatorios temperatura, presión sistólica/diastólica, frecuencia cardíaca, frecuencia respiratoria y saturación. Peso, talla y observaciones son opcionales. Las entradas numéricas incluyen unidades y las mismas restricciones técnicas del contrato de API; no se precargan mediciones. Autor, fecha y paciente no se envían desde el formulario: el servidor los determina mediante sesión y cita.

Al guardar, se envía una única petición `POST /agenda/appointments/:id/vital-signs`; se bloquean formulario, salida y regreso mientras está pendiente. El éxito devuelve la lista a la primera página y confirma la preparación completada; la API retira al paciente de pendientes. Un 400 conserva las mediciones para corregirlas; 404/409 actualizan la lista sin sobrescribir; 401 descarta sesión y formulario; los fallos de red no reintentan automáticamente y obligan a actualizar pendientes antes de seleccionar otra cita. Volver a la lista descarta el borrador.

Enfermería no consulta el perfil clínico, antecedentes, indicaciones, recetas, resultados ni evaluaciones anteriores. Los datos y el token permanecen en memoria. Pruebas: `npm.cmd run test:e2e -- nursing`; se usa API simulada y no sustituye la validación integrada con PostgreSQL.


### Reprogramar y cancelar citas (HU05)

En **Citas del día**, seleccionar la fecha de la cita y usar **Reprogramar** o **Cancelar cita**. Ambas acciones requieren confirmación. La reprogramación consulta turnos disponibles de una nueva fecha en Lima y conserva el paciente, el médico y el ID de la cita. Solo se permite un turno futuro completo distinto al original. Al confirmar se revalida disponibilidad; si otro usuario ocupó el turno, se conserva la cita original y se solicita una nueva selección. Cancelar cambia el estado sin borrar el registro y libera el turno.

Solo admisión puede modificar citas programadas, confirmadas o reprogramadas, sin llegada, preparación, evaluación ni consulta registradas. Las citas cerradas no se modifican. Una cita pasada que siga en un estado modificable puede cancelarse o moverse a un turno futuro. No se aplica un plazo de anticipación adicional.

API: `POST /api/agenda/appointments/:id/reschedule` con `{ "inicio": "2099-01-09T08:20:00-05:00" }`; `POST /api/agenda/appointments/:id/cancel` con `{}`. Respuestas 200 con el contrato `Appointment`; 400 para entrada inválida, 404 si no existe la cita y 409 para estado incompatible o turno ocupado. Se rechazan campos adicionales. La cancelación repetida devuelve 409. Ambas operaciones bloquean la cita; la reprogramación también usa el bloqueo del médico compartido con reservas. El cambio y la auditoría se guardan juntos, incluyendo horarios y estado anteriores. No requieren migraciones nuevas.

Durante el guardado se bloquean navegación, sesión y doble envío. Los errores de conexión no reintentan la escritura; se actualiza la lista para comprobar el resultado. No se envían notificaciones al paciente en este incremento.

Validación del incremento (11/11/2026): build y lint de API/web correctos; 285 pruebas HTTP con persistencia simulada aprobadas (`npm.cmd run test:e2e -- --maxWorkers=2`, API) y 15 pruebas de navegador aprobadas (`npm.cmd run test:e2e -- daily-appointments.spec.ts --workers=2 --reporter=line`, web), incluyendo confirmaciones, conflictos, doble envío, conexión incierta y ancho móvil. Playwright utiliza API simulada. Se agregó una prueba PostgreSQL de concurrencia entre reserva/reprogramación, liberación de horarios y rollback ante fallo de auditoría en `integrity.db-spec.ts`; su ejecución quedó pendiente porque `localhost:5433` no responde. El flujo con web, API y PostgreSQL reales y el cierre de DoD siguen pendientes.
