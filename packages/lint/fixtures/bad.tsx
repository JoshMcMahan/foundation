// Each line marked `expect` must get exactly one diagnostic.
declare const toast: ((m: string) => void) & {
  error: (m: string) => void
  success: (m: string) => void
  info: (m: string) => void
}
declare const name: string
declare const Field: (p: { label?: string; description?: string }) => null

export function Bad() {
  toast.success('Saved the cluster') // expect
  toast.error(`Couldn't save ${name}`) // expect
  toast('Copied') // expect
  return (
    <div title='Cluster details'> {/* expect */}
      {'Hello there' /* expect */}
      {`Welcome ${name}` /* expect */}
      <input placeholder='Search clusters' /> {/* expect */}
      <img alt='Company logo' src='/logo.png' /> {/* expect */}
      <button type='button' aria-label='Close dialog' /> {/* expect */}
      <Field label='Display name' /> {/* expect */}
      <Field description={'Shown to everyone'} /> {/* expect */}
    </div>
  )
}
