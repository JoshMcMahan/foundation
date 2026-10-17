// The one import point for interface icons: import them from here, never from
// 'lucide-react'. Logos of other companies' products are in './brandIcons'.
import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpNarrowWide,
  AtSign,
  BadgeCheck,
  Ban,
  BanknoteX,
  Bell,
  BellOff,
  BellRing,
  BookOpenText,
  BookUser,
  Bot,
  Boxes,
  Braces,
  Brain,
  BrainCircuit,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  CalendarSync,
  CalendarX,
  Camera,
  ChartLine,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsDownUp,
  ChevronsUp,
  ChevronsUpDown,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CirclePlay,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  ClipboardPen,
  Clock,
  Cloud,
  CloudCog,
  CloudOff,
  Code,
  CodeXml,
  Cog,
  Columns3,
  Copy,
  CopyPlus,
  CornerUpRight,
  Cpu,
  CreditCard,
  createLucideIcon,
  Database,
  DatabaseSearch,
  DatabaseZap,
  Disc3,
  DollarSign,
  Download,
  Earth,
  Ellipsis,
  EthernetPort,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileJson,
  FileKey,
  FilePenLine,
  Files,
  FileText,
  FileType,
  Fingerprint,
  Flag,
  FlaskConical,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  Folders,
  FolderTree,
  Funnel,
  FunnelX,
  Gauge,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Globe,
  GraduationCap,
  Grid3x3,
  GripHorizontal,
  Group,
  Handshake,
  HardDrive,
  HatGlasses,
  Headset,
  Heart,
  HeartOff,
  History,
  Hourglass,
  House,
  IdCard,
  Inbox,
  Info,
  Key,
  Keyboard,
  KeyRound,
  Landmark,
  Languages,
  Layers,
  LayoutGrid,
  LibraryBig,
  Link,
  List,
  ListOrdered,
  ListTodo,
  ListVideo,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  Logs,
  Mail,
  MailCheck,
  MailX,
  MapPin,
  MapPinned,
  Maximize,
  Megaphone,
  MemoryStick,
  Menu,
  MessageSquare,
  MessageSquareWarning,
  MessagesSquare,
  Minimize,
  Minimize2,
  Minus,
  Monitor,
  MonitorDown,
  MonitorPlay,
  MonitorSmartphone,
  Moon,
  Music,
  Network,
  NotebookText,
  PaintBucket,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  PartyPopper,
  Pause,
  PcCase,
  Pencil,
  PencilLine,
  Phone,
  Pin,
  Play,
  PlugZap,
  Plus,
  Power,
  Printer,
  QrCode,
  Redo2,
  RefreshCw,
  Rocket,
  RotateCcw,
  RotateCcwSquare,
  Route,
  Save,
  Scale,
  ScanEye,
  ScrollText,
  Search,
  Send,
  Server,
  Settings,
  Settings2,
  Share2,
  Sheet,
  Shield,
  ShieldOff,
  ShieldUser,
  Smartphone,
  Sparkles,
  Square,
  SquareChevronRight,
  SquareCode,
  SquareDashed,
  SquarePen,
  SquareSplitHorizontal,
  SquareTerminal,
  Star,
  Store,
  Sun,
  Tag,
  Terminal,
  TextCursorInput,
  Trash2,
  TriangleAlert,
  Undo2,
  UndoDot,
  Unlink,
  Unplug,
  Upload,
  User,
  UserCheck,
  UserLock,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  Video,
  Wallet,
  WandSparkles,
  Waypoints,
  Webhook,
  Wrench,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { ReactNode } from 'react'

export interface IconProps extends LucideProps {
  /** Names the icon for assistive technology. Without it, or an `aria-label`,
   *  the icon is decoration and hidden from assistive technology. */
  title?: string | undefined
}

/** An icon from this module or the brand icons. */
export type IconType = (props: IconProps) => ReactNode

// Lucide draws every glyph on a 24px grid with this stroke, so icons match one
// another and the weight of the text beside them.
const STROKE_WIDTH = 2

/** The text's size and color by default, so a class such as `size-4` or a
 *  parent's font size sets it. */
function icon(Glyph: LucideIcon, defaults?: LucideProps): IconType {
  function Icon({ title, children, ...props }: IconProps) {
    const named = Boolean(title || props['aria-label'] || props['aria-labelledby'])
    return (
      <Glyph
        size="1em"
        strokeWidth={STROKE_WIDTH}
        {...defaults}
        {...(named ? { role: 'img' } : {})}
        {...props}
      >
        {title ? (
          <>
            <title>{title}</title>
            {children}
          </>
        ) : (
          children
        )}
      </Glyph>
    )
  }
  Icon.displayName = Glyph.displayName
  return Icon
}

// A filled glyph marks a state its outline doesn't have, such as pinned.
const filled: LucideProps = { fill: 'currentColor' }

// Glyphs lucide doesn't draw, built from its own shapes on its 24px grid so
// they sit with the rest.

// Wallet's two strokes with a plus inside, where FolderPlus puts its own, so
// adding an allocation reads as AddProjectIcon and AddUserIcon do.
const WalletPlus = /* @__PURE__ */ createLucideIcon('wallet-plus', [
  [
    'path',
    {
      d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
      key: 'wallet-flap',
    },
  ],
  ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4', key: 'wallet-body' }],
  ['path', { d: 'M10 11v6', key: 'plus-stem' }],
  ['path', { d: 'M7 14h6', key: 'plus-bar' }],
])

export const AccessIcon = /* @__PURE__ */ icon(UserLock)
export const AddAllocationIcon = /* @__PURE__ */ icon(WalletPlus)
export const AddIcon = /* @__PURE__ */ icon(Plus)
export const AddProjectIcon = /* @__PURE__ */ icon(FolderPlus)
export const AddUserIcon = /* @__PURE__ */ icon(UserPlus)
export const AgentIcon = /* @__PURE__ */ icon(Bot)
export const AllocationIcon = /* @__PURE__ */ icon(Wallet)
export const APIIcon = /* @__PURE__ */ icon(CodeXml)
export const ArchiveIcon = /* @__PURE__ */ icon(Archive)
export const ArrowDownIcon = /* @__PURE__ */ icon(ArrowDown)
export const ArrowLeftIcon = /* @__PURE__ */ icon(ArrowLeft)
export const ArrowRightIcon = /* @__PURE__ */ icon(ArrowRight)
export const ArrowUpIcon = /* @__PURE__ */ icon(ArrowUp)
export const ArticleIcon = /* @__PURE__ */ icon(BookOpenText)
export const AttachmentIcon = /* @__PURE__ */ icon(Paperclip)
export const AuthenticationIcon = /* @__PURE__ */ icon(Fingerprint)
export const BillingIcon = /* @__PURE__ */ icon(CreditCard)
export const BriefcaseIcon = /* @__PURE__ */ icon(Briefcase)
export const BucketIcon = /* @__PURE__ */ icon(PaintBucket)
export const BuildWorkflowIcon = /* @__PURE__ */ icon(Wrench)
export const CalendarIcon = /* @__PURE__ */ icon(Calendar)
export const CancelIcon = /* @__PURE__ */ icon(Ban)
export const CelebrateIcon = /* @__PURE__ */ icon(PartyPopper)
export const CertificateIcon = /* @__PURE__ */ icon(FileKey)
export const ChangesRequestedIcon = /* @__PURE__ */ icon(MessageSquareWarning)
export const ChartIcon = /* @__PURE__ */ icon(ChartLine)
export const ChatIcon = /* @__PURE__ */ icon(MessagesSquare)
export const CheckIcon = /* @__PURE__ */ icon(Check)
export const ChevronDoubleDownIcon = /* @__PURE__ */ icon(ChevronsDown)
export const ChevronDoubleUpIcon = /* @__PURE__ */ icon(ChevronsUp)
export const ChevronDownIcon = /* @__PURE__ */ icon(ChevronDown)
export const ChevronLeftIcon = /* @__PURE__ */ icon(ChevronLeft)
export const ChevronRightIcon = /* @__PURE__ */ icon(ChevronRight)
export const ChevronUpIcon = /* @__PURE__ */ icon(ChevronUp)
export const ClipboardCheckIcon = /* @__PURE__ */ icon(ClipboardCheck)
export const ClockIcon = /* @__PURE__ */ icon(Clock)
export const CloseIcon = /* @__PURE__ */ icon(X)
export const CloudIcon = /* @__PURE__ */ icon(Cloud)
export const ClusterIcon = /* @__PURE__ */ icon(Server)
export const CodeIcon = /* @__PURE__ */ icon(Code)
export const CollapseIcon = /* @__PURE__ */ icon(ChevronsDownUp)
export const ColumnsIcon = /* @__PURE__ */ icon(Columns3)
export const CommentIcon = /* @__PURE__ */ icon(MessageSquare)
export const CommitIcon = /* @__PURE__ */ icon(GitCommitHorizontal)
export const ComputeIcon = /* @__PURE__ */ icon(CloudCog)
export const ConnectIcon = /* @__PURE__ */ icon(PlugZap)
export const ContractIcon = /* @__PURE__ */ icon(FilePenLine)
export const CopyIcon = /* @__PURE__ */ icon(Copy)
export const CustomizeIcon = /* @__PURE__ */ icon(WandSparkles)
export const DesktopIcon = /* @__PURE__ */ icon(Monitor)
export const DestroyIcon = /* @__PURE__ */ icon(CloudOff)
export const DeviceIcon = /* @__PURE__ */ icon(MonitorSmartphone)
export const DirectoryIcon = /* @__PURE__ */ icon(BookUser)
export const DisableCostIcon = /* @__PURE__ */ icon(BanknoteX)
export const DisableUserIcon = /* @__PURE__ */ icon(UserX)
export const DisconnectIcon = /* @__PURE__ */ icon(Unplug)
export const DiskIcon = /* @__PURE__ */ icon(HardDrive)
export const DisplayIcon = /* @__PURE__ */ icon(Settings2)
export const DownloadIcon = /* @__PURE__ */ icon(Download)
export const DragHandleIcon = /* @__PURE__ */ icon(GripHorizontal)
export const DuplicateIcon = /* @__PURE__ */ icon(CopyPlus)
export const EditIcon = /* @__PURE__ */ icon(Pencil)
export const EditorIcon = /* @__PURE__ */ icon(SquareCode)
export const EducationIcon = /* @__PURE__ */ icon(GraduationCap)
export const EnableCostIcon = /* @__PURE__ */ icon(CircleDollarSign)
export const EnableUserIcon = /* @__PURE__ */ icon(UserCheck)
export const EndpointIcon = /* @__PURE__ */ icon(Earth)
export const ErrorIcon = /* @__PURE__ */ icon(CircleAlert)
export const EventsIcon = /* @__PURE__ */ icon(Logs)
export const ExpandIcon = /* @__PURE__ */ icon(Maximize)
export const ExpandVerticalIcon = /* @__PURE__ */ icon(ChevronsUpDown)
export const ExpiredIcon = /* @__PURE__ */ icon(CalendarX)
export const ExpiringIcon = /* @__PURE__ */ icon(Hourglass)
export const ExpressionIcon = /* @__PURE__ */ icon(Braces)
export const ExternalLinkIcon = /* @__PURE__ */ icon(ExternalLink)
export const EyeIcon = /* @__PURE__ */ icon(Eye)
export const EyeOffIcon = /* @__PURE__ */ icon(EyeOff)
export const FailIcon = /* @__PURE__ */ icon(CircleX)
export const FavoriteIcon = /* @__PURE__ */ icon(Heart, filled)
export const FavoriteOutlineIcon = /* @__PURE__ */ icon(Heart)
export const FeaturedIcon = /* @__PURE__ */ icon(Star)
export const FileIcon = /* @__PURE__ */ icon(File)
export const FilesIcon = /* @__PURE__ */ icon(Files)
export const FilesystemIcon = /* @__PURE__ */ icon(Folders)
export const FileTextIcon = /* @__PURE__ */ icon(FileText)
export const FilterClearIcon = /* @__PURE__ */ icon(FunnelX)
export const FilterIcon = /* @__PURE__ */ icon(Funnel)
export const FlaggedIcon = /* @__PURE__ */ icon(Flag)
export const FlaskIcon = /* @__PURE__ */ icon(FlaskConical)
export const FolderIcon = /* @__PURE__ */ icon(Folder)
export const FolderOpenIcon = /* @__PURE__ */ icon(FolderOpen)
export const FolderTreeIcon = /* @__PURE__ */ icon(FolderTree)
export const ForbiddenIcon = /* @__PURE__ */ icon(CircleSlash)
export const ForkIcon = /* @__PURE__ */ icon(GitFork)
export const GearsIcon = /* @__PURE__ */ icon(Cog)
export const GlobeIcon = /* @__PURE__ */ icon(Globe)
export const GovernmentIcon = /* @__PURE__ */ icon(Landmark)
export const GraphIcon = /* @__PURE__ */ icon(Network)
export const GridIcon = /* @__PURE__ */ icon(LayoutGrid)
export const HealthMonitoringIcon = /* @__PURE__ */ icon(Activity)
export const HelpIcon = /* @__PURE__ */ icon(CircleHelp)
export const HistoryIcon = /* @__PURE__ */ icon(History)
export const HomeIcon = /* @__PURE__ */ icon(House)
export const IdCardIcon = /* @__PURE__ */ icon(IdCard)
export const ImageIcon = /* @__PURE__ */ icon(FileImage)
export const ImpersonateIcon = /* @__PURE__ */ icon(HatGlasses)
export const InboxIcon = /* @__PURE__ */ icon(Inbox)
export const IndexIcon = /* @__PURE__ */ icon(DatabaseSearch)
export const InfoIcon = /* @__PURE__ */ icon(Info)
export const InfrastructureLayersIcon = /* @__PURE__ */ icon(Layers)
export const InputFormIcon = /* @__PURE__ */ icon(TextCursorInput)
export const InstallIcon = /* @__PURE__ */ icon(MonitorDown)
export const InstanceIcon = /* @__PURE__ */ icon(PcCase)
export const InstanceTypeIcon = /* @__PURE__ */ icon(MemoryStick)
export const IpAddressIcon = /* @__PURE__ */ icon(MapPinned)
export const IssueIcon = /* @__PURE__ */ icon(CircleDot)
export const JobIcon = /* @__PURE__ */ icon(ListTodo)
export const JsonIcon = /* @__PURE__ */ icon(FileJson)
export const KeyboardIcon = /* @__PURE__ */ icon(Keyboard)
export const KeyIcon = /* @__PURE__ */ icon(Key)
export const KubernetesNamespaceIcon = /* @__PURE__ */ icon(SquareDashed)
export const LanguageIcon = /* @__PURE__ */ icon(Languages)
export const LegalIcon = /* @__PURE__ */ icon(Scale)
export const LibraryIcon = /* @__PURE__ */ icon(LibraryBig)
export const LicenseIcon = /* @__PURE__ */ icon(BadgeCheck)
export const LinkIcon = /* @__PURE__ */ icon(Link)
export const ListViewIcon = /* @__PURE__ */ icon(List)
export const LockIcon = /* @__PURE__ */ icon(Lock)
export const MachineImageIcon = /* @__PURE__ */ icon(Disc3)
export const MailFailedIcon = /* @__PURE__ */ icon(MailX)
export const MailIcon = /* @__PURE__ */ icon(Mail)
export const MailVerifiedIcon = /* @__PURE__ */ icon(MailCheck)
export const MapPinIcon = /* @__PURE__ */ icon(MapPin)
export const MarketplaceIcon = /* @__PURE__ */ icon(Store)
export const MatrixIcon = /* @__PURE__ */ icon(Grid3x3)
export const MegaphoneIcon = /* @__PURE__ */ icon(Megaphone)
export const MFAIcon = /* @__PURE__ */ icon(Smartphone)
export const MigrationIcon = /* @__PURE__ */ icon(DatabaseZap)
export const MinimizeIcon = /* @__PURE__ */ icon(Minimize2)
export const MinusIcon = /* @__PURE__ */ icon(Minus)
export const MlIcon = /* @__PURE__ */ icon(BrainCircuit)
export const MoneyIcon = /* @__PURE__ */ icon(DollarSign)
export const MoonIcon = /* @__PURE__ */ icon(Moon)
export const MoreIcon = /* @__PURE__ */ icon(Ellipsis)
export const MusicIcon = /* @__PURE__ */ icon(Music)
export const MuteIcon = /* @__PURE__ */ icon(BellOff)
export const NavigationIcon = /* @__PURE__ */ icon(Menu)
export const NetworkInterfaceIcon = /* @__PURE__ */ icon(EthernetPort)
export const NewChatIcon = /* @__PURE__ */ icon(SquarePen)
export const NodeIcon = /* @__PURE__ */ icon(Cpu)
export const NotebookIcon = /* @__PURE__ */ icon(NotebookText)
export const NotificationIcon = /* @__PURE__ */ icon(Bell)
export const NotRunningIcon = /* @__PURE__ */ icon(Circle)
export const OnboardingIcon = /* @__PURE__ */ icon(Flag)
export const OpenInNewGraphIcon = /* @__PURE__ */ icon(CornerUpRight)
export const OrganizationIcon = /* @__PURE__ */ icon(Building2)
export const PartnerIcon = /* @__PURE__ */ icon(Handshake)
export const PasswordIcon = /* @__PURE__ */ icon(KeyRound)
export const PauseIcon = /* @__PURE__ */ icon(Pause)
export const PdfIcon = /* @__PURE__ */ icon(FileType)
export const PendingIcon = /* @__PURE__ */ icon(Circle)
export const PhoneIcon = /* @__PURE__ */ icon(Phone)
export const PieChartIcon = /* @__PURE__ */ icon(ChartPie)
export const PinFilledIcon = /* @__PURE__ */ icon(Pin, filled)
export const PinIcon = /* @__PURE__ */ icon(Pin)
export const PowerIcon = /* @__PURE__ */ icon(Power)
export const PowershellIcon = /* @__PURE__ */ icon(SquareChevronRight)
export const PreviewIcon = /* @__PURE__ */ icon(ScanEye)
export const PrintIcon = /* @__PURE__ */ icon(Printer)
export const ProjectIcon = /* @__PURE__ */ icon(FolderKanban)
export const PublishIcon = /* @__PURE__ */ icon(Rocket)
export const PullRequestIcon = /* @__PURE__ */ icon(GitPullRequest)
export const QRCodeIcon = /* @__PURE__ */ icon(QrCode)
export const QueueIcon = /* @__PURE__ */ icon(ListOrdered)
export const QuotaIcon = /* @__PURE__ */ icon(Gauge)
export const RedoIcon = /* @__PURE__ */ icon(Redo2)
export const RefreshIcon = /* @__PURE__ */ icon(RefreshCw)
export const RemoveIcon = /* @__PURE__ */ icon(X)
export const RemoveUserIcon = /* @__PURE__ */ icon(UserMinus)
export const RenameIcon = /* @__PURE__ */ icon(PencilLine)
export const RenewIcon = /* @__PURE__ */ icon(CalendarSync)
export const ResetLayoutIcon = /* @__PURE__ */ icon(RotateCcwSquare)
export const ResourceGroupIcon = /* @__PURE__ */ icon(Group)
export const ResourceIcon = /* @__PURE__ */ icon(Boxes)
export const RetryIcon = /* @__PURE__ */ icon(RotateCcw)
export const RoleIcon = /* @__PURE__ */ icon(ShieldUser)
export const RollbackIcon = /* @__PURE__ */ icon(UndoDot)
export const RunningIcon = /* @__PURE__ */ icon(LoaderCircle)
export const RunsIcon = /* @__PURE__ */ icon(ListVideo)
export const RunWorkflowIcon = /* @__PURE__ */ icon(CirclePlay)
export const SaveIcon = /* @__PURE__ */ icon(Save)
export const SchedulerIcon = /* @__PURE__ */ icon(CalendarClock)
export const ScriptIcon = /* @__PURE__ */ icon(FileCode)
export const SearchIcon = /* @__PURE__ */ icon(Search)
export const SendIcon = /* @__PURE__ */ icon(Send)
export const ServiceIcon = /* @__PURE__ */ icon(Waypoints)
export const SessionIcon = /* @__PURE__ */ icon(MonitorPlay)
export const SettingsIcon = /* @__PURE__ */ icon(Settings)
export const ShareIcon = /* @__PURE__ */ icon(Share2)
export const ShieldIcon = /* @__PURE__ */ icon(Shield)
export const ShieldOffIcon = /* @__PURE__ */ icon(ShieldOff)
export const ShrinkIcon = /* @__PURE__ */ icon(Minimize)
export const SidebarCloseIcon = /* @__PURE__ */ icon(PanelLeftClose)
export const SidebarIcon = /* @__PURE__ */ icon(PanelLeft)
export const SidebarOpenIcon = /* @__PURE__ */ icon(PanelLeftOpen)
export const SignInIcon = /* @__PURE__ */ icon(LogIn)
export const SignOutIcon = /* @__PURE__ */ icon(LogOut)
export const SkipIcon = /* @__PURE__ */ icon(CircleMinus)
export const SnapshotIcon = /* @__PURE__ */ icon(Camera)
export const SortDownIcon = /* @__PURE__ */ icon(ArrowDownWideNarrow)
export const SortUnsortedIcon = /* @__PURE__ */ icon(ArrowUpDown)
export const SortUpIcon = /* @__PURE__ */ icon(ArrowUpNarrowWide)
export const SparklesIcon = /* @__PURE__ */ icon(Sparkles)
export const SplitIcon = /* @__PURE__ */ icon(SquareSplitHorizontal)
export const SpreadsheetIcon = /* @__PURE__ */ icon(Sheet)
export const StartIcon = /* @__PURE__ */ icon(Play)
export const StopIcon = /* @__PURE__ */ icon(Square)
export const StorageIcon = /* @__PURE__ */ icon(Database)
export const SubdomainIcon = /* @__PURE__ */ icon(AtSign)
export const SuccessIcon = /* @__PURE__ */ icon(CircleCheck)
export const SummaryIcon = /* @__PURE__ */ icon(ScrollText)
export const SunIcon = /* @__PURE__ */ icon(Sun)
export const SupportIcon = /* @__PURE__ */ icon(Headset)
export const SwapIcon = /* @__PURE__ */ icon(ArrowLeftRight)
export const TagIcon = /* @__PURE__ */ icon(Tag)
export const TerminalIcon = /* @__PURE__ */ icon(Terminal)
export const ThinkingIcon = /* @__PURE__ */ icon(Brain)
export const TodoIcon = /* @__PURE__ */ icon(ClipboardPen)
export const ToolsIcon = /* @__PURE__ */ icon(Wrench)
export const TrashIcon = /* @__PURE__ */ icon(Trash2)
export const TunnelIcon = /* @__PURE__ */ icon(Route)
export const UndoIcon = /* @__PURE__ */ icon(Undo2)
export const UnfavoriteIcon = /* @__PURE__ */ icon(HeartOff)
export const UnlinkIcon = /* @__PURE__ */ icon(Unlink)
export const UnmuteIcon = /* @__PURE__ */ icon(BellRing)
export const UploadIcon = /* @__PURE__ */ icon(Upload)
export const UserIcon = /* @__PURE__ */ icon(User)
export const UsersIcon = /* @__PURE__ */ icon(Users)
export const UserWorkspaceIcon = /* @__PURE__ */ icon(SquareTerminal)
export const VideoIcon = /* @__PURE__ */ icon(Video)
export const WarningIcon = /* @__PURE__ */ icon(TriangleAlert)
export const WebhookIcon = /* @__PURE__ */ icon(Webhook)
export const ZapIcon = /* @__PURE__ */ icon(Zap)
export const ZipIcon = /* @__PURE__ */ icon(FileArchive)
export const ZoomInIcon = /* @__PURE__ */ icon(ZoomIn)
export const ZoomOutIcon = /* @__PURE__ */ icon(ZoomOut)
export { ErrorCheckmark, SuccessCheckmark } from './components/StatusIcons'
