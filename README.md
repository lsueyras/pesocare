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
