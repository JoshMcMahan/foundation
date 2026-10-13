import { Collapsible } from '@base-ui/react/collapsible'
import type { ReactNode } from 'react'
import { AngleRightIcon } from '../icons'

/** A titled group of fields. Folding keeps them mounted, so they hold their
 *  values and validation while closed. */
export function FieldGroup({
  title,
  actions,
  collapsible = true,
  defaultOpen = true,
  children,
}: {
  title: ReactNode
  /** Beside the title, outside the toggle, such as the group's info tip. */
  actions?: ReactNode
  collapsible?: boolean | undefined
  defaultOpen?: boolean | undefined
  children: ReactNode
}) {
  if (!collapsible) {
    return (
      <section className="flex w-full flex-col">
        <h3 className="mb-[15px] flex items-center gap-1 text-md font-bold">
          {title}
          {actions}
        </h3>
        {children}
      </section>
    )
  }
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="flex w-full flex-col">
      <div className="mb-2 flex w-full items-center gap-2 border-b border-(--theme-border) pb-1 text-lg font-semibold">
        {/* The editor drags a group by its title; a click still folds it. */}
        <Collapsible.Trigger
          data-field-label
          className="group flex flex-1 cursor-pointer items-center text-left"
        >
          <AngleRightIcon
            aria-hidden="true"
            className="px-1 text-[1.25rem] transition-transform group-data-panel-open:rotate-90"
          />
          {title}
        </Collapsible.Trigger>
        {actions}
      </div>
      <Collapsible.Panel
        keepMounted
        className="h-(--collapsible-panel-height) transition-[height] duration-300 ease-in-out data-starting-style:h-0 data-ending-style:h-0 data-starting-style:overflow-hidden data-ending-style:overflow-hidden"
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
