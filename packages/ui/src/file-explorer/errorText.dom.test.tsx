// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { cloudErrorKind, ShownError, useErrorText } from './errorText'
import { FileExplorerProvider } from './FileExplorerContext'

const withHost =
  (errorMessage?: (error: unknown) => string | undefined) =>
  ({ children }: { children: ReactNode }) => (
    <FileExplorerProvider errorMessage={errorMessage}>{children}</FileExplorerProvider>
  )

const s3Error = (name: string, status: number, message: string) =>
  Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } })

describe('cloudErrorKind', () => {
  it('names an S3 refusal by its code, then by its status', () => {
    expect(cloudErrorKind(s3Error('AccessDenied', 403, 'Access Denied'))).toBe('accessDenied')
    expect(cloudErrorKind(s3Error('NoSuchBucket', 404, 'The bucket does not exist'))).toBe(
      'notFound',
    )
    expect(cloudErrorKind(s3Error('ExpiredToken', 400, 'expired'))).toBe('credentials')
    expect(cloudErrorKind(s3Error('SlowDown', 503, 'slow down'))).toBe('throttled')
    expect(cloudErrorKind(s3Error('UnknownError', 403, 'nope'))).toBe('accessDenied')
  })

  it("names an Azure RestError by its code and an axios error by its response's status", () => {
    const azure = Object.assign(new Error('This request is not authorized'), {
      name: 'RestError',
      code: 'AuthorizationPermissionMismatch',
      statusCode: 403,
    })
    expect(cloudErrorKind(azure)).toBe('accessDenied')
    expect(cloudErrorKind({ isAxiosError: true, response: { status: 401 } })).toBe('credentials')
    expect(cloudErrorKind({ isAxiosError: true })).toBe('network')
    expect(cloudErrorKind(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('never reads the message, and leaves an API error to the host', () => {
    expect(cloudErrorKind(new Error('AccessDenied: not authorized'))).toBeUndefined()
    expect(cloudErrorKind({ status: 403, code: 'forbidden', type: '/problems/forbidden' })).toBe(
      undefined,
    )
  })
})

describe('useErrorText', () => {
  it("gives the explorer's own message as the reason, with nothing more", () => {
    const { result } = renderHook(() => useErrorText(), { wrapper: withHost() })
    expect(result.current(new ShownError('Couldn’t connect'))).toEqual({
      reason: 'Couldn’t connect',
    })
  })

  it("names a storage refusal and keeps the error's own text as detail", () => {
    const { result } = renderHook(() => useErrorText(), { wrapper: withHost(() => 'host') })
    expect(result.current(s3Error('AccessDenied', 403, 'User: arn:aws:iam::1:user/x'))).toEqual({
      reason: 'You don’t have access to this storage',
      detail: 'User: arn:aws:iam::1:user/x',
    })
  })

  it("gives the host's words for an error it knows, such as an API error", () => {
    const { result } = renderHook(() => useErrorText(), {
      wrapper: withHost(() => 'You can’t open this folder.'),
    })
    expect(result.current({ status: 403, code: 'forbidden' })).toEqual({
      reason: 'You can’t open this folder.',
    })
  })

  it("keeps any other error's own text as detail, with no reason for the place to fill", () => {
    const { result } = renderHook(() => useErrorText(), { wrapper: withHost(() => undefined) })
    expect(result.current(new Error('socket hang up'))).toEqual({ detail: 'socket hang up' })
  })
})
