import { S3Client } from '@aws-sdk/client-s3'

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION

if (!region) {
  // This module may be imported even when S3 is not used; only throw when actually needed.
  // Callers should validate required env vars before attempting uploads.
}

export function getS3Client() {
  return new S3Client({
    region
    // Credentials are automatically resolved by the AWS SDK:
    // - Elastic Beanstalk instance profile (recommended)
    // - Environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
    // - Shared config files, etc.
  })
}

export function getPublicBaseUrl() {
  // Prefer a custom CDN/public base URL (e.g. CloudFront) if provided.
  // Example: https://d123.cloudfront.net
  const base = process.env.AVATAR_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL
  if (base) return base.replace(/\/+$/, '')

  const bucket = process.env.S3_BUCKET || process.env.S3_BUCKET_NAME
  if (!bucket || !region) return null

  // Virtual-hosted–style URL
  return `https://${bucket}.s3.${region}.amazonaws.com`
}

