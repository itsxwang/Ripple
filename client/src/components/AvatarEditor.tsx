import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuCheck,
  LuImage,
  LuTrash2,
  LuUpload,
  LuX,
  LuZoomIn,
  LuZoomOut,
} from "react-icons/lu";
import { loadImage, readFileAsDataUrl } from "../lib/media";

const AVATAR_VIEW = 240;
const POSTER_W = 180;
const POSTER_H = 240;
const MAX_FILE = 10 * 1024 * 1024;

type CropTab = "avatar" | "poster";

interface AvatarEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (photos: { photo: string; photoFull: string }) => void;
  onRemove?: () => void;
}

interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

interface CropState {
  zoom: number;
  offset: { x: number; y: number };
}

const DEFAULT_CROP: CropState = { zoom: 1, offset: { x: 0, y: 0 } };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cropGeometry(
  image: LoadedImage | null,
  viewW: number,
  viewH: number,
  crop: CropState,
) {
  if (!image) {
    return { drawW: viewW, drawH: viewH, maxX: 0, maxY: 0, x: 0, y: 0 };
  }
  const cover = Math.max(viewW / image.width, viewH / image.height);
  const drawW = image.width * cover * crop.zoom;
  const drawH = image.height * cover * crop.zoom;
  const maxX = Math.max(0, (drawW - viewW) / 2);
  const maxY = Math.max(0, (drawH - viewH) / 2);
  return {
    drawW,
    drawH,
    maxX,
    maxY,
    x: clamp(crop.offset.x, -maxX, maxX),
    y: clamp(crop.offset.y, -maxY, maxY),
  };
}

function renderCrop(
  loaded: HTMLImageElement,
  image: LoadedImage,
  viewW: number,
  viewH: number,
  crop: CropState,
  outW: number,
  outH: number,
): string {
  const geometry = cropGeometry(image, viewW, viewH, crop);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const scale = outW / viewW;
  context.fillStyle = "#05070c";
  context.fillRect(0, 0, outW, outH);
  context.drawImage(
    loaded,
    ((viewW - geometry.drawW) / 2 + geometry.x) * scale,
    ((viewH - geometry.drawH) / 2 + geometry.y) * scale,
    geometry.drawW * scale,
    geometry.drawH * scale,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function AvatarEditor({
  open,
  onClose,
  onSave,
  onRemove,
}: AvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [tab, setTab] = useState<CropTab>("avatar");
  const [avatarCrop, setAvatarCrop] = useState<CropState>(DEFAULT_CROP);
  const [posterCrop, setPosterCrop] = useState<CropState>(DEFAULT_CROP);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const crop = tab === "avatar" ? avatarCrop : posterCrop;
  const setCrop = tab === "avatar" ? setAvatarCrop : setPosterCrop;
  const viewW = tab === "avatar" ? AVATAR_VIEW : POSTER_W;
  const viewH = tab === "avatar" ? AVATAR_VIEW : POSTER_H;
  const geometry = cropGeometry(image, viewW, viewH, crop);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setImage(null);
      setTab("avatar");
      setAvatarCrop(DEFAULT_CROP);
      setPosterCrop(DEFAULT_CROP);
      setError(null);
      setDragging(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (JPG, PNG, GIF or WebP).");
      return;
    }
    if (file.size > MAX_FILE) {
      setError("That image is larger than 10 MB. Try a smaller one.");
      return;
    }
    try {
      setBusy(true);
      const src = await readFileAsDataUrl(file);
      const loaded = await loadImage(src);
      setImage({
        src,
        width: loaded.naturalWidth || loaded.width,
        height: loaded.naturalHeight || loaded.height,
      });
      setAvatarCrop(DEFAULT_CROP);
      setPosterCrop(DEFAULT_CROP);
      setTab("avatar");
      setError(null);
    } catch {
      setError("That image couldn't be read. Try another one.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!image) return;
    try {
      setBusy(true);
      const loaded = await loadImage(image.src);
      const photo = renderCrop(
        loaded,
        image,
        AVATAR_VIEW,
        AVATAR_VIEW,
        avatarCrop,
        320,
        320,
      );
      const photoFull = renderCrop(
        loaded,
        image,
        POSTER_W,
        POSTER_H,
        posterCrop,
        768,
        1024,
      );
      if (!photo || !photoFull) {
        setError("Could not prepare that picture. Try another one.");
        return;
      }
      onSave({ photo, photoFull });
      onClose();
    } catch {
      setError("Could not prepare that picture. Try another one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0a0e16]/97 p-5 shadow-2xl shadow-black/70 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  Your profile pictures
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-white/40">
                  Pick a square avatar and a taller poster that shows full-size
                  whenever your camera is off.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-white/45 transition hover:bg-white/10 hover:text-white"
                aria-label="Close picture editor"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                void handleFile(file);
                event.target.value = "";
              }}
            />

            {!image ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleFile(event.dataTransfer.files?.[0]);
                }}
                className="mt-5 flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-white/15 bg-white/[0.025] px-6 text-center transition hover:border-lime-300/40 hover:bg-lime-300/[0.04]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lime-300/20 to-violet-400/20 text-lime-200">
                  <LuImage className="h-6 w-6" />
                </span>
                <span className="font-display text-sm font-semibold text-white">
                  Choose a photo
                </span>
                <span className="text-xs leading-relaxed text-white/40">
                  Drop it here or browse. JPG, PNG, GIF or WebP up to 10 MB.
                </span>
                <span className="mt-1 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-white/60">
                  <LuUpload className="h-3.5 w-3.5" />
                  Browse files
                </span>
              </button>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
                  {(
                    [
                      ["avatar", "Avatar"],
                      ["poster", "Camera-off poster"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
                        tab === value
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="mt-2 text-center text-[10px] leading-relaxed text-white/35">
                  {tab === "avatar"
                    ? "Square crop used for your avatar across the app."
                    : "Tall crop shown when your camera is off — full body, art, or anything you like."}
                </p>

                <div className="mt-3 flex justify-center">
                  <div
                    className={`relative touch-none select-none overflow-hidden border border-white/15 bg-[#05070c] shadow-[0_18px_60px_-20px_rgba(0,0,0,0.9)] ${
                      tab === "avatar" ? "rounded-full" : "rounded-2xl"
                    }`}
                    style={{ width: viewW, height: viewH, maxWidth: "100%" }}
                    onPointerDown={(event) => {
                      if (!image) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        offsetX: geometry.x,
                        offsetY: geometry.y,
                      };
                      setDragging(true);
                    }}
                    onPointerMove={(event) => {
                      const drag = dragRef.current;
                      if (!drag) return;
                      const nextX = drag.offsetX + (event.clientX - drag.startX);
                      const nextY = drag.offsetY + (event.clientY - drag.startY);
                      setCrop((current) => ({
                        ...current,
                        offset: {
                          x: clamp(nextX, -geometry.maxX, geometry.maxX),
                          y: clamp(nextY, -geometry.maxY, geometry.maxY),
                        },
                      }));
                    }}
                    onPointerUp={() => {
                      dragRef.current = null;
                      setDragging(false);
                    }}
                    onPointerCancel={() => {
                      dragRef.current = null;
                      setDragging(false);
                    }}
                  >
                    <img
                      src={image.src}
                      alt={`${tab} crop preview`}
                      draggable={false}
                      className="pointer-events-none absolute max-w-none origin-center"
                      style={{
                        width: geometry.drawW,
                        height: geometry.drawH,
                        left: (viewW - geometry.drawW) / 2 + geometry.x,
                        top: (viewH - geometry.drawH) / 2 + geometry.y,
                      }}
                    />
                    <div
                      className={`pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/25 ${
                        tab === "avatar" ? "rounded-full" : "rounded-2xl"
                      }`}
                    />
                    <div
                      className={`pointer-events-none absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.35)] ${
                        tab === "avatar" ? "rounded-full" : "rounded-2xl"
                      }`}
                    />
                    <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/60 backdrop-blur">
                      {tab === "avatar" ? "1:1 avatar" : "3:4 poster"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCrop((current) => ({
                        ...current,
                        zoom: clamp(current.zoom - 0.1, 1, 3),
                      }))
                    }
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label="Zoom out"
                  >
                    <LuZoomOut className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={crop.zoom}
                    onChange={(event) => {
                      const zoom = Number(event.target.value);
                      setCrop((current) => ({ ...current, zoom }));
                    }}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-lime-300"
                    aria-label="Zoom"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCrop((current) => ({
                        ...current,
                        zoom: clamp(current.zoom + 0.1, 1, 3),
                      }))
                    }
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label="Zoom in"
                  >
                    <LuZoomIn className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-white/25">
                  {dragging ? "dragging…" : "drag the picture to reposition"}
                </p>
              </>
            )}

            {error && (
              <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {image && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
                >
                  <LuImage className="h-3.5 w-3.5" />
                  Change
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-white/65 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
                >
                  <LuTrash2 className="h-3.5 w-3.5" />
                  Use emoji
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ml-auto rounded-xl px-3 py-2.5 text-xs font-semibold text-white/45 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!image || busy}
                className="flex items-center gap-1.5 rounded-xl bg-lime-300 px-4 py-2.5 text-xs font-bold text-[#08130a] transition enabled:hover:bg-lime-200 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LuCheck className="h-3.5 w-3.5" />
                {busy ? "Saving…" : "Save pictures"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
