import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { processImage, optimizeForWeb, createThumbnail, ImageProcessingOptions } from '@/lib/imageProcessing';

export async function POST(request: Request) {
    try {
        // Parse FormData
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const bucket = formData.get('bucket') as string || 'products'; // Default bucket
        const path = formData.get('path') as string; // Optional custom path
        
        // Image processing options
        const cropData = formData.get('crop'); // JSON string with {x, y, width, height}
        const resizeData = formData.get('resize'); // JSON string with {width, height, fit}
        const quality = formData.get('quality'); // 1-100
        const format = formData.get('format') as 'jpeg' | 'png' | 'webp'; // Output format
        const createThumb = formData.get('createThumbnail') === 'true'; // Generate thumbnail
        const optimize = formData.get('optimize') === 'true'; // Auto-optimize for web

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        let buffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer));

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
