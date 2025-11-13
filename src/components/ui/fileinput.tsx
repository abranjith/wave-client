import { PaperclipIcon, UploadIcon, XIcon } from "lucide-react"
import { FileWithPreview, useFileUpload } from "../../hooks/useFileUpload"
import { Button } from './button';
import Banner from "./banner";

export interface FileInputProps {
  onFilesAdded?: (addedFiles: FileWithPreview[]) => void;
  onFileRemoved?: (removedFile: FileWithPreview) => void;
  initialFiles?: FileWithPreview[];
}

//Accept props onFilesRemoved and onFilesAdded to notify parent component when files are added or removed.
function FileInput({ onFilesAdded, onFileRemoved, initialFiles }: FileInputProps) {
  const [
    { files, isDragging, errors },
    {
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
      getInputProps,
    },
  ] = useFileUpload({ onFilesAdded, onFileRemoved, initialFiles, multiple: false })

  const file = files[0]

  return (
    <>
      {/* Drop area */}
      {!Boolean(file) && (<div
        role="button"
        onClick={openFileDialog}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-input hover:bg-accent/50 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-4 transition-colors ${
          isDragging ? 'bg-accent/50' : ''
        } ${
          file ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <input
          {...getInputProps()}
          className="sr-only"
          aria-label="Upload file"
          disabled={Boolean(file)}
        />

        <div className="flex flex-col items-center justify-center text-center">
          <div
            className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
            aria-hidden="true"
          >
            <UploadIcon className="size-4 opacity-60 text-slate-500 dark:text-slate-500" />
          </div>
          <p className="mb-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">Upload file</p>
          <p className="text-muted-foreground text-xs text-slate-500 dark:text-slate-400">
            Drag & drop or click to browse
          </p>
        </div>
      </div>)}

      {/* Error messages */}
      {errors.length > 0 && (
        <Banner message={errors.join(", ")} messageType="error" />
      )}

      {/* File list */}
      {file && (
        <div className="space-y-2">
          <div
            key={file.id}
            className="flex items-center justify-between gap-2 rounded-xl border px-4 py-2"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <PaperclipIcon
                className="text-blue-600 dark:text-blue-400 size-4 shrink-0 opacity-60"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-[13px] text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {file.file.name}
                </p>
              </div>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground/80 hover:text-foreground -me-2 size-8 hover:bg-transparent"
              onClick={() => removeFile(file?.id)}
              aria-label="Remove file"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export { FileInput }