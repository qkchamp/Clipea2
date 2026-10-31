import { useEffect, useState } from 'react'
import { Pencil, Plus, Send, X, Zap } from 'lucide-react'
import { api } from '@shared/ui/api'
import { Button, IconButton, TextInput } from '@shared/ui/atoms'
import { Field } from '@shared/ui/molecules'
import { Dialog } from '@shared/ui/organisms/Dialog'
import { ipcErrorMessage } from '@shared/ui/ipcError'
import { useUiStore } from '@shared/ui/uiStore'
import { useT } from '@shared/ui/useT'
import { getT } from '@shared/i18n'
import type { WebhookTarget } from '../domain/discordTargets'
import styles from './discord.module.css'

const targetLabel = (target: WebhookTarget): string =>
  target.channelName ? `${target.guildName} › #${target.channelName}` : target.guildName

/** Fixes a saved channel: the URL of a new webhook when the old one broke, or another name in the list. */
function EditWebhookForm({
  target,
  onSave,
  onCancel
}: {
  target: WebhookTarget
  onSave: (url: string, label: string) => Promise<void>
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState(() => targetLabel(target))
  const [saving, setSaving] = useState(false)
  const t = useT()
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        void onSave(url, label).finally(() => setSaving(false))
      }}
    >
      <div className={styles.fields}>
        <Field label={t.discord.newUrl} hint={t.discord.keepUrl}>
          <TextInput
            type="password"
            autoFocus
            placeholder="https://discord.com/api/webhooks/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
        <Field label={t.discord.listName}>
          <TextInput value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
      </div>
      <div className={styles.fields}>
        <Button onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" variant="primary" loading={saving}>
          {t.common.save}
        </Button>
      </div>
    </form>
  )
}

/** Channels that send directly through their webhook: no Discord app needed, works with it closed. */
function DirectList({
  targets,
  busyId,
  editingId,
  onSend,
  onEdit,
  onSave,
  onCancel,
  onRemove
}: {
  targets: WebhookTarget[]
  busyId: string | null
  editingId: string | null
  onSend: (target: WebhookTarget) => void
  onEdit: (target: WebhookTarget) => void
  onSave: (target: WebhookTarget, url: string, label: string) => Promise<void>
  onCancel: () => void
  onRemove: (target: WebhookTarget) => void
}) {
  const t = useT()
  return (
    <ul className={styles.directList}>
      {targets.map((target) =>
        target.channelId === editingId ? (
          <li key={target.channelId} className={styles.direct}>
            <span className={styles.columnTitle}>
              <Pencil size={14} /> {t.discord.editChannel}
            </span>
            <EditWebhookForm target={target} onSave={(url, label) => onSave(target, url, label)} onCancel={onCancel} />
          </li>
        ) : (
          <li key={target.channelId} className={styles.directItem}>
            <Zap size={14} className={styles.directMark} />
            <span className={styles.name}>{targetLabel(target)}</span>
            <Button size="sm" variant="primary" icon={<Send size={14} />} loading={busyId === target.channelId} onClick={() => onSend(target)}>
              {t.discord.send}
            </Button>
            <Button size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(target)}>
              {t.common.edit}
            </Button>
            <IconButton small label={t.discord.removeNamed(targetLabel(target))} onClick={() => onRemove(target)}>
              <X size={14} />
            </IconButton>
          </li>
        )
      )}
    </ul>
  )
}

/** Add a channel by pasting its webhook URL: the only setup sending needs. */
function AddWebhookForm({ onAdd }: { onAdd: (url: string, label: string) => Promise<void> }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const t = useT()
  return (
    <form
      className={styles.form}
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
        {t.discord.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className={styles.fields}>
        <Field label={t.discord.url}>
          <TextInput type="password" placeholder="https://discord.com/api/webhooks/…" value={url} onChange={(event) => setUrl(event.target.value)} />
        </Field>
        <Field label={t.discord.listNameOptional}>
          <TextInput placeholder={t.discord.listNamePlaceholder} value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" icon={<Plus size={16} />} loading={saving} disabled={!url.trim()}>
        {t.discord.add}
      </Button>
    </form>
  )
}

/** "Enviar a canal": the clip goes straight to a channel through its webhook; a new channel is one pasted URL away. */
export function SendToChannelDialog({ clipPath, onClose }: { clipPath: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [webhooks, setWebhooks] = useState<WebhookTarget[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    void api.discord.webhooks().then(setWebhooks, () => undefined)
  }, [])

  const send = async (target: WebhookTarget): Promise<void> => {
    setBusyId(target.channelId)
    setError(null)
    try {
      await api.discord.sendClip(target.channelId, clipPath)
      useUiStore.getState().showToast({ text: getT().discord.sent(targetLabel(target)), tone: 'success' })
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

  const editWebhook = async (target: WebhookTarget, url: string, label: string): Promise<void> => {
    setError(null)
    try {
      setWebhooks(await api.discord.editWebhook(target.channelId, url, label))
      setEditingId(null)
    } catch (reason) {
      setError(ipcErrorMessage(reason))
    }
  }

  const removeWebhook = async (target: WebhookTarget): Promise<void> => {
    setWebhooks(await api.discord.removeWebhook(target.channelId))
  }

  return (
    <Dialog title={t.discord.title} onClose={onClose}>
      <div className={styles.body}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {webhooks.length > 0 ? (
          <DirectList
            targets={webhooks}
            busyId={busyId}
            editingId={editingId}
            onSend={(target) => void send(target)}
            onEdit={(target) => setEditingId(target.channelId)}
            onSave={editWebhook}
            onCancel={() => setEditingId(null)}
            onRemove={(target) => void removeWebhook(target)}
          />
        ) : null}

        <section className={styles.direct}>
          <span className={styles.columnTitle}>
            <Zap size={14} /> {webhooks.length > 0 ? t.discord.addAnother : t.discord.direct}
          </span>
          <AddWebhookForm onAdd={addByUrl} />
        </section>
      </div>
    </Dialog>
  )
}
