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
