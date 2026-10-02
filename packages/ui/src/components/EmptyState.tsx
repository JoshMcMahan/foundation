import type React from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}

export default function EmptyState({ title, description, action, icon: Icon }: EmptyStateProps) {
  return (
    <div className="border-solid rounded-2xl border border-(--theme-border) theme-panel flex flex-col items-center justify-center py-12 px-6">
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-(--theme-muted-panel-bg) flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 theme-muted-text" />
        </div>
      )}
      <p className="text-sm font-medium mb-1">{title}</p>
      {description && (
        <p className="text-xs theme-muted-text text-center max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
