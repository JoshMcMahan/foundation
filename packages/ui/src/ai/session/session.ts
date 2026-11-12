import type { BadgeVariant } from '../../components/StatusBadge'
import type { SessionStatus } from './types'

export function sessionStatusVariant(status: SessionStatus): BadgeVariant {
  switch (status) {
    case 'running':
    case 'live_elsewhere':
      return 'info'
    case 'awaiting_approval':
      return 'warning'
    default:
      return 'muted'
  }
}
