import { type DragEvent, useCallback, useRef, useState } from 'react'

interface UseDragDropOptions {
  onFilesDropped: (files: FileList) => void
}

export default function useDragDrop({ onFilesDropped }: UseDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragging(false)

      if (e.dataTransfer.files.length > 0) {
        onFilesDropped(e.dataTransfer.files)
      }
    },
    [onFilesDropped],
  )

  return {
    isDragging,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  }
}
