import {
  type ChangeEvent,
  type DragEvent,
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { mutate } from 'swr'
import { useStrings } from '../../components/Provider'
import { toast } from '../../components/Toast'
import { cx } from '../../cx'
import { formatBytes } from '../../format'
import { AddIcon, FileIcon, ImageIcon, PdfIcon, TrashIcon, WarningIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { ATTACHMENTS_INFINITE_KEY } from './attachmentKeys'

export interface AttachmentUploadHandle {
  addFiles: (files: FileList | File[]) => void
}

export interface Attachment {
  id?: string
  file?: File
  filename: string
  mimeType: string
  size: number
  uploading?: boolean
  uploaded?: boolean
  error?: string
  url?: string
}

interface AttachmentUploadProps {
  conversationId?: string | undefined
  attachments: Attachment[]
  /** The list with a change. Keep its entries as given: an upload's result
   *  replaces its pending entry by identity, on the list as it is when the
   *  upload finishes. */
  onAttachmentsChange: (attachments: Attachment[]) => void
  disabled?: boolean
  maxFiles?: number
  maxFileSize?: number // in bytes
  ref?: Ref<AttachmentUploadHandle> | undefined
}

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const DEFAULT_MAX_FILES = 10

function getFileIcon(mimeType: string | undefined) {
  if (!mimeType) {
    return FileIcon
  }
  if (mimeType.startsWith('image/')) {
    return ImageIcon
  }
  if (mimeType === 'application/pdf') {
    return PdfIcon
  }
  return FileIcon
}

export default function AttachmentUpload({
  conversationId,
  attachments,
  onAttachmentsChange,
  disabled = false,
  maxFiles = DEFAULT_MAX_FILES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  ref,
}: AttachmentUploadProps) {
  const { adapter } = useChat()
  const t = useChatConfig().strings.attachmentUpload
  const { common } = useStrings()
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The list as it stands now: the one last rendered, or the one this
  // component last handed up that the host hasn't rendered yet. An upload
  // finishes long after it starts, and its result belongs on the list as it is
  // then, with whatever was removed or added meanwhile, not as it was when the
  // upload began.
  const latest = useRef(attachments)
  useLayoutEffect(() => {
    latest.current = attachments
  }, [attachments])
  const commit = useCallback(
    (next: Attachment[]) => {
      latest.current = next
      onAttachmentsChange(next)
    },
    [onAttachmentsChange],
  )

  const uploadFile = useCallback(
    async (file: File): Promise<Attachment> => {
      const failed = (error: string): Attachment => ({
        file,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        error,
      })
      if (!adapter.attachments) {
        // Said on the file rather than dropping it, so the person knows it
        // won't be sent.
        return failed(t.uploadUnavailable)
      }
      try {
        const uploaded = await adapter.attachments.upload(file, conversationId)
        // The attachments page lists everything the user has uploaded, so it
        // has to pick up a file uploaded from the chat input without a reload.
        await mutate(ATTACHMENTS_INFINITE_KEY)
        return {
          id: uploaded.id,
          filename: uploaded.filename,
          mimeType: uploaded.contentType,
          size: uploaded.size,
          uploaded: true,
        }
      } catch (error) {
        return failed(error instanceof Error ? error.message : String(error))
      }
    },
    [adapter, conversationId, t],
  )

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pending: Attachment[] = []
      // Counted down across the batch, so one drop can't exceed the limit.
      let room = maxFiles - latest.current.length
      let overLimit = false
      for (const file of Array.from(files)) {
        if (file.size > maxFileSize) {
          toast.error(t.fileTooLarge(formatBytes(maxFileSize)))
          continue
        }
        if (room <= 0) {
          overLimit = true
          continue
        }
        room--
        pending.push({
          file,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          uploading: true,
        })
      }
      if (overLimit) {
        toast.error(t.maxFilesAllowed(maxFiles))
      }
      if (pending.length === 0) {
        return
      }
      commit([...latest.current, ...pending])

      const results = await Promise.all(pending.map((a) => uploadFile(a.file as File)))
      // Each pending entry becomes its result where it stands now; one removed
      // while it uploaded stays removed.
      const resultOf = new Map(pending.map((a, i) => [a, results[i]]))
      commit(latest.current.map((a) => resultOf.get(a) ?? a))
    },
    [commit, maxFileSize, maxFiles, t, uploadFile],
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles],
  )

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files)
      }
      // Reset input
      e.target.value = ''
    },
    [handleFiles],
  )

  const handleRemove = useCallback(
    (attachment: Attachment) => {
      commit(latest.current.filter((a) => a !== attachment))
    },
    [commit],
  )

  // Expose addFiles method to parent
  useImperativeHandle(
    ref,
    () => ({
      addFiles: handleFiles,
    }),
    [handleFiles],
  )

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        disabled={disabled}
        className="hidden"
        accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
      />
      <div className="space-y-2">
        {/* Attachment List */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => {
              const Icon = getFileIcon(attachment.mimeType)
              return (
                <div
                  key={attachment.id || index}
                  className={cx(
                    'flex items-center gap-2 px-2 py-1 rounded border theme-border theme-muted-panel',
                    attachment.error && 'border-(--theme-error)',
                  )}
                >
                  <Icon className="w-4 h-4 theme-muted-text" />
                  <span className="text-sm truncate max-w-[150px] text-(--theme-app)">
                    {attachment.filename}
                  </span>
                  <span className="text-xs theme-muted-text">{formatBytes(attachment.size)}</span>
                  {attachment.uploading && (
                    <span className="text-xs theme-muted-text animate-pulse">{t.uploading}</span>
                  )}
                  {attachment.error && (
                    <span role="img" aria-label={attachment.error} title={attachment.error}>
                      <WarningIcon className="h-3.5 w-3.5 text-(--theme-error)" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(attachment)}
                    className="p-0.5 rounded hover:bg-(--theme-error-muted)"
                    title={common.remove}
                    disabled={disabled}
                  >
                    <TrashIcon className="w-3 h-3 text-(--theme-error)" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Drop Zone / Add Button */}
        <button
          type="button"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cx(
            'relative block w-full border-2 border-dashed rounded-lg p-3 text-center transition-colors',
            isDragging
              ? 'border-(--theme-accent) bg-(--theme-accent)/10'
              : 'theme-border hover:theme-border',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          )}
          onClick={disabled ? undefined : handleClick}
        >
          <span className="flex items-center justify-center gap-2 text-sm theme-muted-text">
            <AddIcon className="w-4 h-4" />
            <span>{isDragging ? t.dropFilesHere : t.addFiles}</span>
          </span>
          <span className="block text-xs theme-muted-text mt-1">
            {t.maxSizePerFile(formatBytes(maxFileSize))}
          </span>
        </button>
      </div>
    </>
  )
}
