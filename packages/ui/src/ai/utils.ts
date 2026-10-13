export function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC')
}

/** Only org models bill to an allocation; any other model ignores it. */
export function isOrgModel(modelId: string | null | undefined): boolean {
  return modelId?.startsWith('org:') ?? false
}
