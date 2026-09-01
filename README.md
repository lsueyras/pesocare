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


## V14.4 — Reorganización + sincronización estable
- Portal paciente separado en:
  - Seguimiento
  - Mi médico
  - Soporte
- Mensajes e indicaciones dejan de compartir pantalla con el seguimiento de peso.
- Soporte tiene su propia pestaña y listado de solicitudes.
- Sincronización médica:
  - Realtime como acelerador;
  - polling de respaldo cada 2,5 s cuando la pestaña médica está abierta;
  - actualización al volver a la app o recuperar foco;
  - control de secuencia para ignorar respuestas antiguas de consultas asincrónicas.
- Médico y paciente leen siempre mensajes/prescripciones activas desde Supabase.
- Se evita que una respuesta antigua vuelva a pintar historial eliminado.
- Consultas activas optimizadas con índices parciales en Supabase.


## V14.5 — Corrección chat iPhone
- Mensajes y prescripciones tienen sincronización independiente.
- No se inicia otra consulta del mismo recurso mientras una esté en curso.
- Si llega una interacción durante la consulta, se realiza una segunda sincronización al finalizar.
- La consulta del paciente trae solo la conversación del médico seleccionado.
- El mensaje enviado se pinta inmediatamente con la fila devuelta por Supabase.
- Estado visible del chat: Actualizando / Sincronizado / Error.
- El estado de error permite tocar para reintentar.
- Realtime actualiza solo el recurso afectado.
- Polling de respaldo cada 4 segundos, sin superposición de consultas.


## BodyCare rebrand — V14.5
- Nombre visible de la aplicación: BodyCare.
- Claim: Salud y progreso.
- Nuevo logo BodyCare integrado en login, encabezado y reporte PDF.
- PWA manifest actualizado a BodyCare.
- Nuevos iconos 192x192, 512x512 y Apple Touch Icon derivados del logo aprobado.
- Cache Service Worker renombrada a `bodycare-v14-5`, lo que limpia caches anteriores al activarse.
- Notificaciones del backend Supabase migradas de PesoCare a BodyCare.
- Se mantienen nombres técnicos internos y claves localStorage para conservar sesiones y compatibilidad.
- No se renombra todavía el repositorio GitHub ni el proyecto Supabase.


## BodyCare V14.6 — Chat transaccional
- `bodycare_send_message`: envío de chat mediante RPC transaccional en Supabase.
- `bodycare_get_conversation`: lectura de conversación mediante RPC dedicada.
- Se elimina el uso de INSERT/GET REST genérico para el chat.
- El mensaje enviado aparece de inmediato en UI con estado `Enviando…`.
- La misma operación devuelve la fila persistida y reemplaza el mensaje temporal.
- El receptor sigue recibiendo Realtime mediante `user_notifications` y recupera el chat vía RPC.
- Polling de respaldo de conversación cada 3 s.
- Sincronización de notificaciones de respaldo cada 8 s.
- Compatible con iPhone Safari/PWA y escritorio.


## BodyCare V14.7 — Catálogo farmacológico guiado
- Prescripción médica con listas desplegables para:
  - medicamento;
  - principio activo;
  - vía/presentación;
  - dosis;
  - frecuencia;
  - duración.
- El catálogo base cubre tratamientos con indicación antiobesidad establecida:
  - Wegovy inyectable (semaglutida);
  - tirzepatida / Mounjaro-Zepbound;
  - Saxenda (liraglutida);
  - Wegovy oral;
  - naltrexona/bupropión;
  - orlistat;
  - fentermina/topiramato LP;
  - setmelanotida para obesidad genética específica.
- Cada campo permite `Otra opción` manual.
- Las dosis sugieren automáticamente frecuencia y duración de etapa cuando existe un esquema estándar.
- Se agrega vía de administración a `route_text` existente, sin cambio de esquema de BD.
- Se muestra advertencia regulatoria por medicamento.
- No se agregan automáticamente medicamentos usados solo off-label para pérdida de peso.

## BodyCare V14.8 — Prescripciones transaccionales e independientes
- Guardar/editar indicaciones usa `bodycare_save_prescription`.
- Leer indicaciones usa `bodycare_get_prescriptions`.
- El módulo de prescripciones ya no reconstruye la ficha ni toca mensajería.
- La indicación aparece inmediatamente en el médico al guardar.
- El paciente se actualiza por Realtime y por sincronización de respaldo.
- Editar/cancelar refresca solo el formulario de prescripción.
- Eliminar refresca solo la lista de prescripciones.


## BodyCare V14.9 — Eliminación optimista de indicaciones
- La indicación desaparece inmediatamente del portal médico al confirmar eliminación.
- Supabase confirma la eliminación en segundo plano.
- El paciente continúa recibiendo la eliminación por Realtime.
- Si el backend rechaza la operación, BodyCare restaura automáticamente la indicación.
- La reconciliación posterior actualiza solo prescripciones y nunca toca mensajes.


## BodyCare V14.10 — Fechas Chile
- Todos los campos visibles de fecha usan DD/MM/AAAA.
- Se elimina la dependencia del formato nativo de Safari/Chrome.
- Internamente se mantiene YYYY-MM-DD para Supabase y cálculos.
- Validación de fechas reales.
- Ingreso numérico con `/` automático.
- Idioma de documento: es-CL.


## BodyCare V14.11 — Calendario con formato chileno
- Se mantiene DD/MM/AAAA en todos los campos visibles.
- Cada campo de fecha incorpora un botón de calendario.
- Selector de fecha propio de BodyCare, independiente del locale de Safari/Chrome.
- Navegación por mes anterior/siguiente.
- Botón Hoy.
- Selección de fecha actualiza el campo en DD/MM/AAAA.
- En iPhone se presenta como panel inferior para mejor experiencia táctil.
- Se mantiene almacenamiento interno ISO YYYY-MM-DD.


## BodyCare V15 — Notificaciones Push
- Web Push para mensajes, indicaciones médicas, seguimiento y soporte.
- Funciona en desktop y en PWA compatibles.
- En iPhone/iPad requiere instalar BodyCare en pantalla de inicio y abrirlo desde allí.
- Suscripción por dispositivo; no se guarda información clínica en el payload push.
- Preferencias independientes por categoría.
- Botón de prueba desde el centro de notificaciones.
- Deep links desde push hacia conversación, indicaciones o paciente.
- Realtime se mantiene como canal principal mientras la app está abierta.
- Push se dispara desde Supabase de forma asíncrona mediante pg_net + Edge Function.
- VAPID private key y webhook token permanecen en Supabase Vault; solo la clave pública está en frontend.


## BodyCare V15.1 — Controles compartidos
- Médico y paciente pueden registrar un nuevo control con fecha y hora.
- Fecha visible DD/MM/AAAA con calendario BodyCare.
- Hora almacenada usando zona America/Santiago.
- Observación opcional.
- Control visible inmediatamente en ambos perfiles.
- Notificación Realtime + Push al otro participante.
- Ambos participantes pueden cancelar; no se elimina físicamente.
- Estado SCHEDULED / CANCELLED con trazabilidad de creador y cancelación.
- RPC dedicadas:
  - bodycare_get_controls
  - bodycare_create_control
  - bodycare_cancel_control
- Las notificaciones NEW_CONTROL y CONTROL_CANCELLED usan la preferencia de actualizaciones de seguimiento.


## BodyCare V15.2 — Recuperación automática de sesión
- Corrige respuestas 401 observadas en escritorio después de expirar access_token.
- Renovación single-flight: varias consultas simultáneas comparten una sola renovación.
- REST, RPC y Edge Functions reintentan automáticamente una vez después de renovar sesión.
- Renovación proactiva 90 segundos antes del vencimiento.
- Al volver a la pestaña/aplicación, BodyCare valida el token antes de sincronizar.
- Evita que una renovación concurrente borre una sesión ya actualizada.
- Protege mensajes, prescripciones, controles, notificaciones, soporte y futuras APIs.
