const S3_BASE_URL = import.meta.env.VITE_S3_PUBLIC_URL || 'https://connective-images.s3.eu-north-1.amazonaws.com';
export const DEFAULT_AVATAR_URL = `${S3_BASE_URL}/assets/default-avatar.png`;

/**
 * Resolves an avatar URL. 
 * If the URL is absolute (starts with http or data:), it returns it as-is.
 * If the URL is missing, it returns the S3-hosted default avatar.
 * If the URL is relative , it handles it as a backend-hosted asset (fallback for old records),
 * but ideally all new avatars are stored as absolute S3 URLs.
 */
export const resolveAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return DEFAULT_AVATAR_URL;

    // Absolute URLs (S3, CloudFront, OAuth providers) or data URIs
    if (/^(https?:)?\/\//i.test(avatarUrl) || /^data:/i.test(avatarUrl)) {
        return avatarUrl;
    }

    // Backward compatibility for old relative paths (e.g., /uploads/...)
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    return `${apiBase}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`;
};
