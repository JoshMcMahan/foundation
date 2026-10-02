// Each line marked `expect` must get exactly one diagnostic.
declare const toast: ((m: string) => void) & {
  error: (m: string) => void
  success: (m: string) => void
  info: (m: string) => void
}
declare const name: string
declare const open: boolean
declare const t: (k: string) => string
declare const Field: (p: { label?: string; description?: string }) => null

export const columns = [
  { key: 'cpus', label: 'Total CPUs' }, // expect
  { key: 'name', header: `Cluster name` }, // expect
]
export const field = {
  description: 'Use realtime data to calculate the threshold', // expect
  'tooltip': 'Leave empty for none', // expect
}
export const toggle = { label: open ? 'Enabled' : 'Disabled' } // expect

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
      {open ? 'Open now' : 'Closed now' /* expect */}
      {open ? t('open') : 'Closed now' /* expect */}
      {open && 'Shown when open' /* expect */}
      {open ? `${name} items` : name /* expect */}
      {(`Count ${name}`) /* expect */}
      <Field label={open ? 'Yes please' : t('no')} /> {/* expect */}
      <button type='button' aria-description='Opens the dialog' /> {/* expect */}
      <input placeholder={open ? 'Search clusters' : 'localhost'} /> {/* expect */}
    </div>
  )
}
