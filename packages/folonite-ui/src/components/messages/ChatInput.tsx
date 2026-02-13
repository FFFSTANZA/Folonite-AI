import React, { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, Attachment01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface FileWithBase64 {
  name: string;
  base64: string;
  type: string;
  size: number;
}

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onFileUpload?: (files: FileWithBase64[]) => void;
  minLines?: number;
  placeholder?: string;
}

export function ChatInput({
  input,
  isLoading,
  onInputChange,
  onSend,
  onFileUpload,
  minLines = 1,
  placeholder = "Give Folonite a task to work on...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileWithBase64[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB per file in bytes

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMessage("");

    // Check max files limit
    if (selectedFiles.length + files.length > MAX_FILES) {
      setErrorMessage(`Maximum ${MAX_FILES} files allowed`);
      e.target.value = '';
      return;
    }


    // Check individual file sizes
    const oversizedFiles: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(`${file.name} (${formatFileSize(file.size)})`);
      }
    }

    if (oversizedFiles.length > 0) {
      setErrorMessage(`File(s) exceed 30MB limit: ${oversizedFiles.join(', ')}`);
      e.target.value = '';
      return;
    }

    const newFiles: FileWithBase64[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await convertToBase64(file);

      newFiles.push({
        name: file.name,
        base64: base64,
        type: file.type,
        size: file.size,
      });
    }

    const updatedFiles = [...selectedFiles, ...newFiles];
    setSelectedFiles(updatedFiles);

    if (onFileUpload) {
      onFileUpload(updatedFiles);
    }

    // Reset the input
    e.target.value = '';
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const removeFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    setErrorMessage("");

    if (onFileUpload) {
      onFileUpload(updatedFiles);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";

    // Calculate minimum height based on minLines
    const lineHeight = 24; // approximate line height in pixels
    const minHeight = lineHeight * minLines + 24; // + padding

    // Set height to scrollHeight or minHeight, whichever is larger
    const newHeight = Math.max(textarea.scrollHeight, minHeight);
    textarea.style.height = `${newHeight}px`;
  }, [input, minLines]);



  return (
    <div className="w-full max-w-3xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="*/*"
      />

      {errorMessage && (
        <div className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 border border-red-500/20">
          {errorMessage}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="mb-3 px-1">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{selectedFiles.length} / {MAX_FILES} files</span>
            <span>Max 30MB per file</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm text-foreground ring-1 ring-white/10"
              >
                <span className="max-w-[200px] truncate bg-transparent">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="rounded-full p-0.5 hover:bg-white/10 transition-colors"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    className="h-3 w-3 text-muted-foreground"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative group">
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          className={cn(
            "w-full rounded-[26px] py-4 pr-24 pl-5",
            "bg-secondary/50 border border-white/5 text-foreground placeholder:text-muted-foreground/50",
            "focus:outline-none focus:ring-1 focus:ring-white/10 focus:bg-secondary/80",
            "resize-none overflow-hidden min-h-[56px] transition-all duration-200 ease-in-out",
            "shadow-lg hover:shadow-xl hover:bg-secondary/60",
            "text-base md:text-[15px] leading-relaxed"
          )}
          disabled={isLoading}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <div className={`absolute right-2 bottom-2 flex items-center gap-2 bg-transparent p-1`}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 cursor-pointer rounded-full hover:bg-white/10 text-muted-foreground transition-all"
            onClick={triggerFileInput}
            disabled={isLoading}
          >
            <HugeiconsIcon
              icon={Attachment01Icon}
              className="h-5 w-5"
            />
          </Button>

          {isLoading ? (
            <div className="h-9 w-9 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : (
            <Button
              type="submit"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full transition-all duration-200 shadow-sm flex items-center justify-center",
                input.trim()
                  ? "bg-white text-black hover:bg-gray-200"
                  : "bg-white/10 text-white/50 cursor-not-allowed"
              )}
              disabled={isLoading || !input.trim()}
            >
              <HugeiconsIcon
                icon={ArrowRight02Icon}
                className="h-5 w-5"
              />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
