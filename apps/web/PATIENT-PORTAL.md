# Portal del paciente

## Notificaciones y progreso de la cita

La campana muestra **Notificaciones de tus citas**, con avisos persistidos de registro, confirmación por admisión, reprogramación y cancelación, además de las alertas generales existentes. `GET /portal/notifications` usa el paciente vinculado a la sesión, paginación y auditoría de lectura; no devuelve correo, IP ni datos del personal. El listado es independiente del estado de entrega por correo y recupera confirmaciones históricas de `CONFIRM_CITA` cuando esa cita no tiene un aviso de confirmación persistido, sin inventar su horario anterior ni duplicar el aviso. No se marca el listado como leído ni se presenta un contador de avisos sin leer.

El flujo muestra una barra accesible de cuatro etapas: confirmación, llegada, triaje y consulta registrada. Los avances corresponden a 0%, 25%, 50%, 75% y 100% según estado y marcas reales; no indican tiempo estimado de espera. Citas canceladas o con inasistencia muestran flujo cerrado. La barra se incluye en el dashboard y en el detalle de la cita. La bandeja de avisos se consulta al abrirse y cada 30 segundos mientras está visible; dashboard y citas también actualizan sus datos al recuperar foco y cada 30 segundos, sin interrumpir escrituras.

## Mi historial médico

El historial presenta una línea de tiempo paginada de seis consultas por página y un resumen lateral con identidad, alergias y antecedentes registrados. Los detalles desplegables muestran indicaciones y receta por consulta. Las consultas anuladas muestran su motivo de anulación y ocultan su contenido clínico y receta. No se incluyen resultados, PDF, EPS, firmas ni documentos ficticios.

`GET /portal/history` admite `buscar` (2–100 caracteres), `especialidadId`, `desde`, `hasta` y `conReceta`, además de `pagina` y `limite`. La API aplica filtros antes de paginar y siempre obtiene el paciente desde la sesión. Las fechas incluyen los días completos de Lima; se rechazan fechas imposibles y rangos invertidos. `conReceta=true` limita a consultas activas con medicamentos registrados, sin afirmar vigencia del tratamiento. La interfaz cuenta registros solo en la página visible, sin presentar ese número como total global.

`GET /portal/history-context` devuelve únicamente alergias, antecedentes y especialidades del historial del paciente autenticado. La lectura se audita y no acepta un ID de paciente para sustituir la cuenta. La falta de registros de alergias no se presenta como ausencia clínica de alergias. Los errores de resumen permiten reintentar sin bloquear las consultas. Cambiar filtros vuelve a la primera página, descarta resultados anteriores y cancela lecturas obsoletas. **Mis recetas** conserva su sección propia.

Vista basada en `Untitled.png`: barra lateral con logo, encabezado de cuenta, tarjeta de próxima cita, citas siguientes, accesos rápidos y aviso de preparación. Se adapta a escritorio y móvil. Los datos de la referencia no se cargan en la aplicación.

## Acceso y datos

Abrir **`/pacientes/login`** (o el enlace **¿Eres paciente? Ingresa a tu portal** desde el acceso del personal) e introducir **DNI de 8 dígitos o correo electrónico**, junto con la contraseña de una cuenta activa de rol `paciente`, vinculada a una ficha mediante `Paciente.usuarioId`. El nombre interno de usuario (por ejemplo `demo.paciente`) no permite iniciar sesión como paciente. El correo se compara sin distinguir mayúsculas; si es compartido por varias fichas, se debe usar el DNI. El acceso no crea cuentas ni vincula fichas automáticamente. La web abre el portal automáticamente; los roles del personal conservan sus pantallas. No se guardan tokens en almacenamiento del navegador.

Los pacientes registrados por admisión siguen sin obtener una cuenta automáticamente. Para habilitar el portal de una ficha existente, el responsable de la base de datos puede usar este comando desde `apps/api`:

```powershell
# Reemplazar por el ID de la ficha verificada y un identificador interno de cuenta.
$env:PORTAL_PATIENT_ID = '1'
$env:PORTAL_USERNAME = 'portal.interno.1' # No se usa para iniciar sesión.
$portalSecret = Read-Host 'Contraseña nueva (mínimo 12 caracteres)' -AsSecureString
$env:PORTAL_PASSWORD = [System.Net.NetworkCredential]::new('', $portalSecret).Password
try {
    npm.cmd run portal:create-account
} finally {
    Remove-Item Env:PORTAL_PASSWORD
    $portalSecret.Dispose()
}
```

El comando crea únicamente la cuenta y el vínculo explícito a esa ficha, en una transacción auditada. No crea pacientes, citas ni datos clínicos; no reemplaza vínculos ni contraseñas existentes. Un usuario ya existente solo se admite si es la cuenta activa de paciente vinculada a esa misma ficha. No se asocia una ficha por coincidencia de nombre, correo o DNI. Verificar la identidad del destinatario antes de habilitarle una cuenta. No se incluyen contraseñas de demostración ni cuentas creadas automáticamente.

Una cuenta sin ficha vinculada muestra un aviso para contactar a admisión. Cuando no hay próximas citas, consultas o recetas, se muestra el estado vacío correspondiente.

## Funciones

- **Inicio:** saludo con el nombre real de la ficha, cantidad de próximas citas, siguiente cita y acceso a las restantes. Las fechas y horas se muestran en `America/Lima`. Solo cuentan como próximas las citas futuras programadas, confirmadas o reprogramadas.
- **Mis citas:** próximas o todas las citas del paciente, con paginación y detalle. Agendamiento presencial con selección de especialidad, médico, fecha y turno disponible. El servidor determina el paciente, el creador y el canal `portal`.
- **Reprogramar/cancelar:** confirmación explícita, disponibilidad revalidada y auditoría transaccional. Conserva las reglas de HU05: sin llegada, preparación ni consulta registradas. La propiedad de la cita se comprueba dentro de la transacción bloqueada; un ID ajeno devuelve 404. La reprogramación conserva el médico.
- **Mi historial:** consultas del propio paciente, diagnósticos, indicaciones y episodios anulados identificados, con paginación.
- **Mis recetas:** medicamentos de consultas activas, con dosis, vía, frecuencia, duración e indicaciones disponibles. Se pagina por consultas; una página puede no contener recetas aunque haya páginas siguientes. No se deduce vigencia de una receta ni se inventan fechas de expiración.
- **Mi perfil:** datos demográficos y de contacto en lectura. Los cambios se solicitan a admisión.
- **Ayuda y privacidad:** información contextual. El botón de notificaciones no muestra alertas ni contadores ficticios; remite a las citas y a admisión. Los recordatorios automáticos siguen pendientes.

## API

Todas las rutas `/api/portal/*` requieren rol `paciente`. Las rutas de lectura de perfil, citas e historia registran auditoría antes de entregar información; si esta falla, no entregan datos. El servidor resuelve el paciente a partir del JWT y la relación de cuenta, sin aceptar identidades de paciente en el cuerpo o los filtros.

| Ruta | Uso |
| --- | --- |
| `GET /portal/profile` | Perfil de la cuenta autenticada. |
| `GET /portal/appointments?scope=upcoming&pagina=1&limite=2` | Citas propias; `scope=all` incluye todos los estados. Total y paginación en una lectura consistente. |
| `GET /portal/history?pagina=1&limite=10` | Consultas y recetas propias. |
| `GET /portal/catalog` | Especialidades y médicos disponibles. |
| `GET /portal/availability?especialidadId=1&medicoId=1&fecha=2099-01-09` | Turnos disponibles sin reserva. |
| `POST /portal/appointments` | `{ medicoId, inicio, motivo? }`; paciente y canal determinados por el servidor. |
| `POST /portal/appointments/:id/reschedule` | `{ inicio }`; cita propia y mismo médico. |
| `POST /portal/appointments/:id/cancel` | `{}`; cita propia. |

Contratos en Swagger (`/api/docs`). Requiere las migraciones de confirmación de citas y cobros. Ver [flujo actualizado de confirmación y pagos](PAYMENTS.md). El alta de cuentas es una herramienta administrativa local, no una ruta de autoservicio.

## Verificación

Las pruebas HTTP usan persistencia simulada y verifican roles, filtros de propiedad, paginación, cuenta sin vínculo, fallo de auditoría y cambios sobre citas propias/ajenas. Playwright usa API simulada para comparar escritorio/móvil, navegar las secciones y validar reserva, reprogramación, cancelación y sesión vencida. Las capturas incluyen datos ficticios de prueba, no registros de la aplicación.

El acceso con DNI/correo y contraseña se verificó con PostgreSQL real en un esquema aislado. La validación integrada completa del portal sigue pendiente. No se declara el cierre de M6 ni de su Definition of Done.

Resultado del 11/11/2026: build y lint de API/web correctos; 296 pruebas HTTP aprobadas (`npm.cmd run test:e2e -- --maxWorkers=2`, API) y 11 pruebas de navegador de acceso/portal aprobadas (`npm.cmd run test:e2e -- patient-portal.spec.ts login.spec.ts --workers=2 --reporter=line`, web). Revisión visual realizada sobre capturas a 1440×900 y 390×844. Sintaxis del comando administrativo verificada con `node --check prisma/create-portal-account.mjs`; su transacción requiere verificación con PostgreSQL real.


### Contrato de acceso del paciente

`POST /api/auth/patient-login` recibe `{ "identifier": "01234567", "password": "contraseña asignada" }`; `identifier` también admite correo electrónico. Rechaza nombres de usuario, DNI incompletos y campos de identidad adicionales. Requiere una cuenta activa vinculada con rol paciente y conserva el control de contraseña. `POST /api/auth/login` queda reservado al personal y rechaza cuentas de paciente. El portal no admite acceso solo con conocer el DNI o correo.

Comprobaciones: 18 pruebas HTTP de acceso y 3 pruebas con PostgreSQL aislado, incluyendo DNI con cero inicial, correo con mayúsculas, contraseña incorrecta, cuenta sin vínculo y correo compartido. No se modificaron contraseñas ni cuentas existentes al verificar el acceso.


### Actualización: confirmación, alertas y pagos

Las solicitudes de cita del portal requieren confirmación por admisión. El inicio muestra alertas de citas cercanas y pagos pendientes, y **Agendar cita** está debajo de las próximas citas. **Pagos** consulta cobros y saldo reales del paciente; caja verifica y registra los pagos recibidos en clínica. Ver [guía de caja, constancias, permisos y límites](PAYMENTS.md). La base de datos local ya tiene aplicadas las migraciones; perfil, citas, historial y pagos se comprobaron con respuestas HTTP 200 en la API local.


### Pantallas de acceso separadas

- `/`: conserva el diseño inicial y el formulario exclusivo para trabajadores: admisión, medicina, enfermería y caja. Utiliza `/api/auth/login` con usuario y contraseña.
- `/pacientes/login` (también `/pacientes`): pantalla de pacientes basada en el HTML proporcionado, con panel visual e imágenes locales. Solo ofrece DNI o correo electrónico y contraseña, y utiliza `/api/auth/patient-login`. No incorpora carnet, pasaporte, SMS ni WhatsApp.

Las pantallas están enlazadas, pero sus formularios y verificaciones de rol son independientes. Al cerrar sesión o expirar el acceso, un paciente regresa a su pantalla de pacientes. La contraseña puede mostrarse u ocultarse y nunca se guarda en almacenamiento del navegador. Ayuda, recuperación y activación explican el procedimiento con admisión; no crean cuentas ni envían mensajes.

Validación de la separación de accesos: build y lint correctos; 21 pruebas Playwright aprobadas de login de personal, login exclusivo de paciente y navegación del portal, con API simulada. Incluye correos, DNI con ceros iniciales, rechazo de roles cruzados, doble envío, cierre de sesión y capturas a 1440×1000 y 390×844.


### Actualizaci?n: dashboard y gesti?n de citas (12/11/2026)

El dashboard del paciente sigue la distribuci?n acordada para el portal: cabecera con saludo y acceso para agendar; cita m?s pr?xima en tarjeta destacada; flujo de cita; tratamiento/recetas y atenciones/documentos en la columna principal; constantes del triaje, siguiente cita, alertas y ayuda en la columna lateral. En m?vil los bloques se apilan. Todos los nombres, citas, recetas, consultas, pagos y constantes se consultan desde el perfil autenticado. Los datos ausentes muestran estados vac?os; no se muestran cobertura EPS, QR, medicamentos activos inventados, resultados de laboratorio inexistentes, tendencias ni seguimiento en tiempo real que el sistema no tenga.

La tarjeta de ayuda del dashboard aparece debajo de resultados cl?nicos y documentos. La vista de detalle de cita organiza estado, fecha, hora, especialidad, m?dico, lugar y modalidad; conserva acciones existentes de reprogramaci?n y cancelaci?n. El selector de horarios de reserva destaca fecha y hora seleccionadas y el m?dico asignado.

En **Mis citas**, las pesta?as separan pr?ximas, historial/pasadas y canceladas. Pr?ximas comprende citas activas cuya hora todav?a no llega. Al consultar el portal, las citas vencidas sin llegada se cierran autom?ticamente seg?n su ?ltimo estado: `pendiente_confirmacion` pasa a `cancelada` (admisi?n no confirm? a tiempo); `programada`, `confirmada` o `reprogramada` pasa a `no_asistio`. Se excluyen de pr?ximas y se muestran en la categor?a correspondiente. Las citas con llegada registrada no se cierran con esta regla.

La reserva expr?s permite elegir especialidad, fecha y hora. Consulta turnos de todos los m?dicos, muestra una opci?n por hora y asigna un m?dico disponible; la API vuelve a validar el turno al guardar. El portal solo admite modalidad presencial. Las reservas quedan pendientes de confirmaci?n por admisi?n. El archivo ra?z `usuarios-ficticios.txt` enumera usernames y nombres de las cuentas demo existentes.

