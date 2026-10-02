import cx from 'classnames'
import {
  type ChangeEvent,
  type DragEvent,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { mutate } from 'swr'
import { AddIcon, FileSolidIcon, ImageSolidIcon, PdfSolidIcon, TrashIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { formatFileSize } from '../utils'
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
  onAttachmentsChange: (attachments: Attachment[]) => void
  disabled?: boolean
  maxFiles?: number
  maxFileSize?: number // in bytes
}

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const DEFAULT_MAX_FILES = 10

function getFileIcon(mimeType: string | undefined) {
  if (!mimeType) {
    return FileSolidIcon
  }
  if (mimeType.startsWith('image/')) {
    return ImageSolidIcon
  }
  if (mimeType === 'application/pdf') {
    return PdfSolidIcon
  }
  return FileSolidIcon
}

const AttachmentUpload = forwardRef<AttachmentUploadHandle, AttachmentUploadProps>(
  function AttachmentUpload(
    {
      conversationId,
      attachments,
      onAttachmentsChange,
      disabled = false,
      maxFiles = DEFAULT_MAX_FILES,
      maxFileSize = DEFAULT_MAX_FILE_SIZE,
    },
    ref,
  ) {
    const { adapter, notify } = useChat()
    const t = useChatConfig().strings.attachmentUpload
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const validateFile = useCallback(
      (file: File): string | null => {
        if (file.size > maxFileSize) {
          return t.fileTooLarge(formatFileSize(maxFileSize))
        }
        if (attachments.length >= maxFiles) {
          return t.maxFilesAllowed(maxFiles)
        }
        return null
      },
      [attachments.length, maxFileSize, maxFiles, t],
    )

    const uploadFile = useCallback(
      async (file: File): Promise<Attachment | null> => {
        if (!adapter.attachments) {
          return null
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
          return {
            file,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
      [adapter, conversationId],
    )

    const handleFiles = useCallback(
      async (files: FileList | File[]) => {
        const fileArray = Array.from(files)
        const newAttachments: Attachment[] = []

        for (const file of fileArray) {
          const error = validateFile(file)
          if (error) {
            notify.error(error)
            continue
          }

          // Add with uploading state
          const pendingAttachment: Attachment = {
            file,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            uploading: true,
          }
          newAttachments.push(pendingAttachment)
        }

        // Update immediately with pending state
        onAttachmentsChange([...attachments, ...newAttachments])

        // Upload files
        const uploaded = await Promise.all(
          newAttachments.map(async (a) => {
            if (a.file) {
              return uploadFile(a.file)
            }
            return a
          }),
        )

        // Replace pending with uploaded
        const finalAttachments = attachments.concat(
          uploaded.filter((a): a is Attachment => a !== null),
        )
        onAttachmentsChange(finalAttachments)
      },
      [attachments, notify, onAttachmentsChange, uploadFile, validateFile],
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
      (index: number) => {
        const updated = attachments.filter((_, i) => i !== index)
        onAttachmentsChange(updated)
      },
      [attachments, onAttachmentsChange],
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
                      attachment.error && 'border-red-500',
                    )}
                  >
                    <Icon className="w-4 h-4 theme-muted-text" />
                    <span className="text-sm truncate max-w-[150px] text-(--theme-app)">
                      {attachment.filename}
                    </span>
                    <span className="text-xs theme-muted-text">
                      {formatFileSize(attachment.size)}
                    </span>
                    {attachment.uploading && (
                      <span className="text-xs text-blue-500 animate-pulse">Uploading...</span>
                    )}
                    {attachment.error && (
                      <span className="text-xs text-red-500" title={attachment.error}>
                        ⚠️
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(index)}
                      className="p-0.5 rounded hover:bg-red-500/10"
                      title={t.remove}
                      disabled={disabled}
                    >
                      <TrashIcon className="w-3 h-3 text-red-500" />
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
              isDragging ? 'border-blue-500 bg-blue-500/10' : 'theme-border hover:theme-border',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            )}
            onClick={disabled ? undefined : handleClick}
          >
            <span className="flex items-center justify-center gap-2 text-sm theme-muted-text">
              <AddIcon className="w-4 h-4" />
              <span>{isDragging ? t.dropFilesHere : t.addFiles}</span>
            </span>
            <span className="block text-xs theme-muted-text mt-1">
              Max {formatFileSize(maxFileSize)} per file
            </span>
          </button>
        </div>
      </>
    )
  },
)

export default AttachmentUpload
