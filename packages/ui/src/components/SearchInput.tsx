import type { InputHTMLAttributes, Ref } from 'react'
import { cx } from '../cx'
import { CloseIcon, SearchIcon } from '../icons'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { useStrings } from './Provider'

export interface SearchInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'size' | 'type' | 'className'
  > {
  value: string
  onValueChange: (value: string) => void
  /** Names the box, and is its placeholder unless `placeholder` says otherwise. */
  label?: string | undefined
  /** `sm` for dense places such as toolbars and table cells, `lg` for a form that stands alone,
   *  such as sign-in. */
  size?: FieldBoxSize | undefined
  /** On the wrapper: its width or margin. */
  className?: string | undefined
  ref?: Ref<HTMLInputElement> | undefined
}

/** A box that narrows what is shown as you type, such as a panel's rows or a log's lines.
 *  A clear button empties it, and so does Escape, without closing the dialog it sits in. For
 *  a list page's toolbar, which keeps search terms and opens on ⌘F, use `ListSearchControl`. */
export function SearchInput({
  value,
  onValueChange,
  label,
  placeholder,
  size = 'md',
  className,
  onKeyDown,
  ref,
  ...props
}: SearchInputProps) {
  const { common } = useStrings()
  const name = label ?? common.search
  const small = size === 'sm'
  return (
    <div className={cx('relative flex items-center', className)}>
      <SearchIcon
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute text-(--theme-muted-text-color)',
          small ? 'left-2 size-3' : 'left-2.5 size-3.5',
        )}
      />
      <input
        {...props}
        ref={ref}
        type="search"
        aria-label={name}
        placeholder={placeholder ?? name}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          // Escape empties the box first, and only an empty box lets it close what holds it.
          if (e.key === 'Escape' && value && !e.defaultPrevented) {
            e.stopPropagation()
            onValueChange('')
          }
        }}
        className={cx(
          fieldBox({ size }),
          // The browser's own clear button would sit beside this one.
          '[&::-webkit-search-cancel-button]:appearance-none',
          small ? 'pl-6 pr-6' : 'pl-8 pr-8',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label={common.clearSearch}
          onClick={() => onValueChange('')}
          className="absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded text-(--theme-muted-text-color) hover:text-(--theme-app)"
        >
          <CloseIcon aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  )
}
