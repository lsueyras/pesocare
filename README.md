# PesoCare Web Deploy v2

Versión robusta sin dependencias JavaScript externas.

## Cambio principal
La primera versión dependía de CDN para Supabase JS y Chart.js.
V2 utiliza:
- JavaScript nativo;
- REST API oficial de Supabase;
- Auth API de Supabase;
- gráfico SVG generado localmente.

Esto evita una pantalla vacía si un CDN externo falla.

## Para actualizar GitHub Pages
Reemplazar/subir en la raíz:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- icon.svg
- .nojekyll

Luego esperar el check verde de `pages build and deployment`.

## URL
https://lsueyras.github.io/pesocare/


## V3 Mobile Fix
- Formularios pasan a una sola columna bajo 600 px.
- Corrección específica para `input type=date` en Safari/iPhone.
- Inputs con `min-width:0`, `max-width:100%` y `font-size:16px`.
- Caché PWA actualizada a `pesocare-v3`.
- `styles.css?v=3` y `app.js?v=3` para evitar caché antigua.


## V4 — Decimales + circunferencia abdominal
- Peso acepta coma o punto y hasta 2 decimales.
- Peso inicial/meta y registros almacenan 2 decimales.
- Circunferencia abdominal inicial en cm, hasta 2 decimales.
- Cada nuevo control registra peso + circunferencia abdominal.
- Dashboard muestra cintura actual y cambio desde el inicio.
- Historial incluye circunferencia abdominal.
- Gráfico principal se mantiene como Peso vs Semana.
- Usuarios antiguos pueden completar circunferencia inicial desde “Editar plan”.


## V6 — Reporte PDF + segundo gráfico
- Segundo gráfico: Circunferencia abdominal vs Semana.
- Botón `Generar PDF`.
- El reporte incluye:
  - paciente;
  - inicio y duración;
  - peso inicial/actual/meta;
  - cintura inicial/actual;
  - gráfico de peso;
  - gráfico de circunferencia abdominal;
  - historial completo.
- En iPhone, `Generar PDF` abre un reporte imprimible. Desde `Guardar / compartir PDF`, Safari abre la vista de impresión desde la cual puede guardarse/compartirse como PDF.
- Sin librerías JavaScript externas.


## V7 — Logo en página principal y PDF + ajuste formulario de registro
- Se agrega `brand-logo.png` en la pantalla inicial y en el encabezado.
- El PDF ahora incorpora el logo de la marca.
- El formulario `Registrar peso` usa una grilla específica (`record-grid`) para que Fecha, Peso y Circunferencia tengan ancho uniforme.
- Caché actualizada a `pesocare-v7`.

## V8 — Recordarme en este dispositivo
- Opción visible, activada por defecto.
- Nunca guarda la contraseña.
- Activada: sesión persistente.
- Desactivada: sesión termina al cerrar la pestaña/app.
- Cerrar sesión elimina cualquier sesión almacenada.


## V9 — Ajuste ancho uniforme en Registrar peso
- Se corrige el ancho del campo `Fecha` para que coincida visualmente con `Peso` y `Circunferencia abdominal`.
- Se refuerza el layout del `record-grid` especialmente en iPhone/Safari.
- Se corrige además un fragmento de CSS heredado que podía afectar media queries.


## V10 — Registro de cuenta con control de reintentos
- Traduce errores de Supabase a mensajes claros en español.
- Detecta el límite temporal de seguridad del registro.
- Deshabilita `Crear cuenta` durante la espera y muestra cuenta regresiva.
- No bloquea `Ingresar`.
- Recuerda revisar Bandeja de entrada y Spam.
- Mejora también el mensaje de recuperación de contraseña.


## V11 — Igualación definitiva de ancho de campos en iPhone
- Fecha, Peso y Circunferencia usan un contenedor visual común `control-frame`.
- El borde y tamaño visible ya no dependen del render nativo del input de fecha de Safari.
- Los tres controles tienen exactamente el mismo ancho y altura.
- Se mantiene el selector nativo de fecha.

## V13 — Paciente + Médico + Admin
- Roles múltiples PATIENT / DOCTOR / ADMIN.
- PesoCare Pro para médicos.
- Vinculación paciente-médico por correo.
- Mensajería paciente-médico.
- Indicaciones farmacológicas compartidas por paciente.
- PesoCare Admin con gestión de usuarios, roles, suspensión, reset, eliminación e invitaciones.
- Tickets de soporte dentro de la app.
- RNPI y receta electrónica legal quedan desacoplados y pendientes, sin bloquear operación.


## V14 — Realtime y notificaciones
- WebSocket directo a Supabase Realtime, sin librerías externas.
- Campana con contador de notificaciones pendientes.
- Estado de conexión `En vivo / Conectando / Sin conexión`.
- Toast inmediato al recibir:
  - nuevo mensaje;
  - nueva indicación/prescripción compartida;
  - nuevo registro de peso/circunferencia de un paciente;
  - nuevo paciente vinculado;
  - nuevo ticket de soporte.
- Chat paciente ↔ médico se actualiza sin recargar.
- Panel médico se refresca con nuevos registros del paciente.
- Indicación compartida aparece automáticamente en el portal paciente.
- Centro de notificaciones persistente con leído/no leído.
- Fallback de sincronización cada 20 segundos si la conexión Realtime se interrumpe.
- No se transmite texto clínico ni valores de peso dentro de la notificación Realtime: la app recupera los datos con RLS.
- Push con la app completamente cerrada queda como fase posterior (Web Push/APNs/FCM).


## V14.1 — Editar/eliminar indicaciones y conversaciones
- Médico puede editar indicaciones compartidas; cada cambio incrementa revisión y notifica al paciente.
- Médico puede retirar una indicación; desaparece de ambas vistas y queda auditada.
- Cada usuario puede eliminar únicamente mensajes que él mismo envió.
- Médico o paciente pueden eliminar el historial visible completo de una conversación con doble confirmación.
- Eliminaciones son lógicas (soft delete), no borrado físico, para mantener trazabilidad administrativa.
- Notificaciones Realtime actualizan automáticamente indicaciones y conversaciones modificadas/eliminadas.


## V14.2 — Corrección eliminación + actualización forzada
- Backend: ampliado constraint de tipos de notificación para MESSAGE_DELETED, CONVERSATION_CLEARED, PRESCRIPTION_UPDATED y PRESCRIPTION_REMOVED.
- Verificadas por transacción las RPC de eliminar mensaje, limpiar conversación y eliminar indicación.
- Service Worker actualizado con `updateViaCache: none`.
- HTML/JS/CSS principales se recuperan con estrategia network/no-store.
- Se muestra `v14.2` en el pie de la aplicación para validar qué versión está ejecutando cada dispositivo.
- Acciones Editar/Eliminar y Eliminar historial forzadas visibles en escritorio y móvil.
- Mensajes de error de las RPC traducidos a respuestas más claras.


## V14.3 — Consistencia de datos paciente/médico
- Supabase RLS impide leer mensajes e indicaciones con `deleted_at`.
- Incluso clientes antiguos ya no pueden recuperar historial eliminado.
- Todas las lecturas REST usan `cache: no-store`.
- Eliminar/limpiar conversación actualiza estado local y luego reconcilia contra Supabase.
- Enviar un nuevo mensaje recupera únicamente la conversación activa.
- Prescripciones retiradas desaparecen del paciente inmediatamente sin hacer un `render()` completo.
- Eventos Realtime actualizan directamente los componentes de mensaje/prescripción.
- Filtros defensivos de `deleted_at` tanto en backend como frontend.
