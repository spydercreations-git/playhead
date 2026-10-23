"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Cropper, { Point, Area } from "react-easy-crop";
import { X, RotateCw, RotateCcw, Minus, Plus, Loader2 } from "@/components/ui/icon";
import { getCroppedImg } from "@/lib/crop-image";

export interface ImageCropDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageFile?: File | null;
  imageSrc?: string | null;
  shape: "circle" | "square";
  title?: string;
  onCropComplete: (croppedBlob: Blob, croppedDataUrl: string) => Promise<void> | void;
  onChooseAnotherImage?: () => void;
}

export function ImageCropDialog({
  isOpen,
  onClose,
  imageFile,
  imageSrc: initialSrc,
  shape,
  title,
  onCropComplete,
  onChooseAnotherImage,
}: ImageCropDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(initialSrc || null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.42);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load image source when imageFile or initialSrc changes
  useEffect(() => {
    if (imageFile) {
      // Validate file size and format
      if (imageFile.size > 20 * 1024 * 1024) {
        setError("Image exceeds 20 MB limit. Please choose a smaller image.");
        return;
      }
      if (imageFile.type === "image/svg+xml" || imageFile.name.toLowerCase().endsWith(".svg")) {
        setError("SVG files are not supported. Please choose a PNG, JPG, or WebP image.");
        return;
      }

      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setZoom(1.42);
        setCrop({ x: 0, y: 0 });
        setRotation(0);
      };
      reader.readAsDataURL(imageFile);
    } else if (initialSrc) {
      setError(null);
      setImageSrc(initialSrc);
    }
  }, [imageFile, initialSrc]);

  const onCropChange = useCallback((newCrop: Point) => {
    setCrop(newCrop);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropAreaChange = useCallback(
    (_: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

  // Update live preview when croppedAreaPixels or rotation changes
  useEffect(() => {
    let active = true;
    if (imageSrc && croppedAreaPixels) {
      const timer = setTimeout(() => {
        getCrappedPreview(imageSrc, croppedAreaPixels, rotation).then((url) => {
          if (active && url) setPreviewUrl(url);
        });
      }, 50);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
  }, [imageSrc, croppedAreaPixels, rotation]);

  async function getCrappedPreview(src: string, area: Area, rot: number): Promise<string | null> {
    try {
      const res = await getCroppedImg(src, area, rot, 128);
      return res.dataUrl;
    } catch {
      return null;
    }
  }

  function handleRotate() {
    setRotation((prev) => (prev + 90) % 360);
  }

  function handleReset() {
    setZoom(1.0);
    setRotation(0);
    setCrop({ x: 0, y: 0 });
  }

  function handleZoomIn() {
    setZoom((prev) => Math.min(4, Math.round((prev + 0.1) * 100) / 100));
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(1, Math.round((prev - 0.1) * 100) / 100));
  }

  async function handleSave() {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    setError(null);
    try {
      const { blob, dataUrl } = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, 512);
      await onCropComplete(blob, dataUrl);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to process image");
    } finally {
      setSaving(false);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCrop((prev) => ({ ...prev, y: prev.y - 10 }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCrop((prev) => ({ ...prev, y: prev.y + 10 }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCrop((prev) => ({ ...prev, x: prev.x - 10 }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCrop((prev) => ({ ...prev, x: prev.x + 10 }));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, imageSrc, croppedAreaPixels, rotation, onClose]);

  if (!isOpen) return null;

  const defaultTitle = shape === "circle" ? "Crop profile photo" : "Crop client picture";
  const displayTitle = title || defaultTitle;
  const zoomPercentage = Math.round(zoom * 100);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 select-none">
      <div
        className="w-full max-w-[620px] bg-[var(--panel)] border border-[var(--border)] rounded-[16px] shadow-xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{displayTitle}</h2>
            <p className="text-[13px] text-[var(--text-2)] mt-0.5">
              Drag to move. Scroll or use the slider to zoom.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close dialog"
            className="text-[var(--text-2)] hover:text-white p-1 rounded-[6px] hover:bg-[var(--input)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Crop Viewport */}
        <div className="relative px-6">
          <div className="relative w-full h-[320px] bg-[var(--bg)] rounded-[12px] overflow-hidden border border-[var(--border)]">
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape={shape === "circle" ? "round" : "rect"}
                showGrid={true}
                restrictPosition={true}
                minZoom={1}
                maxZoom={4}
                onCropChange={onCropChange}
                onZoomChange={onZoomChange}
                onCropAreaChange={onCropAreaChange}
                style={{
                  containerStyle: {
                    background: "var(--bg)",
                  },
                  cropAreaStyle: {
                    border: shape === "circle" ? "2px solid rgba(255, 255, 255, 0.9)" : "none",
                  },
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-[var(--text-3)]">
                No image selected
              </div>
            )}

            {/* Corner Bracket Guides for Square Mode (matching C2 mockup) */}
            {shape === "square" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-[280px] h-[280px]">
                  {/* Top-Left */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white" />
                  {/* Top-Right */}
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white" />
                  {/* Bottom-Left */}
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white" />
                  {/* Bottom-Right */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white" />
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar: Zoom Slider, Percentage, Rotate, Reset */}
          <div className="flex items-center gap-3 mt-4 text-[var(--text-2)]">
            <button
              type="button"
              onClick={handleZoomOut}
              title="Zoom out"
              className="p-1 hover:text-white transition-colors"
            >
              <Minus size={16} />
            </button>

            <div className="flex-1 relative flex items-center">
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-1 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-[#4876F3]"
              />
            </div>

            <button
              type="button"
              onClick={handleZoomIn}
              title="Zoom in"
              className="p-1 hover:text-white transition-colors"
            >
              <Plus size={16} />
            </button>

            <span className="w-12 text-[13px] font-medium text-white tabular-nums text-right">
              {zoomPercentage}%
            </span>

            <div className="w-px h-4 bg-[var(--border)] mx-1" />

            <button
              type="button"
              onClick={handleRotate}
              title="Rotate 90 degrees"
              className="p-1.5 rounded-[6px] hover:bg-[var(--input)] hover:text-white transition-colors"
            >
              <RotateCw size={16} />
            </button>

            <button
              type="button"
              onClick={handleReset}
              title="Reset zoom and rotation"
              className="p-1.5 rounded-[6px] hover:bg-[var(--input)] hover:text-white transition-colors"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Live Preview Row (56px, 32px, 20px) */}
          <div className="flex items-center justify-between mt-5 py-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-4">
              <span className="text-[13px] text-[var(--text-2)]">Preview</span>

              <div className="flex items-center gap-3">
                {/* 56px */}
                <div
                  className={`w-14 h-14 bg-[var(--input)] overflow-hidden flex-shrink-0 ${
                    shape === "circle" ? "rounded-full" : "rounded-[8px]"
                  }`}
                >
                  {previewUrl && (
                    <img src={previewUrl} alt="Preview 56px" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* 32px */}
                <div
                  className={`w-8 h-8 bg-[var(--input)] overflow-hidden flex-shrink-0 ${
                    shape === "circle" ? "rounded-full" : "rounded-[6px]"
                  }`}
                >
                  {previewUrl && (
                    <img src={previewUrl} alt="Preview 32px" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* 20px */}
                <div
                  className={`w-5 h-5 bg-[var(--input)] overflow-hidden flex-shrink-0 ${
                    shape === "circle" ? "rounded-full" : "rounded-[4px]"
                  }`}
                >
                  {previewUrl && (
                    <img src={previewUrl} alt="Preview 20px" className="w-full h-full object-cover" />
                  )}
                </div>
              </div>
            </div>

            <span className="text-[12px] text-[var(--text-3)]">
              How it looks in comments, menus and cards
            </span>
          </div>

          {error && <p className="text-[13px] text-red-400 mt-2">{error}</p>}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 pt-4 mt-2 border-t border-[var(--border)] bg-[var(--panel)]">
          <div>
            <button
              type="button"
              onClick={() => {
                if (onChooseAnotherImage) {
                  onChooseAnotherImage();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              className="text-[13px] font-medium text-[#4876F3] hover:underline cursor-pointer"
            >
              Choose another image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.heic"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg")) {
                    setError("SVG files are not supported. Please choose a PNG, JPG, or WebP image.");
                    return;
                  }
                  if (f.size > 20 * 1024 * 1024) {
                    setError("Image exceeds 20 MB limit. Please choose a smaller image.");
                    return;
                  }
                  setError(null);
                  const reader = new FileReader();
                  reader.onload = () => {
                    setImageSrc(reader.result as string);
                    setZoom(1.42);
                    setCrop({ x: 0, y: 0 });
                    setRotation(0);
                  };
                  reader.readAsDataURL(f);
                }
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-[14px] font-medium text-white bg-[var(--border)] hover:bg-[#3A3C44] rounded-[8px] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !imageSrc}
              className="flex items-center gap-2 px-5 py-2 text-[14px] font-medium text-white bg-[#4876F3] hover:bg-[#3560D6] rounded-[8px] transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
