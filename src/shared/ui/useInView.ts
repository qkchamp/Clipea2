import { useCallback, useRef, useState, type RefCallback } from 'react'

interface SharedObserver {
  observer: IntersectionObserver
  onVisible: Map<Element, () => void>
}

/**
 * One observer per margin for every row of every list: the browser checks hundreds of waiting rows
 * on each repaint, and one observer does it in a single pass instead of one pass per row.
 */
const shared = new Map<string, SharedObserver>()

function observe(node: Element, rootMargin: string, onVisible: () => void): () => void {
  let entry = shared.get(rootMargin)
  if (!entry) {
    const callbacks = new Map<Element, () => void>()
    const observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          if (!change.isIntersecting) continue
          const callback = callbacks.get(change.target)
          callbacks.delete(change.target)
          observer.unobserve(change.target)
          callback?.()
        }
      },
      { rootMargin }
    )
    entry = { observer, onVisible: callbacks }
    shared.set(rootMargin, entry)
  }
  const { observer, onVisible: callbacks } = entry
  callbacks.set(node, onVisible)
  observer.observe(node)
  return () => {
    if (!callbacks.delete(node)) return
    observer.unobserve(node)
  }
}

/** Becomes true the first time the element gets near the viewport (and stays true). */
export function useInView<T extends Element>(rootMargin = '200px'): [RefCallback<T>, boolean] {
  const [visible, setVisible] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)

  const ref = useCallback(
    (node: T | null) => {
      stopRef.current?.()
      stopRef.current = null
      if (!node || visible) return
      stopRef.current = observe(node, rootMargin, () => setVisible(true))
    },
    [visible, rootMargin]
  )

  return [ref, visible]
}
