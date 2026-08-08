'use client';
/**
 * Avatar selection with client-side downscaling.
 *
 * Images are resized in the browser before upload rather than rejecting large
 * files: a phone camera photo is several megabytes, and telling someone to go
 * find image editing software is a dead end. Downscaling to 256px produces a
 * few tens of kilobytes, which comfortably fits the storage limit and is more
 * than enough for an avatar that renders at 96px.
 *
 * The result is a data URI stored inline in the database. That is a deliberate
 * trade: object storage would scale better, but it adds a bucket, credentials
 * and a signed-upload flow. At avatar sizes, inline storage is simpler and has
 * no external dependency to misconfigure.
 */
import { useCallback, useRef, useState } from 'react';

/** Rendered avatars are ~96px; 256 covers high-DPI displays with headroom. */
const MAX_DIMENSION = 256;

/** JPEG quality. 0.85 is visually clean while roughly halving the size of 1.0. */
const JPEG_QUALITY = 0.85;

/** Reject before decoding: a 50MB file should not be loaded into memory first. */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Draw an image file to a square canvas, cropped to centre, and return a data URI.
 *
 * Centre-cropping rather than stretching: avatars are displayed in a circle, and
 * a squashed face is worse than one with the edges trimmed.
 */
async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = url;
    });

    const side = Math.min(image.width, image.height);
    const sx = (image.width - side) / 2;
    const sy = (image.height - side) / 2;
    const target = Math.min(side, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable in this browser.');

    // Flatten onto white: transparent PNGs would otherwise become black once
    // encoded as JPEG, which looks like corruption rather than a design choice.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target, target);
    ctx.drawImage(image, sx, sy, side, side, 0, 0, target, target);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface AvatarPickerProps {
  value: string;
  onChange: (dataUri: string) => void;
  /** Fallback initials or address shown when there is no image. */
  fallback: string;
  disabled?: boolean;
}

export function AvatarPicker({ value, onChange, fallback, disabled }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);

      if (!ACCEPTED.includes(file.type)) {
        setError('Choose a JPEG, PNG, WebP or GIF image.');
        return;
      }
      if (file.size > MAX_INPUT_BYTES) {
        setError('That image is very large. Choose one under 10MB.');
        return;
      }

      setBusy(true);
      try {
        onChange(await downscale(file));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That image could not be processed.');
      } finally {
        setBusy(false);
        // Clear the input so re-picking the same file fires change again.
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onChange]
  );

  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        <div className="h-24 w-24 overflow-hidden rounded-full bg-surface-raised ring-2 ring-hairline">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, no loader benefit
            <img src={value} alt="Your avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-ink-muted">
              {fallback}
            </div>
          )}
        </div>
        {/* Sits over an arbitrary user image, so the scrim has to be a real
            surface rather than a wash — otherwise the label competes with
            whatever the photo happens to be. */}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-surface-card/80 text-xs text-ink-secondary">
            Resizing…
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="rounded-lg border border-hairline bg-surface-raised px-3 py-1.5 text-sm text-ink-primary transition hover:border-hairline hover:bg-surface-hover/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {value ? 'Change' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setError(null);
              }}
              disabled={disabled || busy}
              className="rounded-lg border border-transparent px-3 py-1.5 text-sm text-ink-secondary transition hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-ink-muted">Square works best. Resized to 256px automatically.</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
