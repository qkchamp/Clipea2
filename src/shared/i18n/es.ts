/**
 * Every text Clipea2 shows, in Spanish (the original voice: Río de la Plata, with "vos"). en.ts has the
 * same shape. Texts with values are functions; plurals are decided inside them.
 */
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const decimal = (value: number, digits: number): string => value.toFixed(digits).replace('.', ',')

export const es = {
  common: {
    cancel: 'Cancelar',
    save: 'Guardar',
    edit: 'Editar',
    delete: 'Borrar',
    change: 'Cambiar',
    clear: 'Vaciar',
    confirmClear: '¿Vaciar?',
    show: 'Mostrar',
    on: 'Activada',
    off: 'Desactivada',
    closeNotice: 'Cerrar aviso',
    copyForDiscord: 'Copiar para Discord',
    copiedForDiscord: 'Copiado: pegalo con Ctrl+V en Discord',
    copyFailed: 'No se pudo copiar el archivo',
    noLimit: 'sin límite',
    discordLimit: (size: string) => `Discord · ${size}`
  },

  format: {
    decimal,
    /** Up to two decimals, without trailing zeros: 0.5 → "0,5". */
    number: (value: number) => String(Math.round(value * 100) / 100).replace('.', ','),
    seconds: (value: number) => `${decimal(value, 1)} s`
  },

  dates: {
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    /** Monday first. */
    weekdays: ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'],
    /** "16 sep · 02:47" */
    recordedAt: (day: number, month: string, time: string) => `${day} ${month} · ${time}`,
    /** "28 de octubre de 2026" */
    longDay: (day: number, month: string, year: number) => `${day} de ${month} de ${year}`,
    previousMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente',
    amOrPm: 'AM o PM',
    few: 'Pocos',
    many: 'Muchos',
    /** Typed and picked days read day first: 28/10/26. */
    monthFirst: false
  },

  timeField: {
    hint: (label: string) => `${label}: escribí 50, 1:19 o 1m19s`
  },

  app: {
    missingRoot: 'Falta el contenedor #root',
    droppedMany: (count: number, name: string) =>
      `Soltaste ${count} videos: abrí «${name}». Para juntarlos, abrí cada uno y agregá sus cortes al montaje.`,
    exported: (name: string, size: string, fits: boolean) => `Exportado «${name}» · ${size}${fits ? '' : ' (supera el límite)'}`,
    ffmpegMissingBefore: 'No encontré ',
    ffmpegMissingAfter: ': sin él no se puede exportar. Clipea2 lo puede instalar con un clic.',
    seeProgress: 'Ver progreso',
    installFfmpeg: 'Instalar ffmpeg',
    libraryColumn: 'Columna de la biblioteca',
    sidebarColumn: 'Columna de montaje y exportación',
    sidebar: 'Panel lateral',
    montage: 'Montaje',
    exports: 'Exportados',
    exportRail: 'Exportar (Ctrl+E)',
    exportRailBusy: 'Exportar · exportando'
  },

  shortcuts: {
    title: 'Atajos de teclado',
    keys: {
      space: 'Espacio',
      home: 'Inicio',
      end: 'Fin',
      wheel: 'Rueda',
      delete: 'Supr'
    },
    player: 'Reproductor',
    playPause: 'Reproducir / pausar',
    frameStep: 'Cuadro anterior / siguiente',
    speed: 'Velocidad −0.25x / +0.25x',
    speedReset: 'Volver a 1.00x',
    seek: 'Retroceder / avanzar 5 s (con Shift: 1 s)',
    mute: 'Silenciar',
    trimAndMontage: 'Recorte y montaje',
    markInOut: 'Marcar inicio / fin en el cuadro actual',
    goToEdges: 'Ir al inicio / fin de la selección',
    addToMontage: 'Agregar la selección al montaje (o guardar el corte editado)',
    wheelStep: 'Cuadro siguiente / anterior con el mouse sobre el video o la línea de tiempo',
    wheelZoom: 'Zoom en la línea de tiempo (doble clic: ver todo)',
    wheelPan: 'Moverse por la línea de tiempo con zoom',
    openOther: 'Abrir un video de otra carpeta',
    drawingAndExport: 'Dibujo y exportación',
    draw: 'Dibujar sobre el cuadro actual (Esc para terminar)',
    undo: 'Deshacer (dibujos, cortes, dibujos borrados, vaciar montaje)',
    redo: 'Rehacer',
    deleteDrawing: 'Borrar el dibujo elegido (con el cursor o en su barra de la línea de tiempo)',
    exportToDisk: 'Exportar a disco (elegís dónde guardarlo)'
  },

  library: {
    title: 'Biblioteca',
    clips: (count: number) => plural(count, 'clip', 'clips'),
    searchHint: 'Buscar juego, clip o fecha',
    searchByHour: 'Buscar por hora',
    searchByDay: 'Buscar por fecha',
    addFolder: 'Agregar una carpeta de clips',
    openOther: 'Abrir un video de otra carpeta',
    rescan: 'Volver a buscar clips',
    scanning: 'Buscando clips…',
    readError: (error: string) => `No pude leer las carpetas: ${error}`,
    noMatch: 'Nada coincide',
    noClips: 'No hay clips en estas carpetas',
    tryAnother: 'Probá con otro nombre o fecha.',
    addFolderHint: 'Agregá la carpeta donde guardás tus clips o abrí un video suelto.',
    showMore: (count: number) => `Ver ${count} más`
  },

  system: {
    openVideo: 'Abrir video',
    videos: 'Videos',
    saveClip: 'Guardar clip',
    mp4Video: 'Video MP4',
    noEncryption: 'Windows no permite guardar cifrada la clave de Discord.',
    clipboardFailed: 'No se pudo copiar el archivo al portapapeles'
  },

  player: {
    frameExact: 'Número de cuadro exacto',
    frameApprox: 'Cuadro aproximado (cargando la tabla de cuadros)',
    previousFrame: 'Cuadro anterior (Ctrl+←) · mantené apretado para seguir',
    nextFrame: 'Cuadro siguiente (Ctrl+→) · mantené apretado para seguir',
    play: 'Reproducir (Espacio)',
    pause: 'Pausa (Espacio)',
    playTitle: (playing: boolean) => `${playing ? 'Pausa' : 'Reproducir'} (Espacio) · rueda: cuadro a cuadro`,
    draw: 'Dibujar (D)',
    shortcuts: 'Atajos de teclado (?)',
    settings: 'Ajustes',
    settingsOutdated: 'Ajustes · hay una versión nueva de ffmpeg',
    speedGroup: 'Velocidad de reproducción',
    speed: 'Velocidad',
    typeSpeed: 'Escribir la velocidad',
    speedTitle: 'Velocidad · hacé clic para escribirla, o usá la rueda del mouse o Ctrl+↑/↓; doble clic en la barra o Ctrl+R vuelve a 1.00x',
    speedOsd: (rate: string) => `Velocidad ${rate}`,
    wheel: 'rueda',
    volume: 'Volumen',
    volumePercent: 'Volumen en porcentaje',
    sound: 'Sonido',
    volumeTitle: 'Volumen · rueda para ajustar, M silencia',
    cantPlay: 'No se pudo reproducir este archivo. ¿Es un video válido?',
    /** "Elegí un clip" + "de la biblioteca" (the second part, grayed). */
    pickClip: ['Elegí un clip ', 'de la biblioteca'],
    /** Around the I and O keys. */
    dropHint: ['o arrastrá un video acá. Marcá el inicio ', ' y el fin ', ', y exportá para Discord.'],
    previewing: (index: number, total: number) => `Viendo el montaje · corte ${index}/${total}`,
    stop: 'Parar'
  },

  timeline: {
    position: 'Posición en el video',
    zoomHint: 'Zoom · doble clic para ver todo',
    keyframeAt: (time: string) => `Keyframe en ${time}`,
    montageCut: (number: number) => `Corte #${number} del montaje`,
    dragSelection: 'Arrastrá para mover la selección',
    drawings: 'Dibujos en la línea de tiempo'
  },

  trim: {
    title: 'Recorte',
    start: 'Inicio',
    end: 'Fin',
    startHere: 'Inicio en el cuadro actual (I)',
    endHere: 'Fin después del cuadro actual (O)',
    duration: 'Duración',
    selectAll: 'Seleccionar todo el video',
    all: 'Todo',
    editingCut: (number: number) => `Editando el corte #${number}`,
    saveCut: 'Guardar corte',
    addToMontage: 'Agregar al montaje',
    addToMontageTitle: 'Suma la selección al montaje (podés juntar cortes de varios videos)',
    cutUpdated: 'Corte actualizado',
    added: (count: number) => `Agregado al montaje (#${count})`
  },

  drawing: {
    shapes: { arrow: 'Flecha', ellipse: 'Círculo', rect: 'Rectángulo', pen: 'Trazo', text: 'Texto' },
    tools: {
      select: 'Mover dibujos (doble clic en un texto para editarlo)',
      arrow: 'Flecha',
      ellipse: 'Círculo',
      rect: 'Rectángulo',
      pen: 'Lápiz',
      text: 'Texto'
    },
    toolbar: 'Herramientas de dibujo',
    color: 'Color',
    colorNamed: (hex: string) => `Color ${hex}`,
    width: 'Grosor',
    widths: { thin: 'Fino', medium: 'Medio', thick: 'Grueso' },
    widthNamed: (name: string) => `Grosor ${name}`,
    removeKeyframe: 'Quitar el keyframe de este cuadro',
    addKeyframe: 'Keyframe en este cuadro: fija dónde está el dibujo elegido. En otro cuadro, arrastralo y se mueve solo entre los dos',
    deleteSelected: 'Borrar el dibujo elegido (Supr)',
    deleteNeedsPick: 'Borrar: elegí antes un dibujo con el cursor o en su barra',
    undo: 'Deshacer (Ctrl+Z)',
    redo: 'Rehacer (Ctrl+Y)',
    finishTitle: 'Terminar de dibujar (D o Esc)',
    done: 'Listo',
    listTitle: 'Dibujos',
    listLabel: 'Dibujos de este video',
    inThisVideo: (count: number) => `${count} en este video`,
    goTo: 'Ir a este dibujo',
    deleteOne: 'Borrar dibujo',
    textLabel: 'Texto del dibujo',
    textPlaceholder: 'Escribí y apretá Enter',
    exportFailed: 'No se pudo preparar el dibujo para exportar',
    channels: { r: 'Rojo', g: 'Verde', b: 'Azul' },
    channelRange: (name: string) => `${name} (0 a 255)`,
    hexLabel: 'Código hex del color',
    hexTitle: 'Escribí un código hex (#FFC389) y el color se ajusta solo',
    resetColorTitle: 'Vaciar este color',
    resetColor: 'Restablecer',
    useColor: 'Usar este color',
    customNew: 'Color personalizado: crear uno con RGB',
    customNewTitle: 'Color personalizado: mezclá el que quieras con RGB',
    customNamed: (hex: string) => `Color personalizado ${hex}`,
    customTitle: 'Tu color personalizado. Hacé clic otra vez para cambiarlo o quitarlo',
    custom: 'Color personalizado'
  },

  effects: {
    names: {
      fadeIn: 'Aparecer',
      fadeOut: 'Desvanecer',
      zoomIn: 'Zoom al entrar',
      zoomOut: 'Zoom al salir',
      slideIn: 'Deslizar al entrar',
      slideOut: 'Deslizar al salir',
      blink: 'Parpadeo',
      pulse: 'Latido'
    },
    atStart: 'Al empezar la barra del dibujo',
    atEnd: 'Al terminar la barra',
    whileShown: 'Mientras se ve',
    rows: { fadeIn: 'Aparecer', zoomIn: 'Zoom', slideIn: 'Deslizar', fadeOut: 'Desvanecer', zoomOut: 'Zoom', slideOut: 'Deslizar', blink: 'Parpadeo', pulse: 'Latido' },
    from: 'Desde dónde entra',
    to: 'Hacia dónde sale',
    fromSide: { left: 'desde la izquierda', right: 'desde la derecha', top: 'desde arriba', bottom: 'desde abajo' },
    toSide: { left: 'hacia la izquierda', right: 'hacia la derecha', top: 'hacia arriba', bottom: 'hacia abajo' },
    nudge: (label: string) => `${label} (↑ y ↓ para ajustar)`,
    seconds: (name: string) => `Segundos que dura: ${name}`,
    perSecond: (name: string) => `Veces por segundo: ${name}`,
    perSecondUnit: 'por s',
    title: 'Efectos',
    hint: 'Marcá un efecto y ajustá sus segundos. Se ven en la barra del dibujo y se exportan igual. Estirá la barra para darles más tiempo.',
    button: 'Efectos del dibujo: aparecer, desvanecer, zoom, deslizar, parpadeo…',
    buttonNeedsPick: 'Efectos: elegí antes un dibujo con el cursor',
    popover: 'Efectos del dibujo'
  },

  montage: {
    cuts: (count: number) => plural(count, 'corte', 'cortes'),
    preview: 'Ver',
    emptyTitle: 'Juntá varios cortes en un clip',
    emptyBody:
      'Marcá el inicio y el fin, y tocá Agregar al montaje (Enter). Podés sumar trozos de distintos videos y reordenarlos arrastrándolos. Si no agregás nada, se exporta la selección actual.',
    playCut: 'Ver este corte',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    editCut: 'Editar el inicio y el fin en la línea de tiempo',
    remove: 'Quitar del montaje'
  },

  history: {
    today: (time: string) => `Hoy ${time}`,
    yesterday: (time: string) => `Ayer ${time}`,
    clearTitle: 'Vaciar la lista de exportados (los archivos no se borran)',
    openFolder: 'Abrir la carpeta de exportación',
    refresh: 'Actualizar (revisa si los archivos siguen ahí)',
    emptyTitle: 'Todavía no exportaste nada',
    emptyBody: 'Cada exportación queda acá para copiarla a Discord, verla o volver a exportarla con otras opciones.',
    reexportTitle: '¿Reexportar este clip?',
    reexportConfirm: 'Sí, reexportar',
    reexportBody: (name: string) =>
      `Se exporta de nuevo «${name}» con los mismos cortes y dibujos, y con las opciones de exportación actuales. Después elegís dónde guardarlo.`,
    replaceTitle: '¿Reemplazar el montaje?',
    replaceConfirm: 'Sí, reemplazar',
    replaceBody: (name: string, cuts: number) =>
      `Los cortes y dibujos de «${name}» van a reemplazar ${cuts === 1 ? 'el corte' : `los ${cuts} cortes`} que tenés ahora en el montaje.`,
    specs: 'Con qué ajustes se exportó',
    watch: 'Ver en el reproductor',
    isNew: 'Nuevo',
    render: (duration: string) => ` · Render ${duration}`,
    size: 'Peso:',
    drawings: (count: number) => plural(count, 'dibujo', 'dibujos'),
    passes: (count: number) => `${count} pasadas`,
    fileGone: 'El archivo ya no está en la carpeta. Podés exportarlo de nuevo.',
    missingSources: (count: number) =>
      `${count === 1 ? 'Falta 1 video original' : `Faltan ${count} videos originales`}: no se puede volver a exportar.`,
    copied: 'Copiado: Ctrl+V en Discord',
    copyFailed: 'No se pudo copiar',
    sendToChannel: 'Enviar a canal',
    reexport: 'Reexportar: los mismos cortes y dibujos, con las opciones de exportación actuales',
    edit: 'Editar: carga los cortes y dibujos en el montaje para cambiarlos',
    showInFolder: 'Mostrar en la carpeta',
    remove: 'Quitar del historial (el archivo no se borra)'
  },

  export: {
    title: 'Exportar',
    options: 'Opciones de exportación',
    openVideoFirst: 'Abrí un video y marcá qué parte querés.',
    montageWins: 'Se exporta el montaje, no la selección. Para exportar solo la selección, vaciá el montaje.',
    fileName: 'Nombre del archivo',
    fileNameTitle: 'Nombre del archivo (sin .mp4)',
    fileNamePlaceholder: 'Nombre del clip',
    progress: 'Progreso de la exportación',
    preparing: 'Preparando…',
    toDisk: 'Exportar a disco',
    cancelled: 'Exportación cancelada.',
    /** Default file name when the cuts come from several games: "Montaje 2026-10-31 01.39". */
    montageName: 'Montaje',
    maxMbps: (mbps: string) => `${mbps} Mbps máx.`,
    noFit: (limit: string, longest: string) => `No entra en ${limit} ni bajando la calidad. Recortá a menos de ${longest} o elegí «Sin límite».`,
    reduced: (limit: string, height: number, fps: number, longest: string) =>
      `Para entrar en ${limit}, baja a ${height}p ${fps} fps. Con menos de ${longest} se mantiene la resolución.`,
    lowQuality: 'Es mucho video para ese tamaño: la calidad va a ser baja.',
    retryNote: (size: string, attempt: number) => `Salió de ${size}: lo achico y reintento (intento ${attempt})`,
    gpuFallback: 'La GPU no pudo con este clip: sigo con la CPU (puede tardar más).',
    noFfmpeg: 'No encontré ffmpeg: instalalo (winget install Gyan.FFmpeg) o elegilo en Ajustes.',
    cantEncode: (codec: string) => `Tu ffmpeg no puede codificar ${codec}. Elegí otro códec.`,
    noPicture: 'Alguno de los videos no tiene imagen.',
    ffmpegFailed: 'ffmpeg falló sin dar detalles',
    maxSize: 'Peso máximo',
    maxSizeTitle: 'Peso máximo estimado: el archivo puede salir más liviano',
    ofLimit: (limit: string) => `de ${limit}`,
    sizeBar: 'Peso estimado respecto del límite',
    quality: 'Calidad',
    qualityTitle: 'Calidad estimada para esta duración',
    grades: { excelente: 'Excelente', buena: 'Buena', aceptable: 'Aceptable', baja: 'Baja' },
    qualitySteps: (grade: string, steps: number) => `Calidad ${grade}: ${steps} de 4`,
    codec: 'Códec',
    videoCodec: 'Códec de video',
    codecTitles: {
      hevc: 'Recomendado: la mejor calidad por MB',
      h264: 'Máxima compatibilidad: se ve en cualquier navegador o celular',
      av1: 'Rinde como H.265 en tus clips; algunos celulares viejos no lo reproducen'
    },
    noGpu: (title: string) => `${title} (sin GPU: más lento)`,
    qualities: { max: 'Máxima', high: 'Alta', light: 'Liviana' },
    qualityTitles: { max: 'Más bitrate en clips cortos', high: 'Equilibrio entre calidad y peso', light: 'Archivos más chicos' },
    resolution: 'Resolución',
    maxResolution: 'Resolución máxima',
    original: 'Original',
    upTo: (value: string) => `Hasta ${value}`,
    frameRate: 'Cuadros',
    maxFps: 'Cuadros por segundo máximos',
    sizeLimit: 'Límite de tamaño',
    limits: { '20': 'Discord gratis · 20 MB', '50': 'Nitro Basic · 50 MB', '10': '10 MB (límite viejo)', none: 'Sin límite (solo calidad)' },
    customLimit: (mb: string) => `${mb} MB (personalizado)`,
    outputFolder: 'Carpeta de salida'
  },

  discord: {
    title: 'Enviar a un canal de Discord',
    newUrl: 'URL nueva del webhook',
    keepUrl: 'Dejala vacía para mantener la actual.',
    listName: 'Nombre en la lista',
    editChannel: 'Editar canal',
    send: 'Enviar',
    removeNamed: (name: string) => `Quitar ${name}`,
    steps: [
      'En Discord, en el canal donde querés mandar clips: ⚙ Editar canal › Integraciones › Webhooks.',
      'Nuevo webhook › (opcional: ponele tu nombre y tu foto) › Copiar URL del webhook.',
      'Pegala acá abajo. Se hace una sola vez por canal.'
    ],
    url: 'URL del webhook',
    listNameOptional: 'Nombre en la lista (opcional)',
    listNamePlaceholder: 'Ej.: Amigos › #clips',
    add: 'Agregar canal',
    sent: (name: string) => `Enviado a ${name}.`,
    addAnother: 'Agregar otro canal',
    direct: 'Envío directo a un canal',
    notListed: 'Ese canal ya no está en la lista.',
    notDirect: 'Ese canal todavía no tiene envío directo.',
    tooBig: 'El clip pasa los 25 MB: Discord no lo acepta por webhook.',
    goneEdit: 'Ese webhook ya no existe en Discord: tocá Editar y pegá la URL de uno nuevo.',
    notWebhook: 'Eso no es una URL de webhook (empieza con https://discord.com/api/webhooks/…).',
    defaultName: 'Canal de Discord',
    gone: 'Ese webhook ya no existe en Discord: pegá uno nuevo.',
    serverLimit: 'Discord rechazó el clip por tamaño: el límite de ese servidor es más chico.',
    wait: (seconds: number) => `Discord pide esperar ${seconds} s antes de enviar otro.`,
    status: (code: number) => `Discord respondió ${code}.`,
    noChannel: 'Discord no devolvió el canal de ese webhook.'
  },

  settings: {
    title: 'Ajustes',
    sections: 'Secciones de ajustes',
    tabs: { general: 'General', timeline: 'Línea de tiempo', performance: 'Rendimiento' },
    language: 'Idioma',
    clipFolders: 'Carpetas de clips',
    clipFoldersHint:
      'Las carpetas donde se guardan tus grabaciones, sea cual sea el programa. La biblioteca las muestra juntas, y cada subcarpeta (un juego, por ejemplo), como un grupo.',
    folders: (count: number) => (count === 0 ? 'Ninguna carpeta todavía' : plural(count, 'carpeta', 'carpetas')),
    removeFolder: 'Quitar de la biblioteca (los videos no se borran)',
    addFolder: 'Agregar carpeta',
    exportFolder: 'Carpeta de exportación',
    gpu: 'Aceleración por GPU',
    gpuChecking: 'Buscando la GPU…',
    gpuFound: (name: string) => `${name}: exporta varias veces más rápido. Desactivala solo si una exportación falla o se ve rara.`,
    gpuMissing: 'No encontré una GPU compatible (NVIDIA, AMD o Intel): se usa la CPU.',
    classicTimeline: 'Línea de tiempo anterior',
    classicTimelineHint: 'Muestra el inicio y el fin del recorte con las pestañas naranjas de antes, en vez de las líneas verde y roja.',
    now: 'Ahora',
    withChange: 'Con el cambio',
    oldVersion: (version: string) => `Versión vieja · ya salió la ${version}`,
    unavailable: 'no disponible',
    checkingGpu: 'Revisando la GPU…',
    ffmpegNotFound: 'No encontrado: sin ffmpeg no se puede exportar.',
    pickFfmpeg: 'Elegir carpeta de ffmpeg',
    autoFfmpeg: 'Volver a buscarlo automáticamente',
    /** Around the bold "20 MB por archivo". */
    discordNote: [
      'Límite de Discord sin Nitro: ',
      '20 MB por archivo',
      ' (subió de 10 MB en agosto de 2026). Clipea2 apunta al 95 % del límite y, si el archivo sale más grande, lo vuelve a codificar más liviano.'
    ]
  },

  ffmpeg: {
    latestFailed: (status: number) => `No pude consultar la última versión de ffmpeg (HTTP ${status}).`,
    checksumFailed: (status: number) => `No pude consultar el checksum de ffmpeg (HTTP ${status}).`,
    badVersion: (version: string) => `La versión publicada de ffmpeg no se entiende: «${version}».`,
    downloadFailed: (status: number) => `No pude descargar ffmpeg (HTTP ${status}).`,
    zipIncomplete: 'El zip de ffmpeg no trae ffmpeg.exe y ffprobe.exe.',
    corrupted: 'La descarga de ffmpeg llegó incompleta o dañada. Probá de nuevo.',
    unzipFailed: (detail: string) => `No pude descomprimir ffmpeg: ${detail}`,
    tarExit: (code: number | null) => `tar terminó con ${code}`,
    installing: 'Instalando…',
    downloading: 'Descargando ffmpeg…',
    lookingLatest: 'Buscando la última versión…',
    installProgress: 'Instalación de ffmpeg',
    installTitle: 'Instalalo con un clic',
    installBody: 'Clipea2 descarga la versión oficial para Windows (unos 115 MB) y la deja lista para usar.',
    install: 'Instalar',
    retry: 'Reintentar',
    searching: 'Buscando…',
    updateTo: (version: string) => `Actualizar a ${version}`,
    latest: 'Es la última versión',
    checkUpdate: 'Buscar actualización'
  },

  undo: {
    changes: {
      'segment-added': 'corte agregado',
      'segment-removed': 'corte quitado',
      'montage-cleared': 'montaje vaciado',
      'montage-replaced': 'montaje reemplazado',
      'montage-reordered': 'orden del montaje',
      'segment-edited': 'corte editado',
      'drawing-added': 'dibujo agregado',
      'drawing-removed': 'dibujo borrado',
      'drawing-edited': 'dibujo cambiado',
      none: 'cambio'
    },
    undo: 'Deshacer',
    nothingToUndo: 'Nada para deshacer',
    nothingToRedo: 'Nada para rehacer',
    undone: (change: string) => `Deshecho: ${change}`,
    redone: (change: string) => `Rehecho: ${change}`
  },

  media: {
    thumbnailFailed: 'No se pudo generar la miniatura',
    filmstripFailed: 'No se pudo generar la tira de miniaturas',
    probeFailed: (code: number | null) => `ffprobe terminó con código ${code}`,
    cancelled: 'Operación cancelada'
  },

  dialog: {
    close: 'Cerrar (Esc)'
  }
}

export type Messages = typeof es
