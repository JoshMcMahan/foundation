import { useEffect, useRef, useState } from 'react'
import type { TreeNode } from '../lib/types'
import { loadPreviewUrl, peekPreviewUrl } from './previewCache'

interface PresignedUrlState {
  url: string | null
  loading: boolean
  error: string | null
}

function toState(
  [url, error]: [string | null, Error | null],
  linkErrorMessage: string,
): PresignedUrlState {
  if (error || !url) {
    return {
      url: null,
      loading: false,
      error: error?.message ?? linkErrorMessage,
    }
  }
  return { url, loading: false, error: null }
}

/** Fetch a presigned URL per file, cached so repeated mounts share one request; callbacks come from refs so the effect keys only on file identity. */
export function usePresignedUrl(
  node: TreeNode | null,
  getPresignedUrl: (node: TreeNode) => Promise<[string | null, Error | null]>,
  { enabled, linkErrorMessage }: { enabled: boolean; linkErrorMessage: string },
): PresignedUrlState {
  const path = enabled ? (node?.path ?? null) : null
  const [state, setState] = useState<PresignedUrlState>({
    url: null,
    loading: false,
    error: null,
  })
  // Drop the previous file's state the moment `path` changes so the fallback
  // below never hands a stale URL to the content hooks, which would cache it
  // under the new path and pin the wrong file's contents there.
  const [statePath, setStatePath] = useState(path)
  if (statePath !== path) {
    setStatePath(path)
    setState({ url: null, loading: path !== null, error: null })
  }

  const getUrlRef = useRef(getPresignedUrl)
  getUrlRef.current = getPresignedUrl
  const linkErrorRef = useRef(linkErrorMessage)
  linkErrorRef.current = linkErrorMessage
  // Keyed on path, not node identity: a background tree rebuild yields a fresh
  // node object for the same file, and refetching then would re-download the
  // already-open preview. The node is read from a ref to keep it out of the deps.
  const nodeRef = useRef(node)
  nodeRef.current = node

  useEffect(() => {
    const node = nodeRef.current
    if (!path || !node) {
      setState({ url: null, loading: false, error: null })
      return
    }
    let cancelled = false
    const record = loadPreviewUrl(path, () => getUrlRef.current(node))
    setState(
      record.value
        ? toState(record.value, linkErrorRef.current)
        : { url: null, loading: true, error: null },
    )
    record.promise
      .then((result) => {
        if (!cancelled) {
          setState(toState(result, linkErrorRef.current))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            url: null,
            loading: false,
            error: err instanceof Error ? err.message : linkErrorRef.current,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const cached = path ? peekPreviewUrl(path) : undefined
  return cached ? toState(cached, linkErrorRef.current) : state
}
