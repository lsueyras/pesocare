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
