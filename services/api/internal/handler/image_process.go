package handler

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/draw"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"strings"

	"github.com/KarpelesLab/gowebp"
	"github.com/playhead/playhead/services/shared/storage"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/webp"
)

var (
	ErrSVGNotAllowed  = errors.New("svg_not_allowed")
	ErrInvalidFormat  = errors.New("invalid_image_format")
	ErrFileTooLarge   = errors.New("file_too_large")
	MaxImageSizeBytes = int64(20 * 1024 * 1024) // 20 MB max
)

// DecodeAndValidateImage reads image bytes, rejects SVGs and non-images, strips EXIF, and returns decoded image.Image.
func DecodeAndValidateImage(r io.Reader) (image.Image, error) {
	// Read with 20MB limit
	lr := io.LimitReader(r, MaxImageSizeBytes+1)
	data, err := io.ReadAll(lr)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > MaxImageSizeBytes {
		return nil, ErrFileTooLarge
	}

	// 1. Strict SVG check: content-type or XML/SVG markup
	headLen := len(data)
	if headLen > 512 {
		headLen = 512
	}
	headStr := strings.ToLower(string(data[:headLen]))
	if strings.Contains(headStr, "<svg") || strings.Contains(headStr, "<?xml") || strings.Contains(headStr, "xmlns=\"http://www.w3.org/2000/svg\"") {
		return nil, ErrSVGNotAllowed
	}

	// 2. Decode WebP
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		img, err := webp.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, ErrInvalidFormat
		}
		return img, nil
	}

	// 3. Decode JPEG / PNG
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrInvalidFormat
	}
	return img, nil
}

// ResizeSquare scales an image to an exact size x size square using high-quality CatmullRom resampling.
func ResizeSquare(src image.Image, size int) image.Image {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	// Clear destination with transparent black
	draw.Draw(dst, dst.Bounds(), image.Transparent, image.Point{}, draw.Src)
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)
	return dst
}

// EncodeWebP compresses an image into WebP format with given quality (0-100).
func EncodeWebP(img image.Image, quality float64) ([]byte, error) {
	var buf bytes.Buffer
	err := gowebp.Encode(&buf, img, &gowebp.Options{
		Lossy:   true,
		Quality: float32(quality),
	})
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// GenerateAndStoreImageVariants produces 512, 256, 128, and 64 WebP variants and uploads them to storage.
// It returns the map of size -> storageKey.
func GenerateAndStoreImageVariants(ctx context.Context, storageClient *storage.Client, keyPrefix string, src image.Image) (map[int]string, error) {
	sizes := []int{512, 256, 128, 64}
	keys := make(map[int]string)

	for _, sz := range sizes {
		resized := ResizeSquare(src, sz)
		webpBytes, err := EncodeWebP(resized, 85)
		if err != nil {
			return nil, fmt.Errorf("encode webp %dpx: %w", sz, err)
		}

		storageKey := fmt.Sprintf("%s/%d.webp", keyPrefix, sz)
		keys[sz] = storageKey

		if storageClient != nil {
			err = storageClient.PutObject(ctx, storageKey, bytes.NewReader(webpBytes), int64(len(webpBytes)), "image/webp")
			if err != nil {
				return nil, fmt.Errorf("upload variant %s: %w", storageKey, err)
			}
		}
	}

	return keys, nil
}
