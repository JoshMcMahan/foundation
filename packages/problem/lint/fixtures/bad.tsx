// Each line marked `expect` must get exactly one diagnostic.
declare const toast: ((m: string) => void) & { error: (m: string) => void; success: (m: string) => void }
declare const setError: (m: string) => void
declare const setSaveFailure: (m: string) => void
declare const err: Error
declare const result: { error?: { message: string } }

export function Bad() {
  toast.error(err.message) // expect
  toast(err.message) // expect
  toast.error(`Could not save: ${err.message}`) // expect
  toast.success(result.error?.message ?? 'done') // expect
  setError('Something went wrong') // expect
  setSaveFailure(`Could not save`) // expect
  return (
    <div>
      {err.message /* expect */}
      {result.error?.message /* expect */}
      {result.error && <p>{result.error.message /* expect */}</p>}
    </div>
  )
}
