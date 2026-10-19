# Clipea2

Recortá, uní, dibujá y mandá tus clips de juegos a Discord sin pasarte del límite de tamaño, todo en una sola ventana.

Sirve para clips de cualquier app que grabe (NVIDIA ShadowPlay, OBS, Medal, AMD ReLive, Xbox Game Bar, Steam…): MP4, MOV, M4V, MKV y WebM.

![logo](resources/icon.png)

## Qué hace

- **Biblioteca**: una o varias carpetas de clips, cada una con sus subcarpetas (por ejemplo, una por juego), con miniaturas y duración. Con los clips de ShadowPlay además muestra el juego y la fecha de grabación.
- **Reproductor**: `Ctrl+↑/↓` cambia la velocidad de a 0.25x (0.25x–4.00x), `Ctrl+←/→` avanza o retrocede **un cuadro exacto** (usa la tabla real de cuadros: muchos grabadores, como ShadowPlay, graban con cuadros por segundo variables), `Ctrl+R` vuelve a 1.00x.
- **Recorte**: inicio `I` / fin `O`, campos de tiempo que aceptan `50`, `1:19` o `1m19s`, línea de tiempo con zoom (`Ctrl+rueda`).
- **Montaje**: `Enter` suma la selección; podés juntar trozos de videos distintos, reordenarlos arrastrando y previsualizarlos seguidos.
- **Dibujo** (`D`): flecha, círculo, rectángulo, lápiz y texto sobre el cuadro actual. Cada dibujo se ve N segundos y puede **congelar la imagen** mientras se muestra. Lo que ves es lo que se exporta.
- **Exportar a disco** (`Ctrl+E`): elegís dónde guardarlo; H.265 por GPU por defecto (NVIDIA NVENC, AMD AMF o Intel Quick Sync, desactivable en Ajustes). Apunta al 95% del límite y, si igual se pasa, recodifica más liviano. El peso estimado se actualiza en tiempo real.
- **Mandarlo**: “Copiar para Discord” deja el archivo en el portapapeles (Ctrl+V en Discord), o “Enviar a canal” lo publica directo en un canal mediante un webhook.

### Límite de Discord

Sin Nitro el máximo es **20 MB por archivo** (Discord lo subió de 10 MB en agosto de 2026; [FAQ oficial](https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ)). Clipea2 usa 20 MB y se puede cambiar a 50 MB (Nitro Basic), 10 MB o sin límite.

## Requisitos

- Windows 10/11, Node 22+.
- `ffmpeg` y `ffprobe` en el PATH (`winget install Gyan.FFmpeg`). Usa la GPU que encuentre (NVIDIA, AMD o Intel); sin GPU, cae a x264/x265 por CPU.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm install` | Dependencias. npm 11 bloquea el postinstall de Electron: si falta el binario, `node node_modules/electron/install.js`. |
| `npm run dev` | App con recarga en caliente. |
| `npm start` | Compila y abre la versión de producción. |
| `npm test` | Tests unitarios (Vitest). |
| `npm run typecheck` | TypeScript en main y renderer. |
| `npm run e2e` | Prueba punta a punta sobre la app real (Playwright). Necesita `CLIPEA2_SAMPLE` con la ruta de un clip (su carpeta necesita al menos 3 clips). |
| `npm run dist` | Instalador de Windows (electron-builder). |

## Arquitectura

Screaming + hexagonal: las carpetas gritan lo que hace la app y cada una separa dominio, casos de uso, puertos y adaptadores.

```
src/
  features/
    library/      biblioteca de grabaciones (varias carpetas, agrupado por subcarpeta; entiende los nombres de ShadowPlay)
    media/        probe, tabla de cuadros, miniaturas (adaptadores ffprobe/ffmpeg)
    player/       velocidad, cuadro a cuadro, reproductor
    trimming/     selección inicio/fin y línea de tiempo
    montage/      secuencia de cortes
    annotations/  dibujos, congelado, render a PNG
    export/       plan de codificación para Discord, timeline de render, comando ffmpeg, reintentos
    history/      exportados: copiar, reexportar, editar
    discord/      envío a canales (webhooks; app de Discord por RPC local, opcional)
    settings/ session/
  shared/
    domain/       tiempo, ids
    contracts/    API IPC entre procesos, URLs de media
    ui/           design system (atoms, molecules, organisms)
  main/           composición (Electron main), IPC, protocolo de media con Range
  preload/        puente seguro (contextIsolation + sandbox)
  renderer/       shell de la app y atajos
```

- `domain/` es TypeScript puro y testeado; `application/` define puertos (`VideoRenderer`, `MediaProber`, `LibraryRepository`…); `infrastructure/` los implementa con ffmpeg y el sistema de archivos; `ui/` son contenedores (stores Zustand) y componentes de presentación.
- El render: un input de ffmpeg por corte (`-ss`/`-t`, preciso al cuadro), normalización a la resolución y fps de salida, partes con `tpad` donde se congela, `concat`, y los dibujos como PNG transparentes con `overlay` en sus ventanas de tiempo.
