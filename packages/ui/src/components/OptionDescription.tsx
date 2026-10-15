import type { ComboboxItem } from './comboboxItems'

/** An option's description under its label. An `accessibleDescription` is read in its place,
 *  so the shown one is then hidden from assistive technology rather than read twice. */
export function OptionDescription({
  id,
  item,
}: {
  id: string
  item: Pick<ComboboxItem<unknown>, 'description' | 'accessibleDescription'>
}) {
  const spoken = item.accessibleDescription
  return (
    <>
      {item.description && (
        <span
          id={spoken ? undefined : id}
          aria-hidden={spoken ? true : undefined}
          className="text-xs leading-snug text-(--theme-muted-text-color)"
        >
          {item.description}
        </span>
      )}
      {spoken && (
        <span id={id} hidden>
          {spoken}
        </span>
      )}
    </>
  )
}
