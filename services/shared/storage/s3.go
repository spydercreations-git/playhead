package storage

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Config holds credentials and endpoint for S3/R2/MinIO
type Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	UsePathStyle    bool
}

// Client wraps AWS S3 client
type Client struct {
	S3     *s3.Client
	Bucket string
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

	return &Client{
		S3:     s3Client,
		Bucket: cfg.Bucket,
	}, nil
}

// EnsureBucket creates the bucket if it does not exist
func (c *Client) EnsureBucket(ctx context.Context) error {
	_, err := c.S3.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(c.Bucket),
	})
	if err != nil {
		// Ignore if bucket already exists
		return nil
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

