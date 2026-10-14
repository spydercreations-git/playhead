package transcode_test

import (
	"context"
	"os"
	"testing"

	"github.com/playhead/playhead/services/shared/transcode"
	"github.com/stretchr/testify/assert"
)

func TestCalculateDimensions_AspectRatios(t *testing.T) {
	tests := []struct {
		name            string
		srcW            int
		srcH            int
		targetShortSide int
		expectedW       int
		expectedH       int
	}{
		{
			name:            "vertical 9:16 scaled to 720p",
			srcW:            1080,
			srcH:            1920,
			targetShortSide: 720,
			expectedW:       720,
			expectedH:       1280,
		},
		{
			name:            "vertical 9:16 scaled to 1080p",
			srcW:            1080,
			srcH:            1920,
			targetShortSide: 1080,
			expectedW:       1080,
			expectedH:       1920,
		},
		{
			name:            "square 1:1 scaled to 720p",
			srcW:            1080,
			srcH:            1080,
			targetShortSide: 720,
			expectedW:       720,
			expectedH:       720,
		},
		{
			name:            "square 1:1 scaled to 1080p",
			srcW:            1080,
			srcH:            1080,
			targetShortSide: 1080,
			expectedW:       1080,
			expectedH:       1080,
		},
		{
			name:            "vertical 4:5 scaled to 720p",
			srcW:            1080,
			srcH:            1350,
			targetShortSide: 720,
			expectedW:       720,
			expectedH:       900,
		},
		{
			name:            "vertical 4:5 scaled to 1080p",
			srcW:            1080,
			srcH:            1350,
			targetShortSide: 1080,
			expectedW:       1080,
			expectedH:       1350,
		},
		{
			name:            "landscape 16:9 scaled to 720p",
			srcW:            1920,
			srcH:            1080,
			targetShortSide: 720,
			expectedW:       1280,
			expectedH:       720,
		},
		{
			name:            "landscape 16:9 scaled to 1080p",
			srcW:            1920,
			srcH:            1080,
			targetShortSide: 1080,
			expectedW:       1920,
			expectedH:       1080,
		},
		{
			name:            "4K landscape scaled to 1080p",
			srcW:            3840,
			srcH:            2160,
			targetShortSide: 1080,
			expectedW:       1920,
			expectedH:       1080,
		},
		{
			name:            "small source 360p never upscales to 720p",
			srcW:            640,
			srcH:            360,
			targetShortSide: 720,
			expectedW:       640,
			expectedH:       360,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			outW, outH := transcode.CalculateDimensions(tt.srcW, tt.srcH, tt.targetShortSide)
			assert.Equal(t, tt.expectedW, outW, "width mismatch")
			assert.Equal(t, tt.expectedH, outH, "height mismatch")
			// Ensure both dimensions are strictly even for H.264 video compatibility
			assert.Equal(t, 0, outW%2, "width must be even")
			assert.Equal(t, 0, outH%2, "height must be even")
		})
	}
}

func TestScaleFilter(t *testing.T) {
	// 9:16 vertical -> scale=720:-2
	assert.Equal(t, "scale=720:-2", transcode.ScaleFilter(1080, 1920, 720))
	// 16:9 landscape -> scale=-2:720
	assert.Equal(t, "scale=-2:720", transcode.ScaleFilter(1920, 1080, 720))
	// 1:1 square -> scale=720:-2
	assert.Equal(t, "scale=720:-2", transcode.ScaleFilter(1080, 1080, 720))
}

func TestShouldGenerate1080p(t *testing.T) {
	// Source 1080p or higher short side: true
	assert.True(t, transcode.ShouldGenerate1080p(1920, 1080))
	assert.True(t, transcode.ShouldGenerate1080p(1080, 1920))
	assert.True(t, transcode.ShouldGenerate1080p(3840, 2160))
	assert.True(t, transcode.ShouldGenerate1080p(1080, 1080))

	// Source lower than 1080 short side: false
	assert.False(t, transcode.ShouldGenerate1080p(1280, 720))
	assert.False(t, transcode.ShouldGenerate1080p(720, 1280))
	assert.False(t, transcode.ShouldGenerate1080p(800, 600))
}

func TestTranscoder_StubTranscode(t *testing.T) {
	tc := transcode.New()
	tempDir, err := os.MkdirTemp("", "transcode-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tempDir)

	mockInput := tempDir + "/test_video.mp4"
	_ = os.WriteFile(mockInput, []byte("fake-video-content"), 0644)

	res, err := tc.Transcode(context.Background(), mockInput, tempDir+"/output")
	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.NotEmpty(t, res.MasterM3U8)
	assert.NotEmpty(t, res.PosterPath)
	assert.NotEmpty(t, res.SpritePath)
	assert.NotEmpty(t, res.WaveformJSON)
}

func TestCalculateRotatedDimensions(t *testing.T) {
	// A 1920x1080 rotate 90 source (iPhone vertical) produces 720x1280
	w720, h720 := transcode.CalculateRotatedDimensions(1920, 1080, 90, 720)
	assert.Equal(t, 720, w720)
	assert.Equal(t, 1280, h720)

	// Rotate 270 produces 720x1280
	w270, h270 := transcode.CalculateRotatedDimensions(1920, 1080, 270, 720)
	assert.Equal(t, 720, w270)
	assert.Equal(t, 1280, h270)

	// Rotate 0 remains 1280x720
	w0, h0 := transcode.CalculateRotatedDimensions(1920, 1080, 0, 720)
	assert.Equal(t, 1280, w0)
	assert.Equal(t, 720, h0)
}

