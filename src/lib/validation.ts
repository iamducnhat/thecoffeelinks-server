import { NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { logger } from './logger';

interface ValidationResult<T> {
    success: boolean;
    data?: T;
    error?: any;
}

export async function validateRequest<T>(
    request: Request,
    schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
    try {
        const body = await request.clone().json(); // Clone to allow re-reading if needed
        const result = schema.safeParse(body);

        if (!result.success) {
            return { success: false, error: result.error.issues };
        }

        return { success: true, data: result.data };
    } catch (e) {
        logger.warn('JSON parsing failed during validation', { error: String(e) });
        return { success: false, error: 'Invalid JSON body' };
    }
}

export function validateSearchParams<T>(
    params: URLSearchParams,
    schema: ZodSchema<T>
): ValidationResult<T> {
    try {
        // Convert searchParams to object
        const obj: any = {};
        params.forEach((value, key) => {
            // Handle multiple values if needed, for now simple overwrite
            obj[key] = value;
        });

        const result = schema.safeParse(obj);
        if (!result.success) {
            return { success: false, error: result.error.issues };
        }
        return { success: true, data: result.data };
    } catch (e) {
        return { success: false, error: 'Invalid search params' };
    }
}
