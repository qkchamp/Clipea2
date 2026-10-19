import { useCallback, useRef, useState, type RefCallback } from 'react'

/** Becomes true the first time the element gets near the viewport (and stays true). */
export function useInView<T extends Element>(rootMargin = '200px'): [RefCallback<T>, boolean] {
  const [visible, setVisible] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      if (!node || visible) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return
          setVisible(true)
          observer.disconnect()
        },
        { rootMargin }
      )
      observer.observe(node)
      observerRef.current = observer
    },
    [visible, rootMargin]
  )

  return [ref, visible]
}
