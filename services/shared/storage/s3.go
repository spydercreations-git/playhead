package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// Config holds credentials and endpoint for S3/R2/MinIO
type Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	UsePathStyle    bool
	AppURL          string
}

// Client wraps AWS S3 client with presigning and helper methods
type Client struct {
	S3       *s3.Client
	Presign  *s3.PresignClient
	Bucket   string
	AppURL   string
}

// NewClient initializes an S3 client for MinIO or Cloudflare R2
func NewClient(ctx context.Context, cfg Config) (*Client, error) {
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		if cfg.Endpoint != "" {
			return aws.Endpoint{
				PartitionID:       "aws",
				URL:               cfg.Endpoint,
				SigningRegion:     "auto",
				HostnameImmutable: true,
			}, nil
		}
		return aws.Endpoint{}, &aws.EndpointNotFoundError{}
	})

	awsCfg := aws.Config{
		Region:                      "auto",
		Credentials:                 credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		EndpointResolverWithOptions: customResolver,
	}

	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = cfg.UsePathStyle
	})

	presignClient := s3.NewPresignClient(s3Client)

	return &Client{
		S3:      s3Client,
		Presign: presignClient,
		Bucket:  cfg.Bucket,
		AppURL:  cfg.AppURL,
	}, nil
}

// EnsureBucket creates the bucket and configures CORS if needed
func (c *Client) EnsureBucket(ctx context.Context) error {
	_, err := c.S3.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(c.Bucket),
	})
	if err != nil {
		// Ignore if bucket already exists
	}

	// Always configure CORS for direct browser PUT and GET with exposed ETag
	return c.ConfigureCORS(ctx)
}

// ConfigureCORS sets bucket CORS rules allowing browser direct uploads with ETag exposure
func (c *Client) ConfigureCORS(ctx context.Context) error {
	origins := []string{"*"}
	if c.AppURL != "" {
		origins = append(origins, c.AppURL)
	}

	_, err := c.S3.PutBucketCors(ctx, &s3.PutBucketCorsInput{
		Bucket: aws.String(c.Bucket),
		CORSConfiguration: &types.CORSConfiguration{
			CORSRules: []types.CORSRule{
				{
					AllowedHeaders: []string{"*"},
					AllowedMethods: []string{"GET", "PUT", "POST", "HEAD", "DELETE"},
					AllowedOrigins: origins,
					ExposeHeaders: []string{"ETag", "Content-Range", "Accept-Ranges"},
					MaxAgeSeconds:  aws.Int32(3600),
				},
			},
		},
	})
	if err != nil {
		// Best-effort in dev
		return fmt.Errorf("configure bucket cors: %w", err)
	}
	return nil
}

// Ping checks if the bucket exists and is accessible
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.S3.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(c.Bucket),
	})
	if err != nil {
		return fmt.Errorf("head bucket %q: %w", c.Bucket, err)
	}
	return nil
}

// CreateMultipartUpload starts a new multipart upload in S3/R2
func (c *Client) CreateMultipartUpload(ctx context.Context, key, mime string) (string, error) {
	out, err := c.S3.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(c.Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(mime),
	})
	if err != nil {
		return "", fmt.Errorf("create multipart upload for %q: %w", key, err)
	}
	return *out.UploadId, nil
}

// PresignUploadPart generates a presigned PUT URL for a specific multipart part number
func (c *Client) PresignUploadPart(ctx context.Context, key, uploadID string, partNumber int, expire time.Duration) (string, error) {
	req, err := c.Presign.PresignUploadPart(ctx, &s3.UploadPartInput{
		Bucket:     aws.String(c.Bucket),
		Key:        aws.String(key),
		UploadId:   aws.String(uploadID),
		PartNumber: aws.Int32(int32(partNumber)),
	}, s3.WithPresignExpires(expire))
	if err != nil {
		return "", fmt.Errorf("presign upload part %d: %w", partNumber, err)
	}
	return req.URL, nil
}

// PresignPutObject generates a presigned single-PUT URL for direct upload
func (c *Client) PresignPutObject(ctx context.Context, key, mime string, expire time.Duration) (string, error) {
	req, err := c.Presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(mime),
	}, s3.WithPresignExpires(expire))
	if err != nil {
		return "", fmt.Errorf("presign put object %q: %w", key, err)
	}
	return req.URL, nil
}

// PresignGetObject generates a presigned GET URL for downloading or streaming
func (c *Client) PresignGetObject(ctx context.Context, key, downloadName string, expire time.Duration) (string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(c.Bucket),
		Key:    aws.String(key),
	}
	if downloadName != "" {
		input.ResponseContentDisposition = aws.String(fmt.Sprintf("attachment; filename=%q", downloadName))
	}

	req, err := c.Presign.PresignGetObject(ctx, input, s3.WithPresignExpires(expire))
	if err != nil {
		return "", fmt.Errorf("presign get object %q: %w", key, err)
	}
	return req.URL, nil
}

// PresignGetObjectInline generates a presigned GET URL with Content-Disposition inline for in-browser viewing
func (c *Client) PresignGetObjectInline(ctx context.Context, key, mimeType string, expire time.Duration) (string, error) {
	input := &s3.GetObjectInput{
		Bucket:                     aws.String(c.Bucket),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String("inline"),
	}
	if mimeType != "" {
		input.ResponseContentType = aws.String(mimeType)
	}

	req, err := c.Presign.PresignGetObject(ctx, input, s3.WithPresignExpires(expire))
	if err != nil {
		return "", fmt.Errorf("presign get object inline %q: %w", key, err)
	}
	return req.URL, nil
}

// ListParts lists completed parts for an ongoing multipart upload (useful for resume)
func (c *Client) ListParts(ctx context.Context, key, uploadID string) ([]types.Part, error) {
	var parts []types.Part
	var partNumberMarker *string

	for {
		out, err := c.S3.ListParts(ctx, &s3.ListPartsInput{
			Bucket:           aws.String(c.Bucket),
			Key:              aws.String(key),
			UploadId:         aws.String(uploadID),
			PartNumberMarker: partNumberMarker,
		})
		if err != nil {
			return nil, fmt.Errorf("list parts for %q: %w", key, err)
		}

		parts = append(parts, out.Parts...)
		if !aws.ToBool(out.IsTruncated) {
			break
		}
		partNumberMarker = out.NextPartNumberMarker
	}

	return parts, nil
}

// CompleteMultipartUpload finalizes all uploaded parts into a single object
func (c *Client) CompleteMultipartUpload(ctx context.Context, key, uploadID string, parts []types.CompletedPart) error {
	_, err := c.S3.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(c.Bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: parts,
		},
	})
	if err != nil {
		return fmt.Errorf("complete multipart upload for %q: %w", key, err)
	}
	return nil
}

// AbortMultipartUpload cancels an ongoing multipart upload and deletes temporary parts
func (c *Client) AbortMultipartUpload(ctx context.Context, key, uploadID string) error {
	_, err := c.S3.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(c.Bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	if err != nil {
		return fmt.Errorf("abort multipart upload for %q: %w", key, err)
	}
	return nil
}

// CopyObject performs a 100% server-side copy within the S3 bucket without streaming through the API
func (c *Client) CopyObject(ctx context.Context, srcKey, destKey string) error {
	copySource := fmt.Sprintf("%s/%s", c.Bucket, srcKey)
	_, err := c.S3.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(c.Bucket),
		Key:        aws.String(destKey),
		CopySource: aws.String(copySource),
	})
	if err != nil {
		return fmt.Errorf("copy object from %q to %q: %w", srcKey, destKey, err)
	}
	return nil
}

// DeleteObjects deletes multiple keys in batch from storage
func (c *Client) DeleteObjects(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	var objects []types.ObjectIdentifier
	for _, k := range keys {
		if k != "" {
			objects = append(objects, types.ObjectIdentifier{Key: aws.String(k)})
		}
	}

	if len(objects) == 0 {
		return nil
	}

	_, err := c.S3.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(c.Bucket),
		Delete: &types.Delete{
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	})
	if err != nil {
		return fmt.Errorf("delete objects from bucket %q: %w", c.Bucket, err)
	}
	return nil
}

// GetObject opens a streaming reader for an object directly from storage (used for zip building)
func (c *Client) GetObject(ctx context.Context, key string) (io.ReadCloser, int64, error) {
	out, err := c.S3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("get object %q: %w", key, err)
	}
	return out.Body, aws.ToInt64(out.ContentLength), nil
}

// PutObject uploads an object directly to S3 (used for preview files)
func (c *Client) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := c.S3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.Bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("put object %q: %w", key, err)
	}
	return nil
}
