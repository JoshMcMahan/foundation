import { createContext, use, useCallback } from 'react'
import { CopyButton } from '../components/CopyButton'
import { useStrings } from '../components/Provider'
import { cx } from '../cx'

/** A failure the explorer describes itself, so its message is already in the reader's words. */
export class ShownError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShownError'
  }
}

/** The host's words for an error, such as a localized message for an API error's code. */
export type ErrorMessage = (error: unknown) => string | undefined

export const ErrorMessageContext = createContext<ErrorMessage | undefined>(undefined)

/** What went wrong: why, in the reader's words when that is known, and the error's own text. */
export interface Failure {
  /** The explorer's or the host's sentence, or the storage service's refusal by its code. */
  reason?: string | undefined
  /** The error's own text, from a storage service or the browser, shown as technical detail. */
  detail?: string | undefined
}

export type CloudErrorKind = 'accessDenied' | 'notFound' | 'credentials' | 'throttled' | 'network'

const NAMES: Record<string, CloudErrorKind> = {
  // Object stores' error codes, carried as the SDK error's `name` or `code`.
  AccessDenied: 'accessDenied',
  AllAccessDisabled: 'accessDenied',
  AuthorizationFailure: 'accessDenied',
  AuthorizationPermissionMismatch: 'accessDenied',
  AuthorizationResourceTypeMismatch: 'accessDenied',
  InsufficientAccountPermissions: 'accessDenied',
  NoSuchBucket: 'notFound',
  NoSuchKey: 'notFound',
  NotFound: 'notFound',
  ContainerNotFound: 'notFound',
  BlobNotFound: 'notFound',
  ShareNotFound: 'notFound',
  ResourceNotFound: 'notFound',
  ExpiredToken: 'credentials',
  ExpiredTokenException: 'credentials',
  InvalidAccessKeyId: 'credentials',
  InvalidToken: 'credentials',
  SignatureDoesNotMatch: 'credentials',
  TokenRefreshRequired: 'credentials',
  AuthenticationFailed: 'credentials',
  InvalidAuthenticationInfo: 'credentials',
  SlowDown: 'throttled',
  Throttling: 'throttled',
  ThrottlingException: 'throttled',
  TooManyRequestsException: 'throttled',
  RequestLimitExceeded: 'throttled',
  ServerBusy: 'throttled',
  // Network failures, as Node-style and axios codes and the browser's names.
  NetworkError: 'network',
  ERR_NETWORK: 'network',
  ECONNRESET: 'network',
  ECONNREFUSED: 'network',
  ETIMEDOUT: 'network',
  ENOTFOUND: 'network',
  TimeoutError: 'network',
}

const STATUSES: Record<number, CloudErrorKind> = {
  401: 'credentials',
  403: 'accessDenied',
  404: 'notFound',
  429: 'throttled',
  503: 'throttled',
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function byName(value: unknown): CloudErrorKind | undefined {
  return typeof value === 'string' ? NAMES[value] : undefined
}

function byStatus(value: unknown): CloudErrorKind | undefined {
  return typeof value === 'number' ? STATUSES[value] : undefined
}

/**
 * Why a storage service refused, from its SDK error's code or HTTP status, never from its
 * message: S3's `name` and `$metadata.httpStatusCode`, Azure's `RestError` `code` and
 * `statusCode`, an axios error's `response.status`, and a fetch that never got a response.
 * Undefined for anything else, such as an API error, which the host words.
 */
export function cloudErrorKind(error: unknown): CloudErrorKind | undefined {
  if (error instanceof TypeError) {
    return 'network'
  }
  const metadata = field(error, '$metadata')
  if (metadata !== undefined) {
    return (
      byName(field(error, 'name')) ??
      byName(field(error, 'Code')) ??
      byStatus(field(metadata, 'httpStatusCode'))
    )
  }
  if (field(error, 'name') === 'RestError') {
    return byName(field(error, 'code')) ?? byStatus(field(error, 'statusCode'))
  }
  if (field(error, 'isAxiosError') === true) {
    const response = field(error, 'response')
    return response === undefined ? 'network' : byStatus(field(response, 'status'))
  }
  return byName(field(error, 'name')) ?? byName(field(error, 'code'))
}

function ownText(error: unknown): string | undefined {
  const text =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
  return text?.trim() || undefined
}

/**
 * Returns what to show for an error. The reason is the explorer's own message, the storage
 * service's refusal named by its code, or the host's `errorMessage`, such as an API error's
 * localized message. The error's own text stays as detail unless the host has worded it, so
 * nothing the error said is lost; a place shows its own sentence when there is no reason.
 */
export function useErrorText(): (error: unknown) => Failure {
  const errorMessage = use(ErrorMessageContext)
  const t = useStrings().fileExplorer.messages.cloudErrors
  return useCallback(
    (error: unknown): Failure => {
      if (error instanceof ShownError) {
        return { reason: error.message }
      }
      const kind = cloudErrorKind(error)
      if (kind) {
        return { reason: t[kind], detail: ownText(error) }
      }
      const hosted = errorMessage?.(error)
      if (hosted) {
        return { reason: hosted }
      }
      return { detail: ownText(error) }
    },
    [errorMessage, t],
  )
}

/** A failure's sentence, then the error's own text as technical detail with a copy button. */
export function FailureText({
  summary,
  failure,
  className,
}: {
  /** The place's sentence, such as "Failed to generate download link", over the reason. */
  summary?: string | undefined
  failure: Failure
  className?: string | undefined
}) {
  return (
    <span className={cx('flex min-w-0 flex-col gap-1 text-left', className)}>
      {summary && <span>{summary}</span>}
      {failure.reason && <span>{failure.reason}</span>}
      {failure.detail && <FailureDetail detail={failure.detail} />}
    </span>
  )
}

/** A place's sentence around the reason, such as "Failed to delete item(s): …", then the
 *  error's own text. Without a reason, the storage service's generic one fills the sentence. */
export function FailureLine({
  failure,
  sentence,
}: {
  failure: Failure
  sentence: (reason: string) => string
}) {
  const t = useStrings().fileExplorer.messages
  return (
    <FailureText
      summary={sentence(failure.reason ?? t.cloudErrors.other)}
      failure={{ detail: failure.detail }}
    />
  )
}

/** The error's own text: muted, monospace and wrapped, with a button that copies it. */
export function FailureDetail({ detail }: { detail: string }) {
  const t = useStrings().fileExplorer.messages
  return (
    <span className="flex min-w-0 items-start gap-1 text-left">
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed theme-muted-text">
        {detail}
      </span>
      <CopyButton text={detail} label={t.errorDetail} size="xs" quiet className="shrink-0" />
    </span>
  )
}
