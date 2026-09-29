declare const toast: ((m: string) => void) & { error: (m: string) => void }
declare const setError: (m: string) => void
declare const errorMessage: (e: unknown) => string
declare const err: Error
declare const t: (k: string) => string

export function Good() {
  toast.error(errorMessage(err))
  setError('loadFailed')
  setError('')
  setError(t('saveFailed'))
  console.error(err.message)
  return <p>{errorMessage(err)}</p>
}
