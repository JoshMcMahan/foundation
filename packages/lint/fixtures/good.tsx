declare const toast: ((m: string) => void) & {
  success: (m: string) => void
  dismiss: (id: string) => void
}
declare const t: (k: string, v?: Record<string, string>) => string
declare const name: string
declare const Field: (p: { label?: string; className?: string }) => null

export function Good() {
  toast.success(t('saved'))
  toast(t('copied', { name }))
  toast.dismiss('upload-progress')
  return (
    <div className='flex gap-2' data-testid='cluster-card' title={t('details')}>
      {t('hello')}
      {name}
      {' '}
      {'·'}
      {'/'}
      <a href='/clusters/new'>{t('new')}</a>
      <input placeholder='https://example.com' type='url' />
      <input placeholder='localhost' />
      <input placeholder={t('search')} />
      <img alt='' src='/logo.png' />
      <Field label={t('displayName')} className='w-full' />
      <button type='button' aria-label={t('close')} />
      {/* biome-ignore lint/plugin: product name */}
      <img alt='ACTIVATE Platform' src='/logo.png' />
      {/* biome-ignore lint/plugin: product name */}
      {'ACTIVATE Platform'}
    </div>
  )
}
