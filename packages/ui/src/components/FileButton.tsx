import { type ButtonHTMLAttributes, type ReactNode, useRef } from 'react'
import { Button } from './Button'
import type { ButtonStyle } from './buttonClasses'

export interface FileButtonProps
  extends ButtonStyle,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onChange' | 'children' | 'className'> {
  /** The file types offered, as the file input's `accept`, such as `image/*` or `.pem,.crt`. */
  accept?: string | undefined
  multiple?: boolean | undefined
  /** The files picked, never empty. Picking the same file again calls it again. */
  onFiles: (files: File[]) => void
  /** Before the label. */
  icon?: ReactNode
  /** Busy with the files: see `Button`'s `loading`. */
  loading?: boolean | undefined
  className?: string | undefined
  children?: ReactNode
}

/** A button that opens the file picker, such as Upload logo. It is a real button,
 *  so Tab reaches it and Enter or Space opens the picker, where a label over a
 *  hidden file input can't be focused. */
export function FileButton({
  accept,
  multiple = false,
  onFiles,
  onClick,
  ...props
}: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        {...props}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            input.current?.click()
          }
        }}
      />
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          // Cleared, so the same file picked again is a change too.
          event.currentTarget.value = ''
          if (files.length > 0) {
            onFiles(files)
          }
        }}
      />
    </>
  )
}
