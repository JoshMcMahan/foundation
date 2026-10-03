export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

export function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC')
}

/** Only org models bill to an allocation; any other model ignores it. */
export function isOrgModel(modelId: string | null | undefined): boolean {
  return modelId?.startsWith('org:') ?? false
}
