import { useState } from 'react'
import { CheckIcon, ClipboardIcon, CopyIcon, HiddenFalseIcon, HiddenTrueIcon } from '../icons'
import { useNotify, useStrings } from './Provider'

interface ICopyToClipboardProps {
  as?: 'div' | 'button'
  text: string
  className?: string
  children?: React.ReactNode
  showIcon?: boolean
}

export default function CopyToClipboard({
  as = 'div',
  text,
  className,
  children,
  showIcon = true,
}: ICopyToClipboardProps) {
  const notify = useNotify()
  const strings = useStrings()
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      notify.info('Copied to clipboard')
    } catch {
      notify.error('Failed to copy to clipboard')
    }
  }

  const Element = as
  return (
    <Element
      className={className}
      onClick={handleCopy}
      {...(as === 'button'
        ? { type: 'button' as const }
        : {
            role: 'button' as const,
            'aria-label': strings.common.copy,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleCopy()
              }
            },
          })}
    >
      {showIcon && <ClipboardIcon />}
      {children}
    </Element>
  )
}

interface CopyCodeBlockProps {
  textToCopy: string
  children: React.ReactNode
  secret?: boolean
  isRevealed?: boolean
  onRevealToggle?: () => void
}

export function CopyCodeBlock({
  textToCopy,
  children,
  secret = false,
  isRevealed = false,
  onRevealToggle,
}: CopyCodeBlockProps) {
  const notify = useNotify()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (copied) {
      return
    }
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      notify.info('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      notify.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className="group relative" role="none" onClick={handleCopy}>
      <pre
        className={`p-4 theme-hover border rounded-lg text-left font-mono text-sm overflow-x-auto ${secret ? 'pr-24' : 'pr-12'}`}
      >
        {children}
      </pre>
      <div className="absolute top-0 right-0 bottom-0 flex items-center gap-1 pl-8 pr-2 bg-gradient-to-l from-[var(--color-panel)] from-70% to-transparent rounded-r-lg">
        {secret && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRevealToggle?.()
            }}
            className="p-2 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150"
            aria-label={isRevealed ? 'Hide secret' : 'Reveal secret'}
            title={isRevealed ? 'Hide secret' : 'Reveal secret'}
          >
            {isRevealed ? <HiddenFalseIcon /> : <HiddenTrueIcon />}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleCopy()
          }}
          className="p-2 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150"
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          {copied ? <CheckIcon className="text-green-400" /> : <CopyIcon />}
        </button>
      </div>
    </div>
  )
}
