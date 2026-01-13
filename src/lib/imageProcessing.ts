import sharp from 'sharp';

export interface ImageProcessingOptions {
    // Crop options
    crop?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    // Resize options
    resize?: {
        width?: number;
        height?: number;
        fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    };
    // Quality (1-100)
    quality?: number;
    // Output format
    format?: 'jpeg' | 'png' | 'webp';
}

/**
 * Process an image with various transformations
 * @param buffer - The input image buffer
 * @param options - Processing options (crop, resize, quality, format)
 * @returns Processed image buffer
 */
export async function processImage(
    buffer: Buffer,
    options: ImageProcessingOptions = {}
): Promise<Buffer> {
    let image = sharp(buffer);

    // Get metadata for validation
    const metadata = await image.metadata();

    // Apply crop if specified
    if (options.crop) {
        const { x, y, width, height } = options.crop;
        
        // Validate crop dimensions
        if (x < 0 || y < 0 || width <= 0 || height <= 0) {
            throw new Error('Invalid crop dimensions');
        }
        
        if (metadata.width && metadata.height) {
            if (x + width > metadata.width || y + height > metadata.height) {
                throw new Error('Crop dimensions exceed image boundaries');
            }
        }

        image = image.extract({
            left: Math.round(x),
            top: Math.round(y),
            width: Math.round(width),
            height: Math.round(height)
        });
    }

    // Apply resize if specified
    if (options.resize) {
        const { width, height, fit = 'cover' } = options.resize;
        image = image.resize(width, height, { fit });
    }

    // Set quality
    const quality = options.quality || 85;

    // Convert to desired format
    const format = options.format || 'jpeg';
    
    switch (format) {
        case 'jpeg':
            image = image.jpeg({ quality });
            break;
        case 'png':
            image = image.png({ quality });
            break;
        case 'webp':
            image = image.webp({ quality });
            break;
    }

    return await image.toBuffer();
}

/**
 * Optimize image for web (resize to max dimensions and compress)
 */
export async function optimizeForWeb(
    buffer: Buffer,
    maxWidth: number = 1920,
    maxHeight: number = 1920
): Promise<Buffer> {
    return processImage(buffer, {
        resize: {
            width: maxWidth,
            height: maxHeight,
            fit: 'inside'
        },
        quality: 85,
        format: 'webp'
    });
}

/**
 * Create a thumbnail from an image
 */
export async function createThumbnail(
    buffer: Buffer,
    width: number = 300,
    height: number = 300
): Promise<Buffer> {
    return processImage(buffer, {
        resize: {
            width,
            height,
            fit: 'cover'
        },
        quality: 80,
        format: 'webp'
    });
}
