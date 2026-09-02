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


## BodyCare V15.3 — Ajustes de controles
- Impide duplicar un control activo para el mismo médico, paciente, fecha y hora.
- La base incorpora índice único parcial para evitar duplicados incluso con envíos simultáneos.
- Duplicados activos previos se conservan para auditoría y los adicionales quedan CANCELLED.
- Tras registrar un control:
  - fecha vuelve a hoy;
  - hora queda vacía;
  - observación queda vacía;
  - médico seleccionado se conserva.
- El campo Hora adopta exactamente el ancho del resto de los campos en iPhone y escritorio.
- Fechas del listado se muestran en DD/MM/AAAA.


## BodyCare V15.4 — Ancho del selector de Hora en iPhone
- El campo Hora usa un contenedor visual propio de BodyCare.
- Safari mantiene su selector nativo de hora.
- El borde visible pertenece al contenedor y no al input nativo.
- Se impide que WebKit expanda el control más allá de la columna.
- Hora queda con el mismo ancho visual que Fecha, Médico y los demás campos.


## BodyCare V15.5 — Agenda por profesional
- Cada médico configura duración de control: 15, 30, 45 o 60 minutos.
- La duración se guarda en doctor_profiles.control_slot_minutes.
- Cada control conserva su duración original en care_controls.slot_minutes.
- La disponibilidad se valida contra TODOS los pacientes del médico.
- Se bloquean controles que se superponen, no solo los de igual hora.
- El paciente nunca recibe datos de otros pacientes: solo disponible/no disponible.
- Si el horario está ocupado o fuera de la grilla del médico:
  - BodyCare bloquea el registro;
  - muestra el horario disponible más cercano;
  - ofrece botón “Usar este horario”.
- La creación vuelve a comprobar disponibilidad bajo bloqueo transaccional.
- Controles cancelados desaparecen de la agenda visible, liberan el espacio y permanecen en BD para auditoría.
- RPC nueva: bodycare_check_control_slot.


## BodyCare V16 — Priorización de seguimiento
- Dashboard médico con semáforo:
  - rojo: requiere atención;
  - naranja: revisar;
  - verde: seguimiento normal.
- Pacientes ordenados automáticamente por prioridad.
- Criterios configurables por médico:
  - días sin registro;
  - aumento porcentual de peso;
  - disminución rápida de peso en hasta 7 días;
  - aumento de circunferencia abdominal.
- Alertas persistentes por nuevo registro de peso.
- Alertas por falta de registros se calculan dinámicamente.
- El médico puede marcar alertas persistentes como revisadas.
- Push + Realtime de `CLINICAL_ALERT`.
- Ninguna bandera constituye diagnóstico ni reemplaza juicio clínico.


## BodyCare V16.1 — Corrección selector de fecha
- La selección de calendario guarda simultáneamente DD/MM/AAAA visible e ISO YYYY-MM-DD interno.
- El campo se resuelve por ID al elegir una fecha, evitando referencias obsoletas tras renders.
- Los botones de día y “Hoy” aplican la selección antes de cerrar el calendario.
- Se disparan eventos input + change y se restaura el valor seleccionado después de cada evento.
- `requireDateCL` puede recuperar la fecha ISO interna aun ante inconsistencias de Safari/iPhone.
- No cambia Supabase ni la lógica V16 de priorización.


## BodyCare V16.2 — Fecha nativa y layout de controles
- Campo visible mantiene DD/MM/AAAA.
- Ícono calendario abre selector nativo del navegador/iOS mediante input date transparente.
- Selección nativa sincroniza el valor visible y el ISO interno.
- Fecha y Hora se alinean desde arriba en escritorio.
- Información del tamaño de bloque sale de la columna Hora y pasa a una línea independiente.
- Fecha y Hora quedan con altura y ancho equivalentes.


## BodyCare V16.3 — Selector de fecha robusto
- Elimina completamente el `input type=date` transparente de V16.2.
- El campo visible vuelve a mostrar y permitir escritura en DD/MM/AAAA.
- El botón calendario es un botón real de BodyCare.
- Calendario modal propio, montado directamente en `body`, evitando clipping de formularios.
- Seleccionar un día escribe inmediatamente DD/MM/AAAA y mantiene ISO interno.
- Funciona igual para:
  - registro de peso;
  - controles médico/paciente;
  - fecha de inicio de prescripción;
  - configuración inicial del seguimiento.


## BodyCare V16.4 — Registros transaccionales, edición y eliminación
- Nuevo registro usa RPC `bodycare_save_weight_record`.
- El registro devuelto por Supabase se incorpora inmediatamente al estado local.
- Peso actual, cambio de peso, cintura, cambio de cintura, gráficos e historial se actualizan sin `loadData()`.
- Historial incorpora Editar y Eliminar.
- Registro inicial:
  - se puede editar peso/cintura;
  - no se puede cambiar su fecha desde el historial;
  - no se puede eliminar.
- Registros posteriores:
  - fecha, peso y cintura editables;
  - eliminación lógica con auditoría.
- Los registros eliminados dejan de participar en métricas, gráficos, historial y priorización médica.
- Médico recibe NEW_WEIGHT / WEIGHT_UPDATED / WEIGHT_REMOVED por Realtime + Push.


## BodyCare V16.5 — Historial optimizado para iPhone
- Historial sin desplazamiento horizontal en pantallas móviles.
- Cada registro permanece en una sola fila.
- Columnas móviles: Fecha · Sem. · Peso · Cint. · Acc.
- Anchos proporcionales mediante `table-layout: fixed`.
- Editar y Eliminar se presentan como botones compactos con iconos en móvil.
- En escritorio se mantienen las etiquetas completas.
- Registro inicial mantiene identificación compacta `I` en móvil.


## BodyCare V16.6 — Estado de lectura unificado
- Campana y badge de Mi médico usan el mismo `read_at`.
- Abrir la ficha de un paciente como médico marca como vistos mensajes, controles, peso, correcciones/eliminaciones y alertas de ese paciente.
- Abrir Mi médico como paciente marca los eventos médicos que están visibles en esa pestaña.
- El badge de Mi médico cambia inmediatamente sin recargar toda la vista.
- PUSH_TEST queda como informativo y no mantiene encendida la campana.
- Si falla persistir `read_at`, BodyCare restaura el estado visual.


## BodyCare V17 — Agenda médica + panel operativo
- Portal BodyCare Pro incorpora agenda del profesional.
- Vistas:
  - Hoy;
  - Próximos 7 días.
- Cada control muestra:
  - hora;
  - duración;
  - paciente;
  - prioridad V16;
  - quién lo agendó;
  - observación;
  - acceso directo al paciente.
- Agenda consulta únicamente controles activos del médico autenticado.
- Cancelaciones desaparecen automáticamente.
- Nuevos controles y cancelaciones actualizan agenda por Realtime.
- Sincronización de respaldo del dashboard médico cada 15 segundos.
- Al volver a la pestaña, se actualizan agenda y prioridades.
- RPC backend: `bodycare_get_doctor_agenda(date, integer)`.


## BodyCare V18 — Ciclo completo de controles
- Estados: Programado, Confirmado, Completado, No asistió, Cancelado.
- Paciente puede confirmar asistencia.
- Médico puede completar control con resumen compartido.
- Médico puede registrar inasistencia.
- Próximos controles e historial se muestran separados.
- Completados/no-show ya no bloquean disponibilidad futura.
- Cancelados continúan ocultos operacionalmente y preservados para auditoría.
- Botón Agendar próximo desde el historial médico.
- Agenda V17 muestra si un control está Programado o Confirmado.
- Realtime + Push para confirmación, completado e inasistencia.
- Tabla `care_control_events` conserva trazabilidad de cambios de estado.


## BodyCare V18.1 — Consistencia de notificaciones
- `read_at` se persiste mediante RPC SECURITY DEFINER propia del usuario.
- `Marcar todas como leídas` vuelve a consultar Supabase inmediatamente.
- Estado de lectura monótono: un evento Realtime atrasado nunca puede convertir una notificación leída nuevamente en no leída.
- El fallback de 8 segundos reconcilia por ID y conserva `read_at`.
- El centro de notificaciones carga un snapshot autoritativo antes de abrir.
- Nueva RPC backend: `bodycare_mark_notifications_read(uuid[])`.


## BodyCare V19 — Outcomes & Adherence Dashboard
- Nuevo panel médico de resultados y adherencia.
- KPIs de cartera:
  - pacientes activos;
  - cambio de peso promedio;
  - pacientes con reducción >=5%;
  - adherencia de registros últimas 4 semanas;
  - asistencia a controles últimos 90 días;
  - cambio de cintura promedio.
- Visualización comparativa de cambio de peso por paciente.
- Tabla operativa con:
  - prioridad clínica;
  - peso y variación;
  - cintura y variación;
  - adherencia;
  - asistencia;
  - próximo control.
- Filtros: todos, prioridad, >=5%, baja adherencia.
- Búsqueda por paciente.
- Ficha médica incorpora `Resumen de evolución`.
- Métricas transparentes y descriptivas; no reemplazan juicio clínico.
- Backend seguro: `bodycare_get_doctor_outcomes(integer)`.


## BodyCare V20 — Smart Reminders & Engagement
- Motor automático horario con pg_cron.
- Confirmación pendiente ~24 h antes, control próximo ~2 h antes y falta de registro según frecuencia médica.
- Deduplicación backend y recordatorio de registro máximo una vez por semana.
- Médico define frecuencia entre 3 y 14 días.
- Paciente configura preferencias en Recordatorios BodyCare.
- Deep links a Controles o Registrar peso.


## BodyCare V20.1 — Persistencia robusta de preferencias
- Cada interruptor muestra Guardando / Guardado.
- Los controles se bloquean durante la escritura para evitar cambios concurrentes.
- Después de guardar, BodyCare relee `notification_preferences` desde Supabase.
- La interfaz se reconcilia con el valor autoritativo de la base.
- La sincronización de la tarjeta no puede sobrescribir un cambio mientras está guardándose.
- `bodycare_get_patient_reminder_plan` ahora crea la fila de preferencias por defecto si falta y devuelve los tres valores de recordatorios.
