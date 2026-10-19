import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ClipboardPaste, Hash, LoaderCircle, Megaphone, Plus, Search, Send, X, Zap } from 'lucide-react'
import { api } from '@shared/ui/api'
import { Button, IconButton, TextInput } from '@shared/ui/atoms'
import { Field } from '@shared/ui/molecules'
import { Dialog } from '@shared/ui/organisms/Dialog'
import { ipcErrorMessage } from '@shared/ui/ipcError'
import { useUiStore } from '@shared/ui/uiStore'
import { cx } from '@shared/ui/cx'
import type { DiscordChannel, DiscordGuild, WebhookTarget } from '../domain/discordTargets'
import styles from './discord.module.css'

type Phase = 'loading' | 'setup' | 'connecting' | 'ready' | 'failed'

/** Last server and channel picked, so the next clip starts there. */
const lastChoice: { guildId: string | null; channelId: string | null } = { guildId: null, channelId: null }

function SetupForm({ onSave }: { onSave: (clientId: string, clientSecret: string) => void }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  return (
    <form
      className={styles.setup}
      onSubmit={(event) => {
        event.preventDefault()
        onSave(clientId, clientSecret)
      }}
    >
      <p className={styles.lead}>
        Para ver tus servidores, Clipea2 se conecta a la app de Discord de esta PC. Se configura una sola vez:
      </p>
      <ol className={styles.steps}>
        <li>
          Entrá a{' '}
          <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
            discord.com/developers/applications
          </a>{' '}
          y creá una aplicación (New Application, por ejemplo «Clipea2»).
        </li>
        <li>En OAuth2 copiá el Client ID y tocá Reset Secret para copiar el Client Secret.</li>
        <li>
          En OAuth2 › Redirects agregá <code>http://127.0.0.1</code> y guardá.
        </li>
      </ol>
      <div className={styles.fields}>
        <Field label="Client ID">
          <TextInput value={clientId} placeholder="123456789012345678" onChange={(event) => setClientId(event.target.value)} />
        </Field>
        <Field label="Client Secret">
          <TextInput type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
        </Field>
      </div>
      <p className={styles.fine}>Se guardan cifrados en esta PC. Clipea2 solo lee tus servidores y canales.</p>
      <Button type="submit" variant="primary" disabled={!clientId.trim() || !clientSecret.trim()}>
        Conectar con Discord
      </Button>
    </form>
  )
}

const targetLabel = (target: WebhookTarget): string =>
  target.channelName ? `${target.guildName} › #${target.channelName}` : target.guildName

/** Channels that send directly through their webhook: no Discord app needed, works with it closed. */
function DirectList({
  targets,
  busyId,
  onSend,
  onRemove
}: {
  targets: WebhookTarget[]
  busyId: string | null
  onSend: (target: WebhookTarget) => void
  onRemove: (target: WebhookTarget) => void
}) {
  return (
    <ul className={styles.directList}>
      {targets.map((target) => (
        <li key={target.channelId} className={styles.directItem}>
          <Zap size={13} className={styles.directMark} />
          <span className={styles.name}>{targetLabel(target)}</span>
          <Button size="sm" variant="primary" icon={<Send size={13} />} loading={busyId === target.channelId} onClick={() => onSend(target)}>
            Enviar
          </Button>
          <IconButton small label={`Quitar ${targetLabel(target)}`} onClick={() => onRemove(target)}>
            <X size={13} />
          </IconButton>
        </li>
      ))}
    </ul>
  )
}

/** Add a channel by pasting its webhook URL: the only setup sending needs. */
function AddWebhookForm({ onAdd }: { onAdd: (url: string, label: string) => Promise<void> }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <form
      className={styles.addForm}
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        void onAdd(url, label)
          .then(() => {
            setUrl('')
            setLabel('')
          })
          .finally(() => setSaving(false))
      }}
    >
      <ol className={styles.steps}>
        <li>En Discord, en el canal donde querés mandar clips: ⚙ Editar canal › Integraciones › Webhooks.</li>
        <li>Nuevo webhook › (opcional: ponele tu nombre y tu foto) › Copiar URL del webhook.</li>
        <li>Pegala acá abajo. Se hace una sola vez por canal.</li>
      </ol>
      <div className={styles.fields}>
        <Field label="URL del webhook">
          <TextInput type="password" placeholder="https://discord.com/api/webhooks/…" value={url} onChange={(event) => setUrl(event.target.value)} />
        </Field>
        <Field label="Nombre en la lista (opcional)">
          <TextInput placeholder="Ej: Amigos › #clips" value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" icon={<Plus size={14} />} loading={saving} disabled={!url.trim()}>
        Agregar canal
      </Button>
    </form>
  )
}

/** Paste the channel's webhook once; from then on the clip is posted without Ctrl+V. */
function WebhookForm({ channelName, onSave }: { channelName: string; onSave: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <form
      className={styles.webhookForm}
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        void onSave(url).finally(() => setSaving(false))
      }}
    >
      <span className={styles.columnTitle}>
        <Zap size={13} /> Envío directo a #{channelName}
      </span>
      <p className={styles.fine}>
        En Discord: Editar canal › Integraciones › Webhooks › Nuevo webhook › Copiar URL del webhook. Se pega una sola vez.
      </p>
      <div className={styles.row}>
        <TextInput
          className={styles.grow}
          type="password"
          placeholder="https://discord.com/api/webhooks/…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" variant="secondary" loading={saving} disabled={!url.trim()}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

/** "Enviar a canal": pick a server and a text channel; with a webhook the clip is posted directly. */
export function SendToChannelDialog({ clipPath, onClose }: { clipPath: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [guilds, setGuilds] = useState<DiscordGuild[]>([])
  const [guildId, setGuildId] = useState<string | null>(lastChoice.guildId)
  const [channels, setChannels] = useState<DiscordChannel[] | null>(null)
  const [channelId, setChannelId] = useState<string | null>(lastChoice.channelId)
  const [query, setQuery] = useState('')
  const [webhooks, setWebhooks] = useState<WebhookTarget[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Linking the Discord app is optional: it only adds the server/channel picker. */
  const [showAppSetup, setShowAppSetup] = useState(false)

  const connect = async (): Promise<void> => {
    setPhase('connecting')
    setError(null)
    try {
      const status = await api.discord.connect()
      setUserName(status.userName)
      setGuilds(await api.discord.guilds())
      setPhase('ready')
    } catch (reason) {
      setError(ipcErrorMessage(reason))
      const status = await api.discord.status().catch(() => null)
      setPhase(status?.configured ? 'failed' : 'setup')
    }
  }

  useEffect(() => {
    void api.discord.webhooks().then(setWebhooks, () => undefined)
    void api.discord
      .status()
      .then((status) => (status.configured ? connect() : setPhase('setup')))
      .catch((reason: unknown) => {
        setError(ipcErrorMessage(reason))
        setPhase('setup')
      })
  }, [])

  useEffect(() => {
    if (phase !== 'ready' || !guildId) return
    let cancelled = false
    setChannels(null)
    api.discord
      .textChannels(guildId)
      .then((list) => {
        if (cancelled) return
        setChannels(list)
        setChannelId((current) => (list.some((channel) => channel.id === current) ? current : (list[0]?.id ?? null)))
      })
      .catch((reason: unknown) => !cancelled && setError(ipcErrorMessage(reason)))
    return () => {
      cancelled = true
    }
  }, [phase, guildId])

  const visibleGuilds = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? guilds.filter((guild) => guild.name.toLowerCase().includes(needle)) : guilds
  }, [guilds, query])
  const guild = guilds.find((item) => item.id === guildId) ?? null
  const channel = channels?.find((item) => item.id === channelId) ?? null
  const direct = new Set(webhooks.map((target) => target.channelId))

  const remember = (target: { guildId: string; channelId: string }): void => {
    lastChoice.guildId = target.guildId
    lastChoice.channelId = target.channelId
  }

  const save = async (clientId: string, clientSecret: string): Promise<void> => {
    setError(null)
    try {
      await api.discord.configure(clientId, clientSecret)
      await connect()
    } catch (reason) {
      setError(ipcErrorMessage(reason))
    }
  }

  const send = async (target: WebhookTarget): Promise<void> => {
    setBusyId(target.channelId)
    setError(null)
    try {
      await api.discord.sendClip(target.channelId, clipPath)
      remember(target)
      useUiStore.getState().showToast({ text: `Enviado a #${target.channelName} en ${target.guildName}.`, tone: 'success' })
      onClose()
    } catch (reason) {
      setError(ipcErrorMessage(reason))
      setBusyId(null)
      void api.discord.webhooks().then(setWebhooks, () => undefined)
    }
  }

  const addByUrl = async (url: string, label: string): Promise<void> => {
    setError(null)
    try {
      setWebhooks(await api.discord.addWebhookUrl(url, label))
    } catch (reason) {
      setError(ipcErrorMessage(reason))
      throw reason
    }
  }

  const removeWebhook = async (target: WebhookTarget): Promise<void> => {
    setWebhooks(await api.discord.removeWebhook(target.channelId))
  }

  const addWebhook = async (url: string): Promise<void> => {
    if (!guild || !channel) return
    setError(null)
    try {
      setWebhooks(await api.discord.addWebhook({ guildId: guild.id, guildName: guild.name, channelId: channel.id, channelName: channel.name }, url))
    } catch (reason) {
      setError(ipcErrorMessage(reason))
    }
  }

  const openAndPaste = async (): Promise<void> => {
    if (!guildId || !channel) return
    setBusyId(channel.id)
    try {
      await api.discord.openChannel(guildId, channel.id, clipPath)
      remember({ guildId, channelId: channel.id })
      useUiStore.getState().showToast({ text: `Clip copiado y #${channel.name} abierto en Discord: pegalo con Ctrl+V y Enter.`, tone: 'success', durationMs: 7000 })
      onClose()
    } catch (reason) {
      setError(ipcErrorMessage(reason))
      setBusyId(null)
    }
  }

  const forget = async (): Promise<void> => {
    await api.discord.forget()
    setGuilds([])
    setChannels(null)
    setUserName(null)
    setPhase('setup')
  }

  const selectedTarget: WebhookTarget | null =
    guild && channel && direct.has(channel.id) ? { guildId: guild.id, guildName: guild.name, channelId: channel.id, channelName: channel.name } : null

  return (
    <Dialog title="Enviar a un canal de Discord" onClose={onClose}>
      <div className={styles.body}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {webhooks.length > 0 ? (
          <DirectList targets={webhooks} busyId={busyId} onSend={(target) => void send(target)} onRemove={(target) => void removeWebhook(target)} />
        ) : null}

        {phase !== 'ready' ? (
          <>
            <section className={styles.direct}>
              <span className={styles.columnTitle}>
                <Zap size={13} /> {webhooks.length > 0 ? 'Agregar otro canal' : 'Envío directo a un canal'}
              </span>
              <AddWebhookForm onAdd={addByUrl} />
            </section>

            <button type="button" className={styles.disclosure} aria-expanded={showAppSetup || phase === 'connecting' || phase === 'failed'} onClick={() => setShowAppSetup(!showAppSetup)}>
              <ChevronDown size={14} />
              Opcional: conectar la app de Discord para elegir los canales de tu lista
            </button>
          </>
        ) : null}

        {phase === 'loading' || phase === 'connecting' ? (
          <p className={styles.waiting}>
            <LoaderCircle size={16} className={styles.spin} />
            {phase === 'connecting' ? 'Conectando con Discord… si es la primera vez, aprobá Clipea2 en la ventana de Discord.' : 'Buscando Discord…'}
          </p>
        ) : null}

        {phase === 'setup' && showAppSetup ? <SetupForm onSave={(id, secret) => void save(id, secret)} /> : null}

        {phase === 'failed' ? (
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => void connect()}>
              Reintentar
            </Button>
            <Button variant="ghost" onClick={() => void forget()}>
              Cambiar credenciales
            </Button>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <>
            <p className={styles.account}>
              Conectado como <strong>{userName}</strong>
              <button type="button" className={styles.link} onClick={() => void forget()}>
                Desconectar
              </button>
            </p>
            <div className={styles.columns}>
              <div className={styles.column}>
                <span className={styles.columnTitle}>Servidor</span>
                <label className={styles.search}>
                  <Search size={13} />
                  <input placeholder="Buscar servidor" value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <ul className={styles.list} role="listbox" aria-label="Servidores">
                  {visibleGuilds.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.id === guildId}
                        className={cx(styles.item, item.id === guildId && styles.selected)}
                        onClick={() => setGuildId(item.id)}
                      >
                        <span className={styles.avatar}>{item.name.slice(0, 1).toUpperCase()}</span>
                        <span className={styles.name}>{item.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.column}>
                <span className={styles.columnTitle}>Canal de texto</span>
                <ul className={styles.list} role="listbox" aria-label="Canales de texto">
                  {!guildId ? <li className={styles.empty}>Elegí un servidor</li> : null}
                  {guildId && channels === null ? <li className={styles.empty}>Cargando canales…</li> : null}
                  {channels?.length === 0 ? <li className={styles.empty}>Sin canales de texto</li> : null}
                  {channels?.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.id === channelId}
                        className={cx(styles.item, item.id === channelId && styles.selected)}
                        onClick={() => setChannelId(item.id)}
                      >
                        {item.type === 5 ? <Megaphone size={14} /> : <Hash size={14} />}
                        <span className={styles.name}>{item.name}</span>
                        {direct.has(item.id) ? <Zap size={13} className={styles.directMark} aria-label="Envío directo" /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {selectedTarget ? (
              <div className={styles.actions}>
                <Button variant="primary" block icon={<Send size={15} />} loading={busyId === selectedTarget.channelId} onClick={() => void send(selectedTarget)}>
                  Enviar a #{selectedTarget.channelName}
                </Button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => void api.discord.removeWebhook(selectedTarget.channelId).then(setWebhooks)}
                >
                  Quitar envío directo
                </button>
              </div>
            ) : channel ? (
              <>
                <WebhookForm key={channel.id} channelName={channel.name} onSave={addWebhook} />
                <Button variant="ghost" block icon={<ClipboardPaste size={15} />} loading={busyId === channel.id} onClick={() => void openAndPaste()}>
                  Sin webhook: abrir #{channel.name} y pegar con Ctrl+V
                </Button>
              </>
            ) : (
              <Button variant="primary" block disabled>
                Elegí un canal
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
