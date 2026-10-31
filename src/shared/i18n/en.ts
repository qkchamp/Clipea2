import type { Messages } from './es'

/** Every text Clipea2 shows, in English: the same shape as es.ts. */
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const decimal = (value: number, digits: number): string => value.toFixed(digits)

export const en: Messages = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    change: 'Change',
    clear: 'Clear',
    confirmClear: 'Clear?',
    show: 'Show',
    on: 'On',
    off: 'Off',
    closeNotice: 'Close notice',
    copyForDiscord: 'Copy for Discord',
    copiedForDiscord: 'Copied: paste it in Discord with Ctrl+V',
    copyFailed: "Couldn't copy the file",
    noLimit: 'no limit',
    discordLimit: (size: string) => `Discord · ${size}`
  },

  format: {
    decimal,
    number: (value: number) => String(Math.round(value * 100) / 100),
    seconds: (value: number) => `${decimal(value, 1)} s`
  },

  dates: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    recordedAt: (day: number, month: string, time: string) => `${month} ${day} · ${time}`,
    longDay: (day: number, month: string, year: number) => `${month} ${day}, ${year}`,
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    amOrPm: 'AM or PM',
    few: 'Few',
    many: 'Many',
    /** Typed and picked days read month first: 10/28/26. */
    monthFirst: true
  },

  timeField: {
    hint: (label: string) => `${label}: type 50, 1:19 or 1m19s`
  },

  app: {
    missingRoot: 'The #root container is missing',
    droppedMany: (count: number, name: string) =>
      `You dropped ${count} videos: I opened “${name}”. To join them, open each one and add its cuts to the montage.`,
    exported: (name: string, size: string, fits: boolean) => `Exported “${name}” · ${size}${fits ? '' : ' (over the limit)'}`,
    ffmpegMissingBefore: "Couldn't find ",
    ffmpegMissingAfter: ': without it, nothing can be exported. Clipea2 can install it in one click.',
    seeProgress: 'See progress',
    installFfmpeg: 'Install ffmpeg',
    libraryColumn: 'Library column',
    sidebarColumn: 'Montage and export column',
    sidebar: 'Side panel',
    montage: 'Montage',
    exports: 'Exports',
    exportRail: 'Export (Ctrl+E)',
    exportRailBusy: 'Export · exporting'
  },

  shortcuts: {
    title: 'Keyboard shortcuts',
    keys: {
      space: 'Space',
      home: 'Home',
      end: 'End',
      wheel: 'Wheel',
      delete: 'Del'
    },
    player: 'Player',
    playPause: 'Play / pause',
    frameStep: 'Previous / next frame',
    speed: 'Speed −0.25x / +0.25x',
    speedReset: 'Back to 1.00x',
    seek: 'Back / forward 5 s (with Shift: 1 s)',
    mute: 'Mute',
    trimAndMontage: 'Trim and montage',
    markInOut: 'Mark start / end at the current frame',
    goToEdges: 'Go to the start / end of the selection',
    addToMontage: 'Add the selection to the montage (or save the cut being edited)',
    wheelStep: 'Next / previous frame with the mouse over the video or the timeline',
    wheelZoom: 'Zoom the timeline (double-click: see it all)',
    wheelPan: 'Move along the zoomed timeline',
    openOther: 'Open a video from another folder',
    drawingAndExport: 'Drawing and export',
    draw: 'Draw on the current frame (Esc to finish)',
    undo: 'Undo (drawings, cuts, deleted drawings, clearing the montage)',
    redo: 'Redo',
    deleteDrawing: 'Delete the selected drawing (picked with the cursor or on its bar in the timeline)',
    exportToDisk: 'Export to disk (you choose where to save it)'
  },

  library: {
    title: 'Library',
    clips: (count: number) => plural(count, 'clip', 'clips'),
    searchHint: 'Search game, clip or date',
    searchByHour: 'Search by hour',
    searchByDay: 'Search by date',
    addFolder: 'Add a clips folder',
    openOther: 'Open a video from another folder',
    rescan: 'Look for clips again',
    scanning: 'Looking for clips…',
    readError: (error: string) => `Couldn't read the folders: ${error}`,
    noMatch: 'Nothing matches',
    noClips: 'No clips in these folders',
    tryAnother: 'Try another name or date.',
    addFolderHint: 'Add the folder where you keep your clips, or open a single video.',
    showMore: (count: number) => `Show ${count} more`
  },

  system: {
    openVideo: 'Open video',
    videos: 'Videos',
    saveClip: 'Save clip',
    mp4Video: 'MP4 video',
    noEncryption: "Windows can't store the Discord key encrypted.",
    clipboardFailed: "Couldn't copy the file to the clipboard"
  },

  player: {
    frameExact: 'Exact frame number',
    frameApprox: 'Approximate frame (loading the frame table)',
    previousFrame: 'Previous frame (Ctrl+←) · hold to keep stepping',
    nextFrame: 'Next frame (Ctrl+→) · hold to keep stepping',
    play: 'Play (Space)',
    pause: 'Pause (Space)',
    playTitle: (playing: boolean) => `${playing ? 'Pause' : 'Play'} (Space) · wheel: frame by frame`,
    draw: 'Draw (D)',
    shortcuts: 'Keyboard shortcuts (?)',
    settings: 'Settings',
    settingsOutdated: 'Settings · a new version of ffmpeg is out',
    speedGroup: 'Playback speed',
    speed: 'Speed',
    typeSpeed: 'Type the speed',
    speedTitle: 'Speed · click to type it, or use the mouse wheel or Ctrl+↑/↓; double-click the bar or press Ctrl+R to go back to 1.00x',
    speedOsd: (rate: string) => `Speed ${rate}`,
    wheel: 'wheel',
    volume: 'Volume',
    volumePercent: 'Volume in percent',
    sound: 'Sound',
    volumeTitle: 'Volume · wheel to adjust, M to mute',
    cantPlay: "Couldn't play this file. Is it a valid video?",
    pickClip: ['Pick a clip ', 'from the library'],
    dropHint: ['or drop a video here. Mark the start ', ' and the end ', ', then export it for Discord.'],
    previewing: (index: number, total: number) => `Playing the montage · cut ${index}/${total}`,
    stop: 'Stop'
  },

  timeline: {
    position: 'Position in the video',
    zoomHint: 'Zoom · double-click to see it all',
    keyframeAt: (time: string) => `Keyframe at ${time}`,
    montageCut: (number: number) => `Montage cut #${number}`,
    dragSelection: 'Drag to move the selection',
    drawings: 'Drawings on the timeline'
  },

  trim: {
    title: 'Trim',
    start: 'Start',
    end: 'End',
    startHere: 'Start at the current frame (I)',
    endHere: 'End after the current frame (O)',
    duration: 'Length',
    selectAll: 'Select the whole video',
    all: 'All',
    editingCut: (number: number) => `Editing cut #${number}`,
    saveCut: 'Save cut',
    addToMontage: 'Add to montage',
    addToMontageTitle: 'Adds the selection to the montage (you can join cuts from several videos)',
    cutUpdated: 'Cut updated',
    added: (count: number) => `Added to the montage (#${count})`
  },

  drawing: {
    shapes: { arrow: 'Arrow', ellipse: 'Circle', rect: 'Rectangle', pen: 'Stroke', text: 'Text' },
    tools: {
      select: 'Move drawings (double-click a text to edit it)',
      arrow: 'Arrow',
      ellipse: 'Circle',
      rect: 'Rectangle',
      pen: 'Pencil',
      text: 'Text'
    },
    toolbar: 'Drawing tools',
    color: 'Color',
    colorNamed: (hex: string) => `Color ${hex}`,
    width: 'Thickness',
    widths: { thin: 'Thin', medium: 'Medium', thick: 'Thick' },
    widthNamed: (name: string) => `Thickness: ${name}`,
    removeKeyframe: 'Remove the keyframe at this frame',
    addKeyframe: 'Keyframe at this frame: pins where the selected drawing is. On another frame, drag it and it moves on its own between the two',
    deleteSelected: 'Delete the selected drawing (Del)',
    deleteNeedsPick: 'Delete: first pick a drawing with the cursor or on its bar',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    finishTitle: 'Finish drawing (D or Esc)',
    done: 'Done',
    listTitle: 'Drawings',
    listLabel: 'Drawings in this video',
    inThisVideo: (count: number) => `${count} in this video`,
    goTo: 'Go to this drawing',
    deleteOne: 'Delete drawing',
    textLabel: 'Drawing text',
    textPlaceholder: 'Type and press Enter',
    exportFailed: "Couldn't prepare the drawing for export",
    channels: { r: 'Red', g: 'Green', b: 'Blue' },
    channelRange: (name: string) => `${name} (0 to 255)`,
    hexLabel: 'Color hex code',
    hexTitle: 'Type a hex code (#FFC389) and the color follows',
    resetColorTitle: 'Clear this color',
    resetColor: 'Reset',
    useColor: 'Use this color',
    customNew: 'Custom color: create one with RGB',
    customNewTitle: 'Custom color: mix any color you like with RGB',
    customNamed: (hex: string) => `Custom color ${hex}`,
    customTitle: 'Your custom color. Click it again to change or remove it',
    custom: 'Custom color'
  },

  effects: {
    names: {
      fadeIn: 'Fade in',
      fadeOut: 'Fade out',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      slideIn: 'Slide in',
      slideOut: 'Slide out',
      blink: 'Blink',
      pulse: 'Pulse'
    },
    atStart: 'When the drawing’s bar starts',
    atEnd: 'When the bar ends',
    whileShown: 'While it’s on screen',
    rows: { fadeIn: 'Fade in', zoomIn: 'Zoom', slideIn: 'Slide', fadeOut: 'Fade out', zoomOut: 'Zoom', slideOut: 'Slide', blink: 'Blink', pulse: 'Pulse' },
    from: 'Where it comes in from',
    to: 'Where it leaves to',
    fromSide: { left: 'from the left', right: 'from the right', top: 'from the top', bottom: 'from the bottom' },
    toSide: { left: 'to the left', right: 'to the right', top: 'to the top', bottom: 'to the bottom' },
    nudge: (label: string) => `${label} (↑ and ↓ to adjust)`,
    seconds: (name: string) => `Seconds it lasts: ${name}`,
    perSecond: (name: string) => `Times per second: ${name}`,
    perSecondUnit: 'per s',
    title: 'Effects',
    hint: 'Tick an effect and set its seconds. They show on the drawing’s bar and are exported just the same. Stretch the bar to give them more time.',
    button: 'Drawing effects: fade in, fade out, zoom, slide, blink…',
    buttonNeedsPick: 'Effects: first pick a drawing with the cursor',
    popover: 'Drawing effects'
  },

  montage: {
    cuts: (count: number) => plural(count, 'cut', 'cuts'),
    preview: 'Play',
    emptyTitle: 'Join several cuts into one clip',
    emptyBody:
      'Mark a start and an end, then hit Add to montage (Enter). You can add pieces of different videos and reorder them by dragging. If you add nothing, the current selection is exported.',
    playCut: 'Play this cut',
    moveUp: 'Move up',
    moveDown: 'Move down',
    editCut: 'Edit the start and end on the timeline',
    remove: 'Remove from the montage'
  },

  history: {
    today: (time: string) => `Today ${time}`,
    yesterday: (time: string) => `Yesterday ${time}`,
    clearTitle: 'Clear the list of exports (the files are not deleted)',
    openFolder: 'Open the export folder',
    refresh: 'Refresh (checks whether the files are still there)',
    emptyTitle: "You haven't exported anything yet",
    emptyBody: 'Every export stays here so you can copy it to Discord, watch it or export it again with other options.',
    reexportTitle: 'Export this clip again?',
    reexportConfirm: 'Yes, export again',
    reexportBody: (name: string) =>
      `“${name}” is exported again with the same cuts and drawings, and with the current export options. Then you choose where to save it.`,
    replaceTitle: 'Replace the montage?',
    replaceConfirm: 'Yes, replace it',
    replaceBody: (name: string, cuts: number) =>
      `The cuts and drawings of “${name}” will replace ${cuts === 1 ? 'the cut' : `the ${cuts} cuts`} you now have in the montage.`,
    specs: 'Settings it was exported with',
    watch: 'Watch in the player',
    isNew: 'New',
    render: (duration: string) => ` · Rendered in ${duration}`,
    size: 'Size:',
    drawings: (count: number) => plural(count, 'drawing', 'drawings'),
    passes: (count: number) => `${count} passes`,
    fileGone: 'The file is no longer in the folder. You can export it again.',
    missingSources: (count: number) =>
      `${count === 1 ? '1 original video is missing' : `${count} original videos are missing`}: it can't be exported again.`,
    copied: 'Copied: Ctrl+V in Discord',
    copyFailed: "Couldn't copy",
    sendToChannel: 'Send to channel',
    reexport: 'Export again: the same cuts and drawings, with the current export options',
    edit: 'Edit: loads the cuts and drawings into the montage to change them',
    showInFolder: 'Show in folder',
    remove: 'Remove from the history (the file is not deleted)'
  },

  export: {
    title: 'Export',
    options: 'Export options',
    openVideoFirst: 'Open a video and mark the part you want.',
    montageWins: 'The montage is exported, not the selection. To export just the selection, clear the montage.',
    fileName: 'File name',
    fileNameTitle: 'File name (without .mp4)',
    fileNamePlaceholder: 'Clip name',
    progress: 'Export progress',
    preparing: 'Preparing…',
    toDisk: 'Export to disk',
    cancelled: 'Export cancelled.',
    montageName: 'Montage',
    maxMbps: (mbps: string) => `${mbps} Mbps max.`,
    noFit: (limit: string, longest: string) => `It doesn't fit in ${limit}, even at the lowest quality. Trim it to under ${longest} or pick “No limit”.`,
    reduced: (limit: string, height: number, fps: number, longest: string) =>
      `To fit in ${limit}, it drops to ${height}p ${fps} fps. Under ${longest}, it keeps the resolution.`,
    lowQuality: "That's a lot of video for that size: the quality will be low.",
    retryNote: (size: string, attempt: number) => `It came out at ${size}: making it smaller and trying again (attempt ${attempt})`,
    gpuFallback: "The GPU couldn't handle this clip: carrying on with the CPU (it may take longer).",
    noFfmpeg: "Couldn't find ffmpeg: install it (winget install Gyan.FFmpeg) or pick it in Settings.",
    cantEncode: (codec: string) => `Your ffmpeg can't encode ${codec}. Pick another codec.`,
    noPicture: 'One of the videos has no picture.',
    ffmpegFailed: 'ffmpeg failed without giving details',
    maxSize: 'Max size',
    maxSizeTitle: 'Estimated maximum size: the file may come out smaller',
    ofLimit: (limit: string) => `of ${limit}`,
    sizeBar: 'Estimated size against the limit',
    quality: 'Quality',
    qualityTitle: 'Estimated quality for this length',
    grades: { excelente: 'Excellent', buena: 'Good', aceptable: 'Fair', baja: 'Low' },
    qualitySteps: (grade: string, steps: number) => `Quality ${grade}: ${steps} of 4`,
    codec: 'Codec',
    videoCodec: 'Video codec',
    codecTitles: {
      hevc: 'Recommended: the best quality per MB',
      h264: 'Maximum compatibility: plays in any browser or phone',
      av1: 'Performs like H.265 on your clips; some old phones can’t play it'
    },
    noGpu: (title: string) => `${title} (no GPU: slower)`,
    qualities: { max: 'Maximum', high: 'High', light: 'Light' },
    qualityTitles: { max: 'More bitrate on short clips', high: 'Balance between quality and size', light: 'Smaller files' },
    resolution: 'Resolution',
    maxResolution: 'Maximum resolution',
    original: 'Original',
    upTo: (value: string) => `Up to ${value}`,
    frameRate: 'Frame rate',
    maxFps: 'Maximum frames per second',
    sizeLimit: 'Size limit',
    limits: { '20': 'Discord free · 20 MB', '50': 'Nitro Basic · 50 MB', '10': '10 MB (old limit)', none: 'No limit (quality only)' },
    customLimit: (mb: string) => `${mb} MB (custom)`,
    outputFolder: 'Output folder'
  },

  discord: {
    title: 'Send to a Discord channel',
    newUrl: 'New webhook URL',
    keepUrl: 'Leave it empty to keep the current one.',
    listName: 'Name in the list',
    editChannel: 'Edit channel',
    send: 'Send',
    removeNamed: (name: string) => `Remove ${name}`,
    steps: [
      'In Discord, on the channel where you want to send clips: ⚙ Edit Channel › Integrations › Webhooks.',
      'New Webhook › (optional: give it your name and picture) › Copy Webhook URL.',
      'Paste it below. You only do this once per channel.'
    ],
    url: 'Webhook URL',
    listNameOptional: 'Name in the list (optional)',
    listNamePlaceholder: 'E.g. Friends › #clips',
    add: 'Add channel',
    sent: (name: string) => `Sent to ${name}.`,
    addAnother: 'Add another channel',
    direct: 'Send straight to a channel',
    notListed: 'That channel is no longer in the list.',
    notDirect: "That channel can't send directly yet.",
    tooBig: "The clip is over 25 MB: Discord won't take it through a webhook.",
    goneEdit: 'That webhook no longer exists in Discord: click Edit and paste the URL of a new one.',
    notWebhook: "That's not a webhook URL (it starts with https://discord.com/api/webhooks/…).",
    defaultName: 'Discord channel',
    gone: 'That webhook no longer exists in Discord: paste a new one.',
    serverLimit: "Discord rejected the clip for its size: that server's limit is smaller.",
    wait: (seconds: number) => `Discord asks to wait ${seconds} s before sending another one.`,
    status: (code: number) => `Discord responded with ${code}.`,
    noChannel: "Discord didn't return that webhook's channel."
  },

  settings: {
    title: 'Settings',
    sections: 'Settings sections',
    tabs: { general: 'General', timeline: 'Timeline', performance: 'Performance' },
    language: 'Language',
    clipFolders: 'Clip folders',
    clipFoldersHint:
      'The folders where your recordings are saved, by any program. The library shows them together, and each subfolder (a game, for example) as a group.',
    folders: (count: number) => (count === 0 ? 'No folders yet' : plural(count, 'folder', 'folders')),
    removeFolder: 'Remove from the library (the videos are not deleted)',
    addFolder: 'Add folder',
    exportFolder: 'Export folder',
    gpu: 'GPU acceleration',
    gpuChecking: 'Looking for the GPU…',
    gpuFound: (name: string) => `${name}: exports several times faster. Turn it off only if an export fails or looks wrong.`,
    gpuMissing: "Couldn't find a compatible GPU (NVIDIA, AMD or Intel): the CPU is used.",
    classicTimeline: 'Classic timeline',
    classicTimelineHint: 'Shows the start and end of the trim with the orange tabs from before, instead of the green and red lines.',
    now: 'Now',
    withChange: 'After the change',
    oldVersion: (version: string) => `Old version · ${version} is out`,
    unavailable: 'not available',
    checkingGpu: 'Checking the GPU…',
    ffmpegNotFound: 'Not found: without ffmpeg, nothing can be exported.',
    pickFfmpeg: 'Choose the ffmpeg folder',
    autoFfmpeg: 'Go back to finding it automatically',
    discordNote: [
      'Discord limit without Nitro: ',
      '20 MB per file',
      ' (up from 10 MB in August 2026). Clipea2 aims for 95% of the limit and, if the file comes out bigger, re-encodes it smaller.'
    ]
  },

  ffmpeg: {
    latestFailed: (status: number) => `Couldn't check the latest version of ffmpeg (HTTP ${status}).`,
    checksumFailed: (status: number) => `Couldn't get the ffmpeg checksum (HTTP ${status}).`,
    badVersion: (version: string) => `The published ffmpeg version can't be read: “${version}”.`,
    downloadFailed: (status: number) => `Couldn't download ffmpeg (HTTP ${status}).`,
    zipIncomplete: "The ffmpeg zip doesn't include ffmpeg.exe and ffprobe.exe.",
    corrupted: 'The ffmpeg download arrived incomplete or damaged. Try again.',
    unzipFailed: (detail: string) => `Couldn't unzip ffmpeg: ${detail}`,
    tarExit: (code: number | null) => `tar ended with ${code}`,
    installing: 'Installing…',
    downloading: 'Downloading ffmpeg…',
    lookingLatest: 'Looking for the latest version…',
    installProgress: 'ffmpeg installation',
    installTitle: 'Install it in one click',
    installBody: 'Clipea2 downloads the official Windows build (about 115 MB) and gets it ready to use.',
    install: 'Install',
    retry: 'Retry',
    searching: 'Checking…',
    updateTo: (version: string) => `Update to ${version}`,
    latest: "It's the latest version",
    checkUpdate: 'Check for updates'
  },

  undo: {
    changes: {
      'segment-added': 'cut added',
      'segment-removed': 'cut removed',
      'montage-cleared': 'montage cleared',
      'montage-replaced': 'montage replaced',
      'montage-reordered': 'montage order',
      'segment-edited': 'cut edited',
      'drawing-added': 'drawing added',
      'drawing-removed': 'drawing deleted',
      'drawing-edited': 'drawing changed',
      none: 'change'
    },
    undo: 'Undo',
    nothingToUndo: 'Nothing to undo',
    nothingToRedo: 'Nothing to redo',
    undone: (change: string) => `Undone: ${change}`,
    redone: (change: string) => `Redone: ${change}`
  },

  media: {
    thumbnailFailed: "Couldn't make the thumbnail",
    filmstripFailed: "Couldn't make the thumbnail strip",
    probeFailed: (code: number | null) => `ffprobe ended with code ${code}`,
    cancelled: 'Operation cancelled'
  },

  dialog: {
    close: 'Close (Esc)'
  }
}
