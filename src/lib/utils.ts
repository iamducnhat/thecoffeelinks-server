export const DEFAULT_SIZE_OPTIONS = {
    small: { enabled: false, price: 0 },
    medium: { enabled: true, price: 65000 },
    large: { enabled: true, price: 69000 },
};

/**
 * Constructs a full URL for a storage image path.
 * If the path is already a URL, it is returned as is.
 * Defaults to using the NEXT_PUBLIC_SUPABASE_URL environment variable.
 */
export function getStorageUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        console.warn('NEXT_PUBLIC_SUPABASE_URL is not defined in environment variables.');
        return path; // Fallback to returning path if no base URL
    }

    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    return `${supabaseUrl}/storage/v1/object/public/${cleanPath}`;
}

export function formatProductSlug(name: string, id?: string): string {
    if (id) return id;
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
