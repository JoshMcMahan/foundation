import cx from 'classnames'
import React, { useCallback } from 'react'
import AnimateHeight from 'react-animate-height'
import { AngleRightIcon } from '../icons'

interface IControlledCollapsiblePanelProps {
  title?:
    | string
    | React.ReactNode
    | ((open: boolean, setOpen: React.Dispatch<React.SetStateAction<boolean>>) => React.ReactNode)
  children: React.ReactNode
  open: boolean | undefined
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  onClick?: (() => void) | undefined
  wrapperElement?: React.ElementType | undefined
  shown?: boolean
  setShown?: (shown: boolean) => void
  customizedButton?: React.ReactNode
  /** Rendered right after the title, outside the toggle button. */
  titleAction?: React.ReactNode
  className?: string | undefined
}

const noop = () => {}
export function ControlledCollapsiblePanel({
  title = '',
  children,
  open,
  setOpen,
  onClick = noop,
  wrapperElement,
  /* Used on the home page to hide the panel */
  customizedButton = null,
  titleAction,
  className,
}: IControlledCollapsiblePanelProps) {
  const toggleOpen = useCallback(() => {
    if (onClick) {
      onClick()
    }
    setOpen?.((open) => !open)
  }, [setOpen, onClick])
  const contentId = React.useId()
  const Wrapper = wrapperElement ? wrapperElement : React.Fragment
  const titleIsReactNode = React.isValidElement(title)

  return titleIsReactNode ? (
    <>
      {title}
      <Wrapper>
        <AnimateHeight duration={300} height={open ? 'auto' : 0}>
          {children}
        </AnimateHeight>
      </Wrapper>
    </>
  ) : (
    <div
      className={cx(
        'border border-solid rounded-2xl border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-panel) mb-1 w-full',
        className,
      )}
    >
      <div
        className={cx(
          !open && 'text-(--theme-muted-text-color)',
          'w-full flex items-center transform ease-in transition text-sm py-3 px-2 cursor-pointer',
        )}
      >
        <button
          type="button"
          aria-expanded={!!open}
          aria-controls={contentId}
          className={cx('flex items-center text-left cursor-pointer', !titleAction && 'w-full')}
          onClick={toggleOpen}
        >
          <AngleRightIcon
            className={cx(
              open && 'transform rotate-90',
              'px-1 ml-1 text-[1.25rem] transition ease-in',
            )}
          />
          <span className="px-2 font-bold select-none">{title?.toString()}</span>
        </button>
        {titleAction}
        <div className="ml-auto">{customizedButton}</div>
      </div>
      <AnimateHeight id={contentId} duration={300} height={open ? 'auto' : 0}>
        {children}
      </AnimateHeight>
    </div>
  )
}

export function UncontrolledCollapsiblePanel({
  title,
  children,
  onClick,
  wrapperElement,
  initialState = true,
  className,
  customizedButton = null,
}: Omit<IControlledCollapsiblePanelProps, 'setOpen' | 'open'> & {
  initialState?: boolean | undefined
}) {
  const [open, setOpen] = React.useState(initialState)
  const passTitle = typeof title === 'function' ? title(open, setOpen) : title

  return (
    <ControlledCollapsiblePanel
      title={passTitle}
      open={open}
      setOpen={setOpen}
      onClick={onClick}
      wrapperElement={wrapperElement}
      className={className}
      customizedButton={customizedButton}
    >
      {children}
    </ControlledCollapsiblePanel>
  )
}

type MaybeCollapsibleProps = {
  className?: string
  initialState?: boolean
  children: React.ReactNode
  title?: React.ReactNode
  customizedButton?: React.ReactNode
  collapsible?: boolean | undefined
}

export function MaybeCollapsible({
  className,
  initialState,
  children,
  title,
  customizedButton,
  collapsible,
}: MaybeCollapsibleProps) {
  if (collapsible) {
    return (
      <UncontrolledCollapsiblePanel
        className={className}
        initialState={initialState}
        title={title}
        customizedButton={customizedButton}
      >
        {children}
      </UncontrolledCollapsiblePanel>
    )
  }

  return <div className={className}>{children}</div>
}
