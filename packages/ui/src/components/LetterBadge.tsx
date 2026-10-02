import cx from 'classnames'

/** A compact letter badge ("AI", "PUB", "SSH") used as a type mark in place of
 * an icon. Size the box and text via className (e.g. "h-5 w-5 text-[8px]"). */
export function LetterBadge({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-[3px] border theme-border font-bold leading-none tracking-tight text-(--theme-app)',
        className,
      )}
    >
      {text}
    </span>
  )
}
