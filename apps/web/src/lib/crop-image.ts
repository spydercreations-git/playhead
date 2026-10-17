/**
 * Utility to generate a 512x512 cropped WebP blob from react-easy-crop pixel crop coordinates.
 */

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

/**
 * Returns a 512x512 cropped WebP Blob and data URL.
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
  outputSize = 512
): Promise<{ blob: Blob; dataUrl: string }> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  // Set output size to requested resolution (default 512x512)
  canvas.width = outputSize;
  canvas.height = outputSize;

  // Temporary canvas to handle rotation if rotated
  if (rotation !== 0) {
    const rotCanvas = document.createElement("canvas");
    const rotCtx = rotCanvas.getContext("2d");
    if (!rotCtx) throw new Error("Rotated canvas context not available");

    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const newWidth = image.width * cos + image.height * sin;
    const newHeight = image.width * sin + image.height * cos;

    rotCanvas.width = newWidth;
    rotCanvas.height = newHeight;

    rotCtx.translate(newWidth / 2, newHeight / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(image, -image.width / 2, -image.height / 2);

    // Draw the cropped region onto the final 512x512 canvas
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      rotCanvas,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outputSize,
      outputSize
    );
  } else {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outputSize,
      outputSize
    );
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          // Fallback to png if webp unsupported
          canvas.toBlob(
            (fallbackBlob) => {
              if (!fallbackBlob) {
                reject(new Error("Canvas toBlob failed"));
                return;
              }
              const dataUrl = canvas.toDataURL("image/png");
              resolve({ blob: fallbackBlob, dataUrl });
            },
            "image/png"
          );
          return;
        }
        const dataUrl = canvas.toDataURL("image/webp", 0.92);
        resolve({ blob, dataUrl });
      },
      "image/webp",
      0.92
    );
  });
}
