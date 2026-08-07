'use client'

import { useCallback, useId, useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InlineAlert } from '@/components/ui/InlineAlert'

type FileDropzoneProps = {
  accept?: string
  multiple?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  error?: string | null
  onFiles: (files: File[]) => void
  className?: string
}

/**
 * FileDropzone — upload único do DS (Sprint 0 / IX-UPLOAD).
 */
export function FileDropzone({
  accept,
  multiple = false,
  disabled = false,
  label = 'Arraste um arquivo ou clique para selecionar',
  hint,
  error,
  onFiles,
  className,
}: FileDropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const emit = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return
      const files = Array.from(list)
      onFiles(multiple ? files : files.slice(0, 1))
    },
    [multiple, onFiles],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    emit(e.dataTransfer.files)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    emit(e.target.files)
    e.target.value = ''
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
          dragging
            ? 'border-brand bg-[var(--color-info-bg)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-soft)]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <Upload className="size-5 text-fg-subtle" aria-hidden />
        <span className="text-body text-fg">{label}</span>
        {hint ? <span className="text-caption text-fg-subtle">{hint}</span> : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={onChange}
        />
      </label>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
    </div>
  )
}
