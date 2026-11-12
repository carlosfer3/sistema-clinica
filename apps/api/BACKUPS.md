# Respaldo diario y restauración comprobada (HU18)

El respaldo conserva el esquema de la aplicación indicado por `DATABASE_URL` (por defecto `public`), sus tablas, datos, secuencias, funciones, restricciones, triggers y extensiones asociadas, incluida `btree_gist`. No respalda cuentas globales de PostgreSQL, archivos `.env`, imágenes ni el código fuente. Se excluyen propietarios y privilegios para permitir restauración por el responsable del entorno de prueba.

## Operación

Desde `apps/api`:

```powershell
npm.cmd run backup:create
npm.cmd run backup:verify
npm.cmd run backup:status
```

`create` usa `pg_dump` en formato custom y una instantánea PostgreSQL exportada dentro de una transacción de lectura consistente. Genera un `.dump` y un manifiesto `.dump.json` con SHA-256, cantidad y huella del contenido de cada tabla. Un archivo `.partial` nunca se selecciona para restauración. No se incluyen contraseñas ni datos personales en el manifiesto o la salida de consola. La copia sí contiene datos privados (incluidos hashes de cuentas): `backups/` está excluido de Git y debe mantenerse en una ubicación de acceso restringido.

`verify` verifica SHA-256, crea una base aleatoria `siges_restore_test_<uuid>`, restaura la copia dentro de una transacción y compara cantidad y huella de todas las filas de cada tabla con la instantánea original. La huella ordena los hashes de las filas para evitar depender de su orden físico. El informe `.verification.json` registra el resultado. Al terminar, elimina únicamente la base temporal creada por esa ejecución, también cuando falla una prueba. Nunca restaura sobre la base original. El usuario PostgreSQL requiere permiso `CREATEDB` y permisos para instalar las extensiones necesarias.

`status` informa el respaldo más reciente y devuelve error si tiene más de 24 horas. Las copias no se eliminan automáticamente.

## Automatización en Windows

```powershell
npm.cmd run backup:install
```

Registra `SIGES-SR-Respaldo-Diario` a las **02:00, hora local**, con rutas absolutas. Ejecuta `node scripts/db-backup.mjs create` sin abrir ventanas, impide ejecuciones simultáneas de la tarea, intenta recuperar una ejecución omitida y reintenta fallos hasta tres veces cada 15 minutos. No guarda la contraseña PostgreSQL en la definición de la tarea; el script lee la configuración local del servidor.

La tarea utiliza la sesión interactiva del usuario que la instala: requiere Windows encendido, sesión iniciada y PostgreSQL accesible. Si el equipo está apagado o no hay sesión, no se garantiza una pérdida máxima de 24 horas. Para operación permanente debe instalarse en un equipo disponible continuamente, con una cuenta de servicio o un programador del servidor. La copia local tampoco protege ante la pérdida del disco: configurar `BACKUP_DIR` en almacenamiento de respaldo independiente para ese escenario.

Consultar resultado y próxima ejecución:

```powershell
schtasks.exe /Query /TN SIGES-SR-Respaldo-Diario /FO LIST /V
```

La instalación no reemplaza silenciosamente una tarea existente. `BACKUP_TIME` permite elegir otra hora antes de instalar. `PG_BIN` permite indicar la carpeta de herramientas PostgreSQL y `BACKUP_DIR` el destino. La ruta por defecto es `backups/` en la raíz del repositorio.

## Restauración ante una falla

Primero ejecutar `backup:verify` para comprobar la última copia en una base independiente. Esta herramienta deliberadamente no sobrescribe bases existentes. Una recuperación real requiere detener escrituras de la aplicación, elegir una base de destino nueva, restaurar con `pg_restore`/`psql`, verificar los datos y actualizar `DATABASE_URL`. La recuperación se hace con las credenciales y privilegios del destino; conservarlas de forma independiente a las copias.

En este entorno hay cliente PostgreSQL 18 y servidor anterior a 17. La prueba convierte el archivo custom a SQL y retira únicamente `SET transaction_timeout = 0`, una configuración de sesión no soportada por el servidor. Restaura con `psql`, `ON_ERROR_STOP` y transacción única. El SQL temporal se elimina al terminar. No se omiten errores de estructura o datos.

## Evidencia de ejecución

Ver [prueba documentada de HU18](../../entregables/semana-8/pruebas/hu18-respaldo-restauracion.md). Se probó tanto la ejecución directa como la tarea programada. La restauración de la copia creada por la tarea comparó exitosamente 22 tablas y 915 registros contra su instantánea. No acredita una recuperación de archivos externos ni disponibilidad continua del equipo.
