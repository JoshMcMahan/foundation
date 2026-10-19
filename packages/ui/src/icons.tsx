// The one import point for interface icons. Logos of other companies' products
// are in './brandIcons'.
import type { ReactNode, SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  /** Width and height; the text's size by default. */
  size?: string | number | undefined
  /** Names the icon for assistive technology. Without it, or an `aria-label`,
   *  the icon is decoration and hidden from assistive technology. */
  title?: string | undefined
}

/** An icon from this module or the brand icons. */
export type IconType = (props: IconProps) => ReactNode

// Every glyph is drawn for this module on a 16px grid, with fewer and simpler
// shapes than a 24px set so they stay crisp at the 16px they're mostly shown at.
const STROKE_WIDTH = 1.5

/** A glyph drawn as one path on the 16px grid, in the text's size and color by
 *  default, so a class such as `size-4` or a parent's font size sets it. */
function drawn(d: string, defaults?: IconProps): IconType {
  function Icon({
    title,
    children,
    size = '1em',
    color = 'currentColor',
    strokeWidth = STROKE_WIDTH,
    ...props
  }: IconProps) {
    const named = Boolean(title || props['aria-label'] || props['aria-labelledby'])
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: hidden from assistive technology unless a title or label names it
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...defaults}
        {...(named ? { role: 'img' } : { 'aria-hidden': true })}
        {...props}
      >
        {title && <title>{title}</title>}
        <path d={d} />
        {children}
      </svg>
    )
  }
  return Icon
}

// A filled glyph marks a state its outline doesn't have, such as pinned.
const filled: IconProps = { fill: 'currentColor' }

export const AccessIcon = /* @__PURE__ */ drawn(
  'M6.5 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 13.5c.5-2.2 2.3-3.5 4.5-3.5M10 11h4v3h-4ZM11 11V9.75a1 1 0 0 1 2 0V11',
)
export const AddAllocationIcon = /* @__PURE__ */ drawn(
  'M2.5 4v8a1.5 1.5 0 0 0 1.5 1.5h4.75M13.5 8.75V6.5a1 1 0 0 0-1-1H4A1.5 1.5 0 0 1 2.5 4 1.5 1.5 0 0 1 4 2.5h7v3M12.25 10.25v4M10.25 12.25h4',
)
export const AddIcon = /* @__PURE__ */ drawn('M8 3v10M3 8h10')
export const AddProjectIcon = /* @__PURE__ */ drawn(
  'M14 8.75V6A1.5 1.5 0 0 0 12.5 4.5H7.6L6.1 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13h5.25M12.25 10.25v4M10.25 12.25h4',
)
export const AddUserIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M12.25 10.25v4M10.25 12.25h4',
)
export const AgentIcon = /* @__PURE__ */ drawn(
  'M3.5 5.5h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM8 5.5v-3H6M6 8.75V10M10 8.75V10',
)
export const AiProviderIcon = /* @__PURE__ */ drawn(
  'M4.25 4.5 1.75 8l2.5 3.5M11.75 4.5 14.25 8l-2.5 3.5M8 5.25c0.275 1.98 0.77 2.475 2.75 2.75-1.98 0.275-2.475 0.77-2.75 2.75-0.275-1.98-0.77-2.475-2.75-2.75 1.98-0.275 2.475-0.77 2.75-2.75Z',
)
export const AllocationIcon = /* @__PURE__ */ drawn(
  'M4.75 3.75h6.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1ZM6.25 1.75v2M9.75 1.75v2M6.25 12.25v2M9.75 12.25v2M1.75 6.25h2M1.75 9.75h2M12.25 6.25h2M12.25 9.75h2M8 5.75V8l1.5 1',
)
export const APIIcon = /* @__PURE__ */ drawn(
  'M4.25 2.5H3.75a1 1 0 0 0-1 1v3.25L1.75 8l1 1.25v3.25a1 1 0 0 0 1 1h.5M11.75 2.5h.5a1 1 0 0 1 1 1v3.25l1 1.25-1 1.25v3.25a1 1 0 0 1-1 1h-.5M6 6h4M8.75 4.75 10 6 8.75 7.25M10 10H6M7.25 8.75 6 10l1.25 1.25',
)
export const ArchiveIcon = /* @__PURE__ */ drawn(
  'M3 2.25h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1ZM3 5.25v7.25a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.25M6.75 8.5h2.5',
)
export const ArrowDownIcon = /* @__PURE__ */ drawn('M8 2.75v10.5M3.75 9 8 13.25 12.25 9')
export const ArrowLeftIcon = /* @__PURE__ */ drawn('M13.25 8H2.75M7 3.75 2.75 8 7 12.25')
export const ArrowRightIcon = /* @__PURE__ */ drawn('M2.75 8h10.5M9 3.75 13.25 8 9 12.25')
export const ArrowUpIcon = /* @__PURE__ */ drawn('M8 13.25V2.75M3.75 7 8 2.75 12.25 7')
export const ArticleIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5c2-.75 3.75-.75 5.5.5 1.75-1.25 3.5-1.25 5.5-.5v9c-2-.75-3.75-.75-5.5.5-1.75-1.25-3.5-1.25-5.5-.5ZM8 4v9M4.5 6.75h1.5M4.5 9.5h1.5M10 6.75h1.5M10 9.5h1.5',
)
export const AttachmentIcon = /* @__PURE__ */ drawn(
  'M13 7.5 8.1 12.4a3.25 3.25 0 0 1-4.6-4.6l5.3-5.3a2.1 2.1 0 0 1 3 3L6.5 10.8a1 1 0 0 1-1.4-1.4L10 4.5',
)
export const AuthenticationIcon = /* @__PURE__ */ drawn(
  'M2.75 11.5c-.15-.85-.25-1.75-.25-2.75a5.5 5.5 0 0 1 10.6-2M13.5 9.25c0 1.6-.15 3.1-.5 4.5M5.25 12.5c.15-1.25.25-2.4.25-3.75a2.5 2.5 0 0 1 5 0c0 2-.25 3.9-.75 5.5M8 8.75c0 2-.3 3.75-.9 5.5',
)
export const BannerIcon = /* @__PURE__ */ drawn(
  'M3.25 2h9.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM2.25 6.75h11.5M5 4.4h6M5.75 10.5h4.5M8.75 9l1.5 1.5-1.5 1.5',
)
export const BillingIcon = /* @__PURE__ */ drawn(
  'M3.5 3.5h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1ZM2.5 6.5h11M4.75 10h2',
)
export const BranchIcon = /* @__PURE__ */ drawn(
  'M4.5 5.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.5 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM11.5 6.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.5 5.75v4.5M11.5 6.75c0 2.75-7 1-7 3.5',
)
export const BriefcaseIcon = /* @__PURE__ */ drawn(
  'M3 5h10a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM10.25 13.75V3.25a1 1 0 0 0-1-1h-2.5a1 1 0 0 0-1 1v10.5',
)
export const BucketIcon = /* @__PURE__ */ drawn(
  'M2.5 4a5.5 1.75 0 1 0 11 0 5.5 1.75 0 1 0-11 0ZM2.5 4l1.4 8.6c.15.95 1.9 1.65 4.1 1.65s3.95-.7 4.1-1.65L13.5 4M3.2 8.5c1.3.55 2.95.85 4.8.85s3.5-.3 4.8-.85',
)
export const BuildWorkflowIcon = /* @__PURE__ */ drawn(
  'M3 2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM11.25 2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM6 4h4.25M12.25 6v2.5M10.25 14.25l.5-1.75 2.25-2.25a.88.88 0 0 1 1.25 1.25L12 13.75Z',
)
export const CalendarIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5h11v10h-11ZM2.5 6.5h11M5.5 2v2.5M10.5 2v2.5',
)
export const CancelIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.25 6.25h3.5v3.5h-3.5Z',
)
export const CelebrateIcon = /* @__PURE__ */ drawn(
  'M4.75 6.75 2 14l7.25-2.75M4.75 6.75c1.5.25 4.1 2.75 4.5 4.5M9.5 6.5c.5-1.5 1.5-1.25 2-2.5s1.25-1.5 2.25-1.75M11 9.75c1-.75 2-.75 3.25-.5M6.75 4.75c.5-.75.5-1.75.25-2.75M3 3h.01M14 6.5h.01M10 2h.01M13.75 12.75h.01',
)
export const CertificateIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M6.5 11.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 10.25h2.5M9.75 10.25v1.25',
)
export const ChangesRequestedIcon = /* @__PURE__ */ drawn(
  'M3.5 2.75h9a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H6.5l-3 2.25v-2.25a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1ZM8 4.75v2.5M8 9.25h.01',
)
export const ChartIcon = /* @__PURE__ */ drawn(
  'M2.5 2.5v10a1 1 0 0 0 1 1h10M5.5 10 8 7.5l2 2 3.5-3.5',
)
export const ChatIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5.5l-3 2.25ZM10.5 5.5h2a1 1 0 0 1 1 1v6.75l-3-2.25h-4a1 1 0 0 1-1-1v-1.5',
)
export const CheckIcon = /* @__PURE__ */ drawn('M3.5 8.5 6.5 11.5 12.5 4.5')
export const ChevronDoubleDownIcon = /* @__PURE__ */ drawn(
  'M4.5 3.75 8 7.25l3.5-3.5M4.5 8.75 8 12.25l3.5-3.5',
)
export const ChevronDoubleUpIcon = /* @__PURE__ */ drawn(
  'M4.5 7.25 8 3.75l3.5 3.5M4.5 12.25 8 8.75l3.5 3.5',
)
export const ChevronDownIcon = /* @__PURE__ */ drawn('M3.5 6 8 10.5 12.5 6')
export const ChevronLeftIcon = /* @__PURE__ */ drawn('M10 3.5 5.5 8 10 12.5')
export const ChevronRightIcon = /* @__PURE__ */ drawn('M6 3.5 10.5 8 6 12.5')
export const ChevronUpIcon = /* @__PURE__ */ drawn('M3.5 10 8 5.5l4.5 4.5')
export const ClipboardCheckIcon = /* @__PURE__ */ drawn(
  'M10.5 3h1.5a1 1 0 0 1 1 1v9.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1.5M6 1.75h4a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-1.5a.5.5 0 0 1 .5-.5ZM5.75 9.25l1.5 1.5 3-3.25',
)
export const ClockIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 4.75V8l2.25 1.5',
)
export const CloseIcon = /* @__PURE__ */ drawn('M4 4l8 8M12 4l-8 8')
export const CloudIcon = /* @__PURE__ */ drawn(
  'M11.5 12.5H6a4.25 4.25 0 1 1 4.1-5.5h1.4a2.75 2.75 0 1 1 0 5.5Z',
)
export const CloudNetworkIcon = /* @__PURE__ */ drawn(
  'M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM8 4.75a1 1 0 1 0 0 2a1 1 0 1 0 0-2ZM5.25 9.25a1 1 0 1 0 0 2a1 1 0 1 0 0-2ZM10.75 9.25a1 1 0 1 0 0 2a1 1 0 1 0 0-2ZM7.4 6.65 5.9 9.35M8.6 6.65l1.5 2.7M6.25 10.25h3.5',
)
export const ClusterIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1ZM3.5 9h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 4.75h.01M5 11.25h.01',
)
export const CodeIcon = /* @__PURE__ */ drawn('M10.25 4 14.25 8l-4 4M5.75 4 1.75 8l4 4')
export const CollapseIcon = /* @__PURE__ */ drawn(
  'M4.5 2.25 8 5.75l3.5-3.5M4.5 13.75 8 10.25l3.5 3.5',
)
export const ColumnsIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM6.25 2.5v11M9.75 2.5v11',
)
export const CommandShellIcon = /* @__PURE__ */ drawn(
  'M4.75 2.75h8.25a.75.75 0 0 1 .73.9l-1.7 8.5a1 1 0 0 1-.98.85H2.8a.75.75 0 0 1-.73-.9l1.7-8.5a1 1 0 0 1 .98-.85ZM6.25 5.75 8.25 8l-2.75 2.25M8.5 10.25h2',
)
export const CommentIcon = /* @__PURE__ */ drawn(
  'M3.5 2.75h9a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H6.5l-3 2.25v-2.25a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z',
)
export const CommitIcon = /* @__PURE__ */ drawn(
  'M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.75 8h3.75M10.5 8h3.75',
)
export const ComputeIcon = /* @__PURE__ */ drawn(
  'M5 4h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM6.5 6.5h3v3h-3ZM6.5 1.75V4M9.5 1.75V4M6.5 12v2.25M9.5 12v2.25M1.75 6.5H4M1.75 9.5H4M12 6.5h2.25M12 9.5h2.25',
)
export const ConfigIcon = /* @__PURE__ */ drawn(
  'M3 3h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM4.75 6.25h1M8 6.25h3.25M4.75 9.75h1M8 9.75h2.25',
)
export const ConnectIcon = /* @__PURE__ */ drawn(
  'M5.5 2v3M10.5 2v3M3.5 5h9v2.5a4.5 4.5 0 0 1-9 0ZM8 12v2',
)
export const ContractIcon = /* @__PURE__ */ drawn(
  'M12.5 6.25V4.75L9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h2.25M9.5 1.75v3h3M5.5 11h1.5M8.25 14.25l.5-2.25 4-4a1.06 1.06 0 0 1 1.5 1.5l-4 4Z',
)
export const CopyIcon = /* @__PURE__ */ drawn(
  'M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2',
)
export const CustomizeIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 1 14 8c0 1.5-1.25 2.25-2.5 2.25H10.5a1.5 1.5 0 0 0-1.1 2.5c.6.65.1 1.25-1.4 1.25ZM5 7.4a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2ZM6.25 4.15a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2ZM9.75 4.15a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2Z',
)
export const DefaultIcon = /* @__PURE__ */ drawn('M4.5 2.25h7v11.5L8 11.25l-3.5 2.5Z')
export const DefinitionIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M5.75 7.25h2.5M7.75 9.75h2.5M7.75 12.25h1.5',
)
export const DeprovisionIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 4.75h.01M3.5 9h4.25a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-4.25a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 11.25h.01M10.25 12.25h4',
)
export const DesktopIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM5.5 13.5h5M8 10.5v3',
)
export const DestroyIcon = /* @__PURE__ */ drawn(
  'M7 4.25H3.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5l1-2-1.25-1.5ZM9.75 5.75h2.75a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H9.25l.75-2.25-1.5-1.5ZM4.5 7.25h.01',
)
export const DeviceIcon = /* @__PURE__ */ drawn(
  'M9.25 10.5h-6.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V5M4.75 13.5h4M6.75 10.5v3M11.75 6.5h1.5a1 1 0 0 1 1 1v5.25a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z',
)
export const DirectoryIcon = /* @__PURE__ */ drawn(
  'M3 12.5V3.25A1.25 1.25 0 0 1 4.25 2H13v9H4.5a1.5 1.5 0 0 0 0 3H13M8 6.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM5.75 9.25c.4-1.05 1.2-1.6 2.25-1.6s1.85.55 2.25 1.6',
)
export const DirectorySyncIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M10.25 10.75h4l-1.25-1.25M14.25 13.5h-4l1.25 1.25',
)
export const DisableCostIcon = /* @__PURE__ */ drawn(
  'M8.75 12h-6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h10.5a1 1 0 0 1 1 1v4.25M8 9.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.25 7.75h.01M10.75 10.75l3 3M13.75 10.75l-3 3',
)
export const DisableUserIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M10.75 10.75l3 3M13.75 10.75l-3 3',
)
export const DisconnectIcon = /* @__PURE__ */ drawn(
  'M4.25 13.5a1.6 1.6 0 0 0 2.25 0L8 12 4 8 2.5 9.5a1.6 1.6 0 0 0 0 2.25ZM8 4l4 4 1.5-1.5a1.6 1.6 0 0 0 0-2.25L11.75 2.5a1.6 1.6 0 0 0-2.25 0ZM5 9l1.75-1.75M7 11l1.75-1.75M12.5 3.5l1.75-1.75M1.75 14.25l1.75-1.75',
)
export const DiskIcon = /* @__PURE__ */ drawn(
  'M2 8.5 4.1 3.6A1 1 0 0 1 5 3h6a1 1 0 0 1 .9.6L14 8.5V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1ZM2 8.5h12M4.75 10.75h.01M7 10.75h.01',
)
export const DisplayIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM5.5 13.5h5M8 10.5v3M4 4v5M5.1 4v5M6.2 4v5M7.25 4v5M8 2.5v8',
)
export const DownloadIcon = /* @__PURE__ */ drawn(
  'M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
)
export const DragHandleIcon = /* @__PURE__ */ drawn(
  'M4 5.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM8 5.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM12 5.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM4 9.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM8 9.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM12 9.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Z',
)
export const DuplicateIcon = /* @__PURE__ */ drawn(
  'M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M9.5 7.75v3.5M7.75 9.5h3.5',
)
export const EditIcon = /* @__PURE__ */ drawn(
  'M10.5 2.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L6 13l-3.5.75L3.25 10.25ZM9 4l3 3',
)
export const EditorIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM2.5 5.5h11M6.5 7.75 5 9.5l1.5 1.75M9.5 7.75l1.5 1.75-1.5 1.75',
)
export const EducationIcon = /* @__PURE__ */ drawn(
  'M8 3 1.75 6.25 8 9.5l6.25-3.25ZM4.25 7.5V11c0 1.1 1.7 2 3.75 2s3.75-.9 3.75-2V7.5M14.25 6.25V10',
)
export const EnableCostIcon = /* @__PURE__ */ drawn(
  'M8.75 12h-6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h10.5a1 1 0 0 1 1 1v4.25M8 9.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.25 7.75h.01M10.5 12.5l1.25 1.25 2.5-3',
)
export const EnableUserIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M10.5 12.5l1.25 1.25 2.5-3',
)
export const EndpointIcon = /* @__PURE__ */ drawn(
  'M1.75 8h5.5M10.5 4.75a3.25 3.25 0 1 0 0 6.5a3.25 3.25 0 1 0 0-6.5ZM10.5 8h.01',
)
export const ErrorIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 4.75v3.75M8 11h.01',
)
export const EventsIcon = /* @__PURE__ */ drawn(
  'M2.25 4h.01M2.25 8h.01M2.25 12h.01M5.25 4h.01M5.25 8h.01M5.25 12h.01M8.25 4h5.5M8.25 8h5.5M8.25 12h5.5',
)
export const ExpandIcon = /* @__PURE__ */ drawn(
  'M5.5 2.5h-2a1 1 0 0 0-1 1v2M13.5 5.5v-2a1 1 0 0 0-1-1h-2M2.5 10.5v2a1 1 0 0 0 1 1h2M10.5 13.5h2a1 1 0 0 0 1-1v-2',
)
export const ExpandVerticalIcon = /* @__PURE__ */ drawn(
  'M4.5 6.25 8 2.75l3.5 3.5M4.5 9.75 8 13.25l3.5-3.5',
)
export const ExpiredIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5h11v10h-11ZM2.5 6.5h11M5.5 2v2.5M10.5 2v2.5M6.5 8.5l3 3M9.5 8.5l-3 3',
)
export const ExpiringIcon = /* @__PURE__ */ drawn(
  'M3.5 1.75h9M3.5 14.25h9M4.75 1.75v2.5a1.5 1.5 0 0 0 .45 1.05L8 8l2.8-2.7a1.5 1.5 0 0 0 .45-1.05v-2.5M4.75 14.25v-2.5a1.5 1.5 0 0 1 .45-1.05L8 8l2.8 2.7a1.5 1.5 0 0 1 .45 1.05v2.5',
)
export const ExpressionIcon = /* @__PURE__ */ drawn(
  'M5.75 2.5H5a1.25 1.25 0 0 0-1.25 1.25V6.5A1.5 1.5 0 0 1 2.25 8a1.5 1.5 0 0 1 1.5 1.5v2.75A1.25 1.25 0 0 0 5 13.5h.75M10.25 2.5H11a1.25 1.25 0 0 1 1.25 1.25V6.5A1.5 1.5 0 0 0 13.75 8a1.5 1.5 0 0 0-1.5 1.5v2.75A1.25 1.25 0 0 1 11 13.5h-.75',
)
export const ExternalLinkIcon = /* @__PURE__ */ drawn(
  'M9.5 2.5h4v4M13.5 2.5l-6 6M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3',
)
export const EyeIcon = /* @__PURE__ */ drawn(
  'M1.75 8S4 3.5 8 3.5 14.25 8 14.25 8 12 12.5 8 12.5 1.75 8 1.75 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
)
export const EyeOffIcon = /* @__PURE__ */ drawn(
  'M10.19 12.03C9.53 12.32 8.8 12.5 8 12.5 4 12.5 1.75 8 1.75 8C1.75 8 2.43 6.64 3.71 5.41M5.81 3.97C6.47 3.68 7.2 3.5 8 3.5c4 0 6.25 4.5 6.25 4.5C14.25 8 13.57 9.36 12.29 10.59M8.35 9.97A2 2 0 0 1 6.03 7.65M2.25 2.25l11.5 11.5',
)
export const FailIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6 6l4 4M10 6l-4 4',
)
export const FavoriteIcon = /* @__PURE__ */ drawn(
  'M2 6.5a3.25 3.25 0 0 1 6-1.75 3.25 3.25 0 0 1 6 1.75c0 1.4-.9 2.4-1.8 3.3l-3.5 3.4a1 1 0 0 1-1.4 0l-3.5-3.4C2.9 8.9 2 7.9 2 6.5Z',
  filled,
)
export const FavoriteOutlineIcon = /* @__PURE__ */ drawn(
  'M2 6.5a3.25 3.25 0 0 1 6-1.75 3.25 3.25 0 0 1 6 1.75c0 1.4-.9 2.4-1.8 3.3l-3.5 3.4a1 1 0 0 1-1.4 0l-3.5-3.4C2.9 8.9 2 7.9 2 6.5Z',
)
export const FeaturedIcon = /* @__PURE__ */ drawn(
  'M8 2.1 9.76 6.17l4.42.42-3.33 2.94.97 4.33L8 11.6l-3.82 2.26.97-4.33-3.33-2.94 4.42-.42Z',
)
export const FileIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3',
)
export const FilesIcon = /* @__PURE__ */ drawn(
  'M7 1.75H3.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1H5M7 1.75 9 3.75M7 1.75v2h2M11 5.25H7.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-6.5ZM11 5.25v2.5h2.5',
)
export const FilesystemIcon = /* @__PURE__ */ drawn(
  'M2.5 5.5 4 2.35a1 1 0 0 1 .9-.6h6.2a1 1 0 0 1 .9.6L13.5 5.5v1.75a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1ZM2.5 5.5h11M8 8.25v4.25M3.75 12.5v-1.25a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v1.25M3.75 13.75h.01M8 13.75h.01M12.25 13.75h.01',
)
export const FileTextIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M5.75 8.5h4.5M5.75 11h4.5',
)
export const FilterClearIcon = /* @__PURE__ */ drawn(
  'M1.75 2.75h10L8.25 8v4.5l-3 1.5V8ZM10.75 10.75l3 3M13.75 10.75l-3 3',
)
export const FilterIcon = /* @__PURE__ */ drawn('M2.5 2.75h11L9.5 8v4.5l-3 1.5V8Z')
export const FlaggedIcon = /* @__PURE__ */ drawn(
  'M3.25 14.25V3c1.2-.75 2.25-1 3.25-1 2 0 3 1.25 4.75 1.25.75 0 1.5-.15 2-.5v6.5c-.5.35-1.25.5-2 .5-1.75 0-2.75-1.25-4.75-1.25-1 0-2.05.25-3.25 1',
)
export const FlaskIcon = /* @__PURE__ */ drawn(
  'M6.5 2v3.75L2.9 12.3a1.1 1.1 0 0 0 1 1.7h8.2a1.1 1.1 0 0 0 1-1.7L9.5 5.75V2M5.5 2h5M4.25 10h7.5',
)
export const FolderIcon = /* @__PURE__ */ drawn(
  'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z',
)
export const FolderOpenIcon = /* @__PURE__ */ drawn(
  'M4 10.75 5.3 8.2a.85.85 0 0 1 .75-.45h7.7a.5.5 0 0 1 .47.67L12.6 12.5a.75.75 0 0 1-.7.5H3.5A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h3.4A1.5 1.5 0 0 1 12.5 6v1.75',
)
export const FolderTreeIcon = /* @__PURE__ */ drawn(
  'M8.25 2.75a.75.75 0 0 1 .75-.75h1.5l1 1h1.75a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75ZM8.25 10a.75.75 0 0 1 .75-.75h1.5l1 1h1.75a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75ZM2.5 2v8.5A1.5 1.5 0 0 0 4 12h2.5M2.5 3A1.5 1.5 0 0 0 4 4.5h2.5',
)
export const ForbiddenIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM5.75 10.25l4.5-4.5',
)
export const ForkIcon = /* @__PURE__ */ drawn(
  'M4.5 5.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM11.5 5.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM8 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.5 5.75v1a1.25 1.25 0 0 0 1.25 1.25h4.5a1.25 1.25 0 0 0 1.25-1.25v-1M8 8v2.25',
)
export const GearsIcon = /* @__PURE__ */ drawn(
  'M9.2 6.58L10.11 7.1L9.01 9.01L8.1 8.48L7.1 9.06L7.1 10.11L4.9 10.11L4.9 9.06L3.9 8.48L2.99 9.01L1.89 7.1L2.8 6.58L2.8 5.42L1.89 4.9L2.99 2.99L3.9 3.52L4.9 2.94L4.9 1.89L7.1 1.89L7.1 2.94L8.1 3.52L9.01 2.99L10.11 4.9L9.2 5.42ZM6 6h.01M13.59 11.56L14.35 11.75L13.85 13.28L13.13 12.98L12.5 13.44L12.55 14.22L10.95 14.22L11 13.44L10.37 12.98L9.65 13.28L9.15 11.75L9.91 11.56L10.15 10.82L9.65 10.22L10.95 9.28L11.36 9.94L12.14 9.94L12.55 9.28L13.85 10.22L13.35 10.82Z',
)
export const GlobeIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM2 8h12M8 2C6.25 3.6 5.5 5.75 5.5 8s.75 4.4 2.5 6c1.75-1.6 2.5-3.75 2.5-6S9.75 3.6 8 2Z',
)
export const GovernmentIcon = /* @__PURE__ */ drawn(
  'M2.25 5.75 8 2.25l5.75 3.5ZM3.75 8v4M6.5 8v4M9.5 8v4M12.25 8v4M2.25 14.25h11.5',
)
export const GraphIcon = /* @__PURE__ */ drawn(
  'M7 2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM3 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM11 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM8 6v2M4 10V8.75A.75.75 0 0 1 4.75 8h6.5a.75.75 0 0 1 .75.75V10',
)
export const GridIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h2.25a1 1 0 0 1 1 1v2.25a1 1 0 0 1-1 1h-2.25a1 1 0 0 1-1-1v-2.25a1 1 0 0 1 1-1ZM10.25 2.5h2.25a1 1 0 0 1 1 1v2.25a1 1 0 0 1-1 1h-2.25a1 1 0 0 1-1-1v-2.25a1 1 0 0 1 1-1ZM3.5 9.25h2.25a1 1 0 0 1 1 1v2.25a1 1 0 0 1-1 1h-2.25a1 1 0 0 1-1-1v-2.25a1 1 0 0 1 1-1ZM10.25 9.25h2.25a1 1 0 0 1 1 1v2.25a1 1 0 0 1-1 1h-2.25a1 1 0 0 1-1-1v-2.25a1 1 0 0 1 1-1Z',
)
export const HealthMonitoringIcon = /* @__PURE__ */ drawn('M14.25 8H12l-2 5.5-4-11L4 8H1.75')
export const HelpIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.25 6.25a1.75 1.75 0 1 1 2.6 1.5C8.3 8.05 8 8.35 8 8.75M8 11h.01',
)
export const HistoryIcon = /* @__PURE__ */ drawn(
  'M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.5M2.5 2.5v3h3M8 5.25V8l2 1.25',
)
export const HomeIcon = /* @__PURE__ */ drawn(
  'M2.5 7a1 1 0 0 1 .35-.75l4.5-3.9a1 1 0 0 1 1.3 0l4.5 3.9A1 1 0 0 1 13.5 7v5.75a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1ZM6.5 13.75V10a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v3.75',
)
export const IdCardIcon = /* @__PURE__ */ drawn(
  'M2.75 3.25h10.5a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1ZM5.5 8.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM3.25 12.75a2.25 2.25 0 0 1 4.5 0M10 6.75h2.25M10 9.25h2.25',
)
export const ImageIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M6.25 8h.01M5.75 11.75 8 9.5l2.25 2.25',
)
export const ImpersonateIcon = /* @__PURE__ */ drawn(
  'M1.75 7.5h12.5M3.5 7.5l1.25-3.9a1 1 0 0 1 1.2-.7L8 3.5l2.05-.6a1 1 0 0 1 1.2.7L12.5 7.5M4.75 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11.25 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.75 11.5c.75-.6 1.75-.6 2.5 0',
)
export const InboxIcon = /* @__PURE__ */ drawn(
  'M2 9.5h3.5l1 2h3l1-2H14M2 9.5 3.8 3.6A1 1 0 0 1 4.7 3h6.6a1 1 0 0 1 .9.6L14 9.5v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3Z',
)
export const IndexIcon = /* @__PURE__ */ drawn(
  'M2.5 3.75a5.5 2 0 1 0 11 0a5.5 2 0 1 0-11 0ZM13.5 3.75V7.5M2.5 3.75v8.5a5.5 2 0 0 0 5.5 2M2.5 8a5.5 2 0 0 0 5.5 2M11.75 13.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM13 13l1.25 1.25',
)
export const InfoIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 7.5v3.5M8 5h.01',
)
export const InfrastructureLayersIcon = /* @__PURE__ */ drawn(
  'M8 2l6 3-6 3-6-3ZM2 8l6 3 6-3M2 11l6 3 6-3',
)
export const InputFormIcon = /* @__PURE__ */ drawn(
  'M3.25 11h-.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5M8.75 5h4.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4.5M6 3.5v9M4.5 2.5H5a1 1 0 0 1 1 1 1 1 0 0 1 1-1h.5M4.5 13.5H5a1 1 0 0 0 1-1 1 1 0 0 0 1 1h.5',
)
export const InstallIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM5.5 13.5h5M8 10.5v3M8 4.5V8M6.25 6.25 8 8l1.75-1.75',
)
export const InstanceIcon = /* @__PURE__ */ drawn(
  'M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1ZM5.5 5.5h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM6.5 8h.01',
)
export const InstanceTypeIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM5 5h.01M2.5 12.25h11M2.5 10.5V14M13.5 10.5V14',
)
export const IpAddressIcon = /* @__PURE__ */ drawn(
  'M3 3h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM5.5 5.75v4.5M8.25 10.25v-4.5h1.75a1.5 1.5 0 0 1 0 3H8.25',
)
export const IssueIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
)
export const JobIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h2.25M9.5 1.75l3 3v1.5M9.5 1.75v3h3M5.75 7.5h1.5M11.25 14.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM11.25 9.75v1.5l1 .75',
)
export const JsonIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M7 7.5c-.6 0-.75.35-.75.85v.5c0 .4-.25.65-.75.65.5 0 .75.25.75.65v.5c0 .5.15.85.75.85M9 7.5c.6 0 .75.35.75.85v.5c0 .4.25.65.75.65-.5 0-.75.25-.75.65v.5c0 .5-.15.85-.75.85',
)
export const KeyboardIcon = /* @__PURE__ */ drawn(
  'M2.75 3.25h10.5a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1ZM4.75 5.75h.01M8 5.75h.01M11.25 5.75h.01M4.75 8h.01M8 8h.01M11.25 8h.01M5.75 10.25h4.5',
)
export const KeyIcon = /* @__PURE__ */ drawn(
  'M5 13.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM7 9l6-6M11 5l1.5 1.5M9.5 6.5 11 8',
)
export const LanguageIcon = /* @__PURE__ */ drawn(
  'M2 3.75h7.25M5.25 2v1.75M3.5 5.5l3.75 3.75M3 9.25 6.75 5.5l1-1.75M8 14.25l3-6.5 3 6.5M9.15 11.75h3.7',
)
export const LegalIcon = /* @__PURE__ */ drawn(
  'M8 3.5v10M5.25 13.5h5.5M2.5 4.75h.5c1.75 0 3.5-.5 5-1.25 1.5.75 3.25 1.25 5 1.25h.5M3.75 4.75l2 5a3.25 3.25 0 0 1-4 0ZM12.25 4.75l2 5a3.25 3.25 0 0 1-4 0Z',
)
export const LibraryIcon = /* @__PURE__ */ drawn(
  'M3.25 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM4.75 2v12M8.75 3.5 11.25 2.75 14.25 12.5 11.75 13.25Z',
)
export const LicenseIcon = /* @__PURE__ */ drawn(
  'M3.75 6.25a4.25 4.25 0 1 0 8.5 0a4.25 4.25 0 1 0 -8.5 0M5.5 9.75l-.75 4.5L8 12.75l3.25 1.5-.75-4.5',
)
export const LinkIcon = /* @__PURE__ */ drawn(
  'M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-.75.75M9.25 6.75a2.5 2.5 0 0 0-3.5 0l-2.5 2.5a2.5 2.5 0 0 0 3.5 3.5l.75-.75',
)
export const ListViewIcon = /* @__PURE__ */ drawn(
  'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
)
export const LoadingIcon = /* @__PURE__ */ drawn(
  'M8 2.75a5.25 5.25 0 0 1 5.25 5.25M8 13.25A5.25 5.25 0 0 1 2.75 8',
)
export const LockIcon = /* @__PURE__ */ drawn(
  'M3.5 7.25h9a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4.5a1 1 0 0 1 1-1ZM5 7.25V5a3 3 0 0 1 6 0v2.25',
)
export const LogsIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5h11M2.5 7h6.5M2.5 10.5h5M12 6.75v6.5M10.25 11.5 12 13.25l1.75-1.75',
)
export const MachineImageIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 4.75h.01M2.5 9.5l5.5 2 5.5-2M2.5 12.25l5.5 2 5.5-2',
)
export const MailFailedIcon = /* @__PURE__ */ drawn(
  'M8.75 12.25H2.5v-8.5h11v5M2.75 4.25 8 8.5l5.25-4.25M10.75 10.75l3 3M13.75 10.75l-3 3',
)
export const MailIcon = /* @__PURE__ */ drawn('M2.5 3.75h11v8.5h-11ZM2.75 4.25 8 8.5l5.25-4.25')
export const MailVerifiedIcon = /* @__PURE__ */ drawn(
  'M8.75 12.25H2.5v-8.5h11v5M2.75 4.25 8 8.5l5.25-4.25M10.5 12.5l1.25 1.25 2.5-3',
)
export const MapPinIcon = /* @__PURE__ */ drawn(
  'M8 14.5s5-4.25 5-8a5 5 0 0 0-10 0c0 3.75 5 8 5 8ZM8 8.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
)
export const MarketplaceIcon = /* @__PURE__ */ drawn(
  'M2.5 2.5h11l.75 3.5a2.08 1.5 0 0 1-4.17 0 2.08 1.5 0 0 1-4.16 0 2.08 1.5 0 0 1-4.17 0ZM3 7.5v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5M6.5 13.5V11a1.5 1.5 0 0 1 3 0v2.5',
)
export const MatrixIcon = /* @__PURE__ */ drawn(
  'M4.5 2.5H2.5v11h2M11.5 2.5h2v11h-2M6 5.15a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2ZM10 5.15a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2ZM6 9.65a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2ZM10 9.65a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 0 0 0-1.2Z',
)
export const MegaphoneIcon = /* @__PURE__ */ drawn(
  'M7.25 4.5c2.25 0 4.25-.6 6-2v10c-1.75-1.4-3.75-2-6-2H3.5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1ZM7.25 4.5v6M4.25 10.5v2.75a1 1 0 0 0 1 1h.5a1 1 0 0 0 1-1V10.5',
)
export const MFAIcon = /* @__PURE__ */ drawn(
  'M8.75 8V2.75a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h4.25M5.75 11.75h.01M10.5 12.5l1.25 1.25 2.5-3',
)
export const MigrationIcon = /* @__PURE__ */ drawn(
  'M2.5 3.75a5.5 2 0 1 0 11 0a5.5 2 0 1 0-11 0ZM13.5 3.75V7M2.5 3.75v8.5a5.5 2 0 0 0 5.5 2M2.5 8a5.5 2 0 0 0 5.5 2M12.75 9.5l-2 2.75h3l-2 2',
)
export const MinimizeIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM5.5 10.5h5',
)
export const MinusIcon = /* @__PURE__ */ drawn('M3 8h10')
export const MlIcon = /* @__PURE__ */ drawn(
  'M3.25 2.75a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3ZM3.25 10.25a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3ZM12.75 2.75a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3ZM12.75 10.25a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3ZM4.75 4.25h6.5M4.75 11.75h6.5M4.45 5.2l7.1 5.6M4.45 10.8l7.1-5.6',
)
export const MoneyIcon = /* @__PURE__ */ drawn(
  'M8 1.75v12.5M11 4.5H6.75a2 2 0 0 0 0 4h2.5a2 2 0 0 1 0 4H4.75',
)
export const MoonIcon = /* @__PURE__ */ drawn('M8 2a4 4 0 0 0 6 6 6 6 0 1 1-6-6Z')
export const MoreIcon = /* @__PURE__ */ drawn(
  'M3.5 7.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM8 7.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2ZM12.5 7.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Z',
)
export const MusicIcon = /* @__PURE__ */ drawn(
  'M6.25 12.25V3.75l7.25-1.25V11M4.5 14a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM11.75 12.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
)
export const MuteIcon = /* @__PURE__ */ drawn(
  'M4 7.25v3.25l-1.25 1.75h7.5M5.75 3.65A4 4 0 0 1 12 7v2.25M6.5 13.75a1.6 1.6 0 0 0 3 0M1.75 1.75l12.5 12.5',
)
export const NamespaceIcon = /* @__PURE__ */ drawn(
  'M2.5 6.5V3a.75.75 0 0 1 .75-.75h3.5A.75.75 0 0 1 7.5 3v1.5M9.25 4.5h1M11.75 4.5h.75a1 1 0 0 1 1 1v.75M13.5 8.25v1.75M13.5 11.75v.75a1 1 0 0 1-1 1h-.75M7 13.5h2M4.25 13.5H3.5a1 1 0 0 1-1-1v-.75M2.5 8.5v1.25',
)
export const NavigationIcon = /* @__PURE__ */ drawn('M2.5 4.5h11M2.5 8h11M2.5 11.5h11')
export const NetworkInterfaceIcon = /* @__PURE__ */ drawn(
  'M10 13.5l2-2h.5a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H4l2 2ZM5 6v.75M8 6v.75M11 6v.75',
)
export const NetworkShareIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5a1 1 0 0 1 1-1h2.25L7 3.75h5.5a1 1 0 0 1 1 1V8.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1ZM8 9.5v2.25M8 14.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM2.5 13h4.25M9.25 13h4.25',
)
export const NewChatIcon = /* @__PURE__ */ drawn(
  'M7.5 2.5h-4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4M11.75 2.75a1.06 1.06 0 0 1 1.5 1.5L8 9.5l-2 .5.5-2Z',
)
export const NodeIcon = /* @__PURE__ */ drawn(
  'M3.5 5h9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1ZM5 8h.01M8.5 8h2.5',
)
export const NotebookIcon = /* @__PURE__ */ drawn(
  'M5 1.75h7a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1ZM2.5 4.5h3M2.5 8h3M2.5 11.5h3M7.75 5.25h2.75M7.75 8h3M7.75 10.75h2',
)
export const NotificationIcon = /* @__PURE__ */ drawn(
  'M4 10.5V7a4 4 0 0 1 8 0v3.5l1.25 1.75H2.75L4 10.5ZM6.5 13.75a1.6 1.6 0 0 0 3 0',
)
export const NotRunningIcon = /* @__PURE__ */ drawn('M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Z')
export const OnboardingIcon = /* @__PURE__ */ drawn(
  'M1.75 14h3.5v-3.5h3.5V7h3.5V2.5M9.75 4.75 12.25 2.25l2.5 2.5',
)
export const OpenInNewGraphIcon = /* @__PURE__ */ drawn(
  'M7 2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM3 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM8 6v2M4 10V8.75A.75.75 0 0 1 4.75 8h4.75M11.25 10.25h3v3M14.25 10.25l-4 4',
)
export const OrganizationIcon = /* @__PURE__ */ drawn(
  'M5 13.75V3.25a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10.5M5 7H3.25a1 1 0 0 0-1 1v4.75a1 1 0 0 0 1 1h9.5a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H11M7 5.25h2M7 8.25h2M7 13.75v-1.75a1 1 0 0 1 2 0v1.75',
)
export const OwnerIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M11.5 12.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12.6 12.6l1.9 1.9M13.75 13.75l-1 1',
)
export const PartnerIcon = /* @__PURE__ */ drawn(
  'M2.5 2.5 2 9.25l3.9 3.9a.9.9 0 0 0 1.8-1.8M2.5 3.25h4.75M13.5 2.5l.5 6.75h-1.25M9.25 9.25l1.5 1.5a.9.9 0 0 0 1.8-1.8l-2.35-2.35a1.8 1.8 0 0 0-2.55 0l-.55.55a.9.9 0 0 1-1.8-1.8l1.7-1.7a3.5 3.5 0 0 1 4.25-.5l.3.15a1.2 1.2 0 0 0 .85.15l1.1-.25',
)
export const PasswordIcon = /* @__PURE__ */ drawn(
  'M2.9 7.25a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M7.4 7.25a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M11.9 7.25a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M1.75 11.5h12.5',
)
export const PauseIcon = /* @__PURE__ */ drawn('M5.5 3.25v9.5M10.5 3.25v9.5')
export const PdfIcon = /* @__PURE__ */ drawn(
  'M3.5 8V2.75a1 1 0 0 1 1-1h5l3 3v8.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-1M9.5 1.75v3h3M2.75 8h6.5a1 1 0 0 1 1 1v2.25a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-2.25a1 1 0 0 1 1-1Z',
)
export const PendingIcon = /* @__PURE__ */ drawn(
  'M9.55 2.2A6 6 0 0 1 12.24 3.76M13.8 6.45A6 6 0 0 1 13.8 9.55M12.24 12.24A6 6 0 0 1 9.55 13.8M6.45 13.8A6 6 0 0 1 3.76 12.24M2.2 9.55A6 6 0 0 1 2.2 6.45M3.76 3.76A6 6 0 0 1 6.45 2.2',
)
export const PhoneIcon = /* @__PURE__ */ drawn(
  'M5.5 2.25H3.25a1 1 0 0 0-1 1.1c.55 5.65 4.75 9.85 10.4 10.4a1 1 0 0 0 1.1-1V10.5l-3.5-2-1.5 1.5A4 4 0 0 1 6 7.25l1.5-1.5Z',
)
export const PieChartIcon = /* @__PURE__ */ drawn(
  'M13.05 10A5.75 5.75 0 1 1 6 2.95M8.5 7.5V1.75a5.75 5.75 0 0 1 5.75 5.75Z',
)
export const PinFilledIcon = /* @__PURE__ */ drawn(
  'M6 2.25h4a1.25 1.25 0 0 1 0 2.5.5.5 0 0 0-.5.5V7.5c0 .45.25.85.65 1.05l1.45.75c.55.3.9.85.9 1.45v.5a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-.5c0-.6.35-1.15.9-1.45l1.45-.75c.4-.2.65-.6.65-1.05V5.25a.5.5 0 0 0-.5-.5 1.25 1.25 0 0 1 0-2.5ZM8 12v2.25',
  filled,
)
export const PinIcon = /* @__PURE__ */ drawn(
  'M6 2.25h4a1.25 1.25 0 0 1 0 2.5.5.5 0 0 0-.5.5V7.5c0 .45.25.85.65 1.05l1.45.75c.55.3.9.85.9 1.45v.5a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-.5c0-.6.35-1.15.9-1.45l1.45-.75c.4-.2.65-.6.65-1.05V5.25a.5.5 0 0 0-.5-.5 1.25 1.25 0 0 1 0-2.5ZM8 12v2.25',
)
export const PowerIcon = /* @__PURE__ */ drawn('M8 1.75V8M11.75 4a5.75 5.75 0 1 1-7.5 0')
export const PreviewIcon = /* @__PURE__ */ drawn(
  'M2 4.5V3a1 1 0 0 1 1-1h1.5M11.5 2H13a1 1 0 0 1 1 1v1.5M14 11.5V13a1 1 0 0 1-1 1h-1.5M4.5 14H3a1 1 0 0 1-1-1v-1.5M3.75 8S5.5 5 8 5s4.25 3 4.25 3-1.75 3-4.25 3S3.75 8 3.75 8ZM8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
)
export const PrintIcon = /* @__PURE__ */ drawn(
  'M4.5 5.75v-3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3M4.5 11.75H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1.5M5.5 9.25h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z',
)
export const ProjectIcon = /* @__PURE__ */ drawn(
  'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7ZM5.5 7.25v3M8 7.25v1.5M10.5 7.25v3.75',
)
export const ProvisionIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 4.75h.01M3.5 9h4.25a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-4.25a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 11.25h.01M12.25 10.25v4M10.25 12.25h4',
)
export const PublishIcon = /* @__PURE__ */ drawn(
  'M8 7.25V1.75M5.75 4 8 1.75 10.25 4M2.5 9.5h11l.75 2.5a2.08 1.5 0 0 1-4.17 0 2.08 1.5 0 0 1-4.16 0 2.08 1.5 0 0 1-4.17 0Z',
)
export const PullRequestIcon = /* @__PURE__ */ drawn(
  'M4.5 5.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.5 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM11.5 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.5 5.75v4.5M11.5 10.25V6.5a2 2 0 0 0-2-2h-2M9 2.75 7.25 4.5 9 6.25',
)
export const QRCodeIcon = /* @__PURE__ */ drawn(
  'M3 2h2.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM10.5 2H13a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM3 9.5h2.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM9.75 9.75h1.75v1.75M14 9.75h.01M9.75 14h.01M14 14v-1.5',
)
export const QueueIcon = /* @__PURE__ */ drawn(
  'M7.5 4h6M7.5 8h6M7.5 12h6M2.75 3.25l1-.75v4M2.75 10.25a1.1 1.1 0 0 1 2 .6c0 .9-2 1.4-2 2.65h2',
)
export const QuickActionIcon = /* @__PURE__ */ drawn('M9.25 1.75 3.25 9h4.5l-1 5.25 6-7.25h-4.5Z')
export const QuotaIcon = /* @__PURE__ */ drawn('M8 9.5l2.75-2.75M2.8 11.5a6 6 0 1 1 10.4 0')
export const RedoIcon = /* @__PURE__ */ drawn(
  'M10.5 3.5l3 3-3 3M13.5 6.5H6.25a3.5 3.5 0 0 0 0 7H8.5',
)
export const RefreshIcon = /* @__PURE__ */ drawn(
  'M13 8a5 5 0 0 1-8.9 3.1M3 8a5 5 0 0 1 8.9-3.1M12 2.5v2.5H9.5M4 13.5V11h2.5',
)
export const ReleaseIcon = /* @__PURE__ */ drawn(
  'M2.25 2.25h4l5 5-4 4-5-5ZM4.75 4.75h.01M11 11l3 3M14 11v3h-3',
)
export const RemoveIcon = /* @__PURE__ */ drawn('M4 4l8 8M12 4l-8 8')
export const RemoveUserIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M10.25 12.25h4',
)
export const RenameIcon = /* @__PURE__ */ drawn(
  'M10.5 2.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L6 13l-3.5.75L3.25 10.25ZM9 4l3 3M8.75 13.75h4.75',
)
export const RenewIcon = /* @__PURE__ */ drawn(
  'M13.5 5.75V3.5h-11v10h3.25M2.5 6.5h4.25M5.5 2v2.5M10.5 2v2.5M14.25 11a3 3 0 0 1-5.34 1.86M8.25 11a3 3 0 0 1 5.34-1.86M13.65 7.4v1.5h-1.5M8.85 14.3v-1.5h1.5',
)
export const ReportIcon = /* @__PURE__ */ drawn(
  'M10.5 3h1.5a1 1 0 0 1 1 1v9.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1.5M6 1.75h4a.5.5 0 0 1 .5.5v1.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-1.5a.5.5 0 0 1 .5-.5ZM5.5 11.25l1.75-2 1.5 1.25 2-2.75',
)
export const RepositoryIcon = /* @__PURE__ */ drawn(
  'M3.5 12.25V3.5A1.5 1.5 0 0 1 5 2h7.5v9H5a1.5 1.5 0 0 0 0 3h7.5M6.5 5h3',
)
export const ResetIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5h11M2.5 8h2.75M2.5 12.5h2.75M7.75 10.25a3 3 0 1 0 .875-2.125L7.75 8.875M7.75 7.25v1.625h1.625',
)
export const ResetLayoutIcon = /* @__PURE__ */ drawn(
  'M13.5 6v-1.5a1 1 0 0 0-1-1H8M9.75 1.75 8 3.5l1.75 1.75M13.5 9.5v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1',
)
export const ResourceGroupIcon = /* @__PURE__ */ drawn(
  'M3.5 2h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-9a1.5 1.5 0 0 1 1.5-1.5ZM8 4.75L10.93 6.38V9.63L8 11.25L5.07 9.63V6.38ZM5.07 6.38L8 8L10.93 6.38M8 8V11.25',
)
export const ResourceIcon = /* @__PURE__ */ drawn(
  'M8 1.75L13.63 4.88V11.13L8 14.25L2.38 11.13V4.88ZM2.38 4.88L8 8L13.63 4.88M8 8V14.25',
)
export const RestartIcon = /* @__PURE__ */ drawn(
  'M8 1.75V7.5M11.75 4a5.75 5.75 0 1 1-7.5 0M4.25 6.5V4h-2.5',
)
export const RestoreIcon = /* @__PURE__ */ drawn(
  'M3 2.25h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1ZM3 5.25v7.25a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.25M8 11.5V7.75M6.25 9.5 8 7.75l1.75 1.75',
)
export const RetryIcon = /* @__PURE__ */ drawn('M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.5M2.5 2.5v3h3')
export const RevokeIcon = /* @__PURE__ */ drawn(
  'M8.75 12.75h-6a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1h10.5a1 1 0 0 1 1 1v4.5M4.25 6.5h3.5M4.25 9.25h2M10.75 10.75l3 3M13.75 10.75l-3 3',
)
export const RoleIcon = /* @__PURE__ */ drawn(
  'M6.5 7.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2 13.75c.55-2.35 2.4-3.75 4.5-3.75.8 0 1.5.15 2.1.45M12.25 10l2 .75v1.25c0 1.1-.8 1.85-2 2.25-1.2-.4-2-1.15-2-2.25v-1.25Z',
)
export const RollbackIcon = /* @__PURE__ */ drawn(
  'M13.75 11.5a6 6 0 0 0-10-4.5L2.5 8.5M2.5 4.5v4h4M8 12a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
)
export const RunningIcon = /* @__PURE__ */ drawn('M14 8a6 6 0 1 1-6-6')
export const RunsIcon = /* @__PURE__ */ drawn(
  'M3 5.5h6.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1ZM5 5.5v-2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1h-2M5 8v3.5l3-1.75Z',
)
export const RunWorkflowIcon = /* @__PURE__ */ drawn(
  'M3 2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM11.25 2h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM6 4h4.25M12.25 6v2.5M10.75 10v4.5l3.5-2.25Z',
)
export const SaveIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5a1 1 0 0 1 1-1h7l3 3v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1ZM5 2.5v3h5v-3M5 13.5v-4h6v4',
)
export const SchedulerIcon = /* @__PURE__ */ drawn(
  'M13.5 6V3.5h-11v10h4M2.5 6.5h4.5M5.5 2v2.5M10.5 2v2.5M11 14.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM11 9.5V11l1.25.75',
)
export const ScriptIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M7 8.5 5.5 10 7 11.5M9 8.5l1.5 1.5L9 11.5',
)
export const SearchIcon = /* @__PURE__ */ drawn(
  'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM14 14l-3.5-3.5',
)
export const SendIcon = /* @__PURE__ */ drawn(
  'M14.25 1.75 10 14.25 7.5 8.5 1.75 6ZM14.25 1.75 7.5 8.5',
)
export const ServiceIcon = /* @__PURE__ */ drawn(
  'M8 3.5l4.33 2.5v5L8 13.5 3.67 11V6ZM8 3.5V1.75M12.33 11l1.52.88M3.67 11l-1.52.88M8 8.5h.01',
)
export const SessionIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM5.5 13.5h5M8 10.5v3M6.75 4.75v3.5l3-1.75Z',
)
export const SettingsIcon = /* @__PURE__ */ drawn(
  'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM13 8a5 5 0 0 0-.1-1l1.4-1.1-1.4-2.4-1.7.6a5 5 0 0 0-1.7-1L9.2 1.3H6.8l-.3 1.8a5 5 0 0 0-1.7 1l-1.7-.6-1.4 2.4L3.1 7a5 5 0 0 0 0 2l-1.4 1.1 1.4 2.4 1.7-.6a5 5 0 0 0 1.7 1l.3 1.8h2.4l.3-1.8a5 5 0 0 0 1.7-1l1.7.6 1.4-2.4L12.9 9c.07-.33.1-.66.1-1Z',
)
export const SharedIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 4.75h.01M3.5 9h4.25a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-4.25a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1ZM5 11.25h.01M12.25 11.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM10.25 14.25c.25-1 1-1.5 2-1.5s1.75.5 2 1.5',
)
export const ShareIcon = /* @__PURE__ */ drawn(
  'M11.75 5.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM4.25 9.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM11.75 14a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM5.75 7.15l4.5-2.55M5.75 8.85l4.5 2.55',
)
export const ShieldIcon = /* @__PURE__ */ drawn(
  'M8 1.75 13 3.5v4c0 3-2.15 5.25-5 6.75-2.85-1.5-5-3.75-5-6.75v-4Z',
)
export const ShieldOffIcon = /* @__PURE__ */ drawn(
  'M5.25 2.7 8 1.75l5 1.75v4c0 .95-.2 1.8-.6 2.6M3 5v2.5c0 3 2.15 5.25 5 6.75.8-.4 1.6-.95 2.25-1.5M1.75 1.75l12.5 12.5',
)
export const ShrinkIcon = /* @__PURE__ */ drawn(
  'M5.5 2.5v2a1 1 0 0 1-1 1h-2M13.5 5.5h-2a1 1 0 0 1-1-1v-2M2.5 10.5h2a1 1 0 0 1 1 1v2M10.5 13.5v-2a1 1 0 0 1 1-1h2',
)
export const SidebarCloseIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM6 2.5v11M11 6 9 8l2 2',
)
export const SidebarIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM6 2.5v11',
)
export const SidebarOpenIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM6 2.5v11M9 6l2 2-2 2',
)
export const SignInIcon = /* @__PURE__ */ drawn(
  'M10 2.5h2.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10M6.5 5l3 3-3 3M9.5 8H2.5',
)
export const SignOutIcon = /* @__PURE__ */ drawn(
  'M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6M10.5 11 13.5 8l-3-3M13.5 8H6',
)
export const SkipIcon = /* @__PURE__ */ drawn('M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM5.25 8h5.5')
export const SnapshotIcon = /* @__PURE__ */ drawn(
  'M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M5.25 6a2.75 1 0 1 0 5.5 0 2.75 1 0 1 0-5.5 0ZM5.25 6v4a2.75 1 0 0 0 5.5 0V6',
)
export const SortDownIcon = /* @__PURE__ */ drawn(
  'M4.5 2.75v10.5M2.25 11 4.5 13.25 6.75 11M8.5 3.5h5M8.5 7h3.5M8.5 10.5h2',
)
export const SortUnsortedIcon = /* @__PURE__ */ drawn(
  'M5 13.25V2.75M2.75 5 5 2.75 7.25 5M11 2.75v10.5M8.75 11 11 13.25 13.25 11',
)
export const SortUpIcon = /* @__PURE__ */ drawn(
  'M4.5 13.25V2.75M2.25 5 4.5 2.75 6.75 5M8.5 5.5h2M8.5 9h3.5M8.5 12.5h5',
)
export const SparklesIcon = /* @__PURE__ */ drawn(
  'M7 4.25c.5 2.9 1.85 4.25 4.75 4.75-2.9.5-4.25 1.85-4.75 4.75-.5-2.9-1.85-4.25-4.75-4.75 2.9-.5 4.25-1.85 4.75-4.75ZM12.25 2v3M10.75 3.5h3',
)
export const SplitIcon = /* @__PURE__ */ drawn(
  'M8 1.75v12.5M10.5 2.5h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2M5.5 13.5h-2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2',
)
export const SpreadsheetIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM2.5 6.25h11M2.5 9.75h11M6.25 6.25v7.25M9.75 6.25v7.25',
)
export const StartIcon = /* @__PURE__ */ drawn('M4.25 2.5v11L13.75 8Z')
export const StopIcon = /* @__PURE__ */ drawn(
  'M4 3h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
)
export const StorageIcon = /* @__PURE__ */ drawn(
  'M2.5 3.75a5.5 2 0 1 0 11 0a5.5 2 0 1 0-11 0ZM2.5 3.75v8.5a5.5 2 0 0 0 11 0v-8.5M2.5 8a5.5 2 0 0 0 11 0',
)
export const SubdomainIcon = /* @__PURE__ */ drawn(
  'M3.25 4.5h9.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5ZM7 4.5v7M4.4 8h.01M9.5 8h2.25',
)
export const SuccessIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM5.25 8.25 7 10l3.5-4',
)
export const SummaryIcon = /* @__PURE__ */ drawn(
  'M3.5 2h7.5a1.5 1.5 0 0 1 1.5 1.5v8M6.5 14h6.25A1.25 1.25 0 0 0 14 12.75V11.5H8v1a1.5 1.5 0 0 1-3 0V3.5a1.5 1.5 0 1 0-3 0v1.25h3M7 5.25h3.5M7 8.25h3.5',
)
export const SunIcon = /* @__PURE__ */ drawn(
  'M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05',
)
export const SupportIcon = /* @__PURE__ */ drawn(
  'M2.5 11V8a5.5 5.5 0 0 1 11 0v3M2.5 8.5H4a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-.5a1 1 0 0 1-1-1M13.5 8.5H12a1 1 0 0 0-1 1V11a1 1 0 0 0 1 1h.5a1 1 0 0 0 1-1M13.5 11v1.25a2 2 0 0 1-2 2H9',
)
export const SwapIcon = /* @__PURE__ */ drawn(
  'M13.25 5H2.75M5 2.75 2.75 5 5 7.25M2.75 11h10.5M11 8.75 13.25 11 11 13.25',
)
export const TagIcon = /* @__PURE__ */ drawn('M2.5 2.5h5l6 6-5 5-6-6v-5ZM5.25 5.25h.01')
export const TerminalIcon = /* @__PURE__ */ drawn('M3 4.5 6.5 8 3 11.5M8 12h5')
export const ThinkingIcon = /* @__PURE__ */ drawn(
  'M8 3.5A2 2 0 0 0 4.25 4.5 2.25 2.25 0 0 0 2.75 8.25 2.25 2.25 0 0 0 4.5 12 2 2 0 0 0 8 12.75M8 3.5A2 2 0 0 1 11.75 4.5a2.25 2.25 0 0 1 1.5 3.75A2.25 2.25 0 0 1 11.5 12 2 2 0 0 1 8 12.75M8 3.5v9.25M4.75 8.5c.9 0 1.5-.4 1.75-1.25M11.25 8.5c-.9 0-1.5-.4-1.75-1.25',
)
export const TodoIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1ZM2.5 11.5l1.25 1.25 2.5-3M9 4.5h4.5M9 8h4.5M9 11.5h4.5',
)
export const TokenIcon = /* @__PURE__ */ drawn(
  'M8 1.75l5.5 3.15v6.2L8 14.25 2.5 11.1V4.9ZM6.25 8a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0',
)
export const ToolsIcon = /* @__PURE__ */ drawn(
  'M9.75 4.25l2 2 2.5-2.5A4 4 0 0 1 9 9l-4.5 4.5a1.41 1.41 0 0 1-2-2L7 7a4 4 0 0 1 5.25-5.25Z',
)
export const TrashIcon = /* @__PURE__ */ drawn(
  'M2.5 4h11M6 4V2.75A.75.75 0 0 1 6.75 2h2.5a.75.75 0 0 1 .75.75V4M4 4l.65 9.05a1 1 0 0 0 1 .95h4.7a1 1 0 0 0 1-.95L12 4M6.75 7v4M9.25 7v4',
)
export const TunnelIcon = /* @__PURE__ */ drawn(
  'M1.75 13.5h12.5M3 13.5V8.5a5 5 0 0 1 10 0v5M5.5 13.5V9.25a2.5 2.5 0 0 1 5 0v4.25',
)
export const UndoIcon = /* @__PURE__ */ drawn(
  'M5.5 3.5l-3 3 3 3M2.5 6.5h7.25a3.5 3.5 0 0 1 0 7H7.5',
)
export const UnfavoriteIcon = /* @__PURE__ */ drawn(
  'M5.25 3.25a3.25 3.25 0 0 1 2.75 1.5 3.25 3.25 0 0 1 6 1.75c0 1.4-.9 2.4-1.8 3.3M9.75 12.2l-1.05 1a1 1 0 0 1-1.4 0l-3.5-3.4C2.9 8.9 2 7.9 2 6.5c0-.6.15-1.15.45-1.6M1.75 1.75l12.5 12.5',
)
export const UnlinkIcon = /* @__PURE__ */ drawn(
  'M12.25 8.25l1-1a2.5 2.5 0 0 0-3.5-3.5l-1 1M3.75 7.75l-1 1a2.5 2.5 0 0 0 3.5 3.5l1-1M5.5 1.75v2M1.75 5.5h2M10.5 12.25v2M12.25 10.5h2',
)
export const UnmuteIcon = /* @__PURE__ */ drawn(
  'M4 10.5V7a4 4 0 0 1 8 0v3.5l1.25 1.75H2.75L4 10.5ZM6.5 13.75a1.6 1.6 0 0 0 3 0M1.75 6.5c.1-1.5.5-2.6 1.25-3.75M14.25 6.5c-.1-1.5-.5-2.6-1.25-3.75',
)
export const UnsplitIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM5 6.25l1.75 1.75L5 9.75M11 6.25 9.25 8 11 9.75',
)
export const UploadIcon = /* @__PURE__ */ drawn(
  'M8 10.5V2.5M4.75 5.5 8 2.25l3.25 3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
)
export const UserIcon = /* @__PURE__ */ drawn(
  'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8ZM2.75 13.75c.6-2.4 2.7-3.75 5.25-3.75s4.65 1.35 5.25 3.75',
)
export const UsersIcon = /* @__PURE__ */ drawn(
  'M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM1.75 13c.5-2 2.1-3.25 4.25-3.25S9.75 11 10.25 13M10.5 3.1a2.25 2.25 0 0 1 0 4.3M11.75 9.9c1.2.45 2.1 1.5 2.5 3.1',
)
export const UserWorkspaceIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM5 5.5l2 2-2 2M8 10.5h3',
)
export const VariableIcon = /* @__PURE__ */ drawn(
  'M4.75 2.5C3.25 4 2.5 6 2.5 8s.75 4 2.25 5.5M11.25 2.5c1.5 1.5 2.25 3.5 2.25 5.5s-.75 4-2.25 5.5M6 6l4 4M10 6l-4 4',
)
export const VerifiedIcon = /* @__PURE__ */ drawn(
  'M8 1.75L9.91 3.38L12.42 3.58L12.62 6.09L14.25 8L12.62 9.91L12.42 12.42L9.91 12.62L8 14.25L6.09 12.62L3.58 12.42L3.38 9.91L1.75 8L3.38 6.09L3.58 3.58L6.09 3.38ZM5.5 8.25 7.15 9.9 10.5 6.25',
)
export const VideoIcon = /* @__PURE__ */ drawn(
  'M2.75 4h6.75a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM10.5 9l3.15 2.1a.4.4 0 0 0 .6-.35v-5.5a.4.4 0 0 0-.6-.35L10.5 7',
)
export const WarningIcon = /* @__PURE__ */ drawn(
  'M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5ZM8 6.5v2.75M8 11.25h.01',
)
export const WebhookIcon = /* @__PURE__ */ drawn(
  'M11.75 11.13H8.01c-.69 0-1.22.59-1.55 1.19A2.5 2.5 0 0 1 1.75 11.13c.01-.44.13-.88.36-1.25M4.25 11.13l1.96-3.61c.33-.61.06-1.36-.31-1.94a2.5 2.5 0 1 1 4.31-2.54M8 4.25l1.96 3.58c.33.61 1.1.8 1.79.8a2.5 2.5 0 0 1 0 5',
)
export const WorkerIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM5 5h.01M2.5 12.25h5.5M11 10.25v4l3-2Z',
)
export const WorkflowIcon = /* @__PURE__ */ drawn(
  'M3 2h2.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM4.25 6.5v4.25a1 1 0 0 0 1 1H9.5M10.5 9.5H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1Z',
)
export const WorkloadIcon = /* @__PURE__ */ drawn(
  'M3 6.5h5.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-5.5a1 1 0 0 1 1-1ZM4.25 6.5V5.25a1 1 0 0 1 1-1h5.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H9.5M6.5 4.25V3a1 1 0 0 1 1-1h5.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-1.25M4.75 8.75v3l2.5-1.5Z',
)
export const WorkspaceMountIcon = /* @__PURE__ */ drawn(
  'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7ZM2 8.5h12M4.75 10.75h.01M7 10.75h.01',
)
export const ZipIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M6.5 4h.01M6.5 6.5h.01M6.5 8.75v1.25M6.5 12.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z',
)
export const ZoomInIcon = /* @__PURE__ */ drawn(
  'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM14 14l-3.5-3.5M7 5v4M5 7h4',
)
export const ZoomOutIcon = /* @__PURE__ */ drawn(
  'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM14 14l-3.5-3.5M5 7h4',
)
export { ErrorCheckmark, SuccessCheckmark } from './components/StatusIcons'
/** @deprecated Renamed NamespaceIcon, which says what it means. */
export const KubernetesNamespaceIcon = NamespaceIcon
/** @deprecated Renamed CommandShellIcon, which says what it means. */
export const PowershellIcon = CommandShellIcon
/** @deprecated Renamed QuickActionIcon, which says what it means. */
export const ZapIcon = QuickActionIcon
