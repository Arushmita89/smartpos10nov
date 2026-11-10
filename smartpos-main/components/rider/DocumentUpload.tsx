'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const BUCKET = 'rider-documents';
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

interface DocumentUploadProps {
  label: string;
  folder: string;
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
}

function displayName(path: string) {
  const name = path.split('/').pop() || path;
  return name.replace(/-\d{10,}(\.[^.]+)$/, '$1');
}

export default function DocumentUpload({
  label,
  folder,
  value,
  onChange,
  disabled,
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error('Document must be 5MB or smaller');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const path = `${folder}/${safeLabel}-${Date.now()}.${ext}`;

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (error) throw error;
      onChange(path);
      toast.success(`${label} uploaded`);
    } catch (err: any) {
      console.error('Document upload error:', err);
      toast.error(err?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} *
      </label>

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <span className="flex min-w-0 items-center text-sm text-emerald-800">
            <FileText className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{displayName(value)}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled || uploading}
            className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            title="Remove document"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 transition-colors hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload image or PDF (max 5MB)
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleSelect}
        className="hidden"
      />
    </div>
  );
}
