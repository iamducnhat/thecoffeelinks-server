import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processImage, optimizeForWeb, createThumbnail, ImageProcessingOptions } from '@/lib/imageProcessing';

// Security constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_BUCKETS = ['products', 'events', 'stores', 'users', 'vouchers'];

// Simple admin auth check - in production, use proper JWT verification
async function verifyAdminAccess(request: Request): Promise<boolean> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return false;
    
    // For admin uploads, we check if they have a valid session
    // This is a basic check - enhance with proper admin role verification
    const token = authHeader.replace('Bearer ', '');
    if (!token) return false;
    
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        return !error && !!data.user;
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    try {
        // Optional: Verify admin access for protected uploads
        // Uncomment if you want to require auth for all uploads
        // const isAuthorized = await verifyAdminAccess(request);
        // if (!isAuthorized) {
        //     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // }

        // Parse FormData
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const bucket = formData.get('bucket') as string || 'products';
        const path = formData.get('path') as string;
        
        // Image processing options
        const cropData = formData.get('crop');
        const resizeData = formData.get('resize');
        const quality = formData.get('quality');
        const format = formData.get('format') as 'jpeg' | 'png' | 'webp';
        const createThumb = formData.get('createThumbnail') === 'true';
        const optimize = formData.get('optimize') === 'true';

        // Validation: File exists
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        
        // Validation: File size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ 
                error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
            }, { status: 400 });
        }

        // Validation: MIME type (don't trust file.type alone)
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ 
                error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` 
            }, { status: 400 });
        }
        
        // Validation: Bucket whitelist
        if (!ALLOWED_BUCKETS.includes(bucket)) {
            return NextResponse.json({ 
                error: `Invalid bucket. Allowed: ${ALLOWED_BUCKETS.join(', ')}` 
            }, { status: 400 });
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        let buffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer));
        
        // Additional validation: Check magic bytes to verify actual file type
        const magicBytes = buffer.slice(0, 8).toString('hex');
        const isValidImage = 
            magicBytes.startsWith('89504e47') || // PNG
            magicBytes.startsWith('ffd8ff') ||   // JPEG
            magicBytes.startsWith('52494646') || // WEBP (RIFF)
            magicBytes.startsWith('47494638');   // GIF
            
        if (!isValidImage) {
            return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });
        }

        // Build processing options
        const processingOptions: ImageProcessingOptions = {};

        if (cropData) {
            try {
                processingOptions.crop = JSON.parse(cropData as string);
            } catch (e) {
                return NextResponse.json({ error: 'Invalid crop data' }, { status: 400 });
            }
        }

        if (resizeData) {
            try {
                processingOptions.resize = JSON.parse(resizeData as string);
            } catch (e) {
                return NextResponse.json({ error: 'Invalid resize data' }, { status: 400 });
            }
        }

        if (quality) {
            const qualityNum = parseInt(quality as string);
            if (qualityNum >= 1 && qualityNum <= 100) {
                processingOptions.quality = qualityNum;
            }
        }

        if (format) {
            processingOptions.format = format;
        }

        // Process image if any options are provided or optimize is enabled
        if (optimize) {
            buffer = await optimizeForWeb(buffer);
        } else if (Object.keys(processingOptions).length > 0) {
            buffer = await processImage(buffer, processingOptions);
        }

        // Determine file extension and content type
        const outputFormat = processingOptions.format || format || 'webp';
        const fileExt = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
        const contentType = `image/${outputFormat}`;
        
        // Generate unique filename
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = path ? `${path}/${fileName}` : fileName;

        // Upload main image
        const { data, error } = await supabaseAdmin
            .storage
            .from(bucket)
            .upload(filePath, buffer, {
                contentType,
                upsert: false
            });

        if (error) {
            console.error('Storage upload error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Get Public URL
        const { data: publicUrlData } = supabaseAdmin
            .storage
            .from(bucket)
            .getPublicUrl(filePath);

        const response: any = {
            success: true,
            path: data.path,
            url: publicUrlData.publicUrl
        };

        // Create and upload thumbnail if requested
        if (createThumb) {
            try {
                const thumbnailBuffer = await createThumbnail(buffer);
                const thumbFileName = `thumb-${fileName}`;
                const thumbFilePath = path ? `${path}/${thumbFileName}` : thumbFileName;

                const { data: thumbData, error: thumbError } = await supabaseAdmin
                    .storage
                    .from(bucket)
                    .upload(thumbFilePath, thumbnailBuffer, {
                        contentType: 'image/webp',
                        upsert: false
                    });

                if (!thumbError && thumbData) {
                    const { data: thumbUrlData } = supabaseAdmin
                        .storage
                        .from(bucket)
                        .getPublicUrl(thumbFilePath);
                    
                    response.thumbnail = {
                        path: thumbData.path,
                        url: thumbUrlData.publicUrl
                    };
                }
            } catch (thumbErr) {
                console.error('Thumbnail creation error:', thumbErr);
                // Don't fail the main upload if thumbnail fails
            }
        }

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Upload API error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}
