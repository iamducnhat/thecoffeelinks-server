import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export interface AuthResult {
    authorized: boolean;
    error?: string;
    userId?: string;
    role?: 'admin' | 'staff' | 'user';
}

export async function verifyAdminAccess(request: Request): Promise<AuthResult> {
    const adminKey = request.headers.get('X-Admin-Key');
    const adminSecret = process.env.ADMIN_SECRET;
    const requestId = request.headers.get('x-request-id') || 'unknown';

    if (adminKey && adminSecret && adminKey === adminSecret) {
        return { authorized: true, role: 'admin', userId: 'system-admin' };
    }

    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data.user) {
                // Here we could check for a specific admin role in public.users table or app_metadata
                // For now, assuming if they have a valid user token AND are calling an admin route, 
                // we might need an extra check. 
                // BUT the previous implementation accepted ANY valid user token for some admin routes? 
                // Wait, verifyAdminAccess implies they MUST be an admin. 
                // The previous code accepted ANY valid user. That seems like a flaw unless ALL users are admins.
                // Reverting to strict admin secret check OR checking a specific metadata claim would be safer.
                // However, to maintain backward compatibility with the existing "seamless" flow if the client relies on user tokens:

                // Let's assume for high security we ONLY accept the secret OR a user with specific metadata.
                // Since I don't see metadata setup, I will log this potential weakness but allow it IF that was the intent,
                // OR better, checking if the user email matches an admin list.

                // For safety: valid user is NOT automatically admin. 
                // I will add a check for app_metadata.role if it exists, otherwise deny generic users.
                const role = data.user.app_metadata?.role || data.user.user_metadata?.role;
                if (role === 'admin' || role === 'service_role') {
                    return { authorized: true, userId: data.user.id, role: 'admin' };
                }
            }
        } catch (e) {
            logger.error('Auth verification failed', { error: String(e), requestId });
        }
    }

    logger.security('Admin Access Denied', { requestId });
    return { authorized: false, error: 'Admin access required' };
}

export async function verifyStaffAccess(request: Request): Promise<AuthResult> {
    const staffSecret = process.env.STAFF_API_SECRET;
    const authHeader = request.headers.get('X-Staff-Api-Key') || request.headers.get('Authorization');
    const providedKey = authHeader?.replace('Bearer ', '').replace('ApiKey ', '');
    const requestId = request.headers.get('x-request-id') || 'unknown';

    if (staffSecret && providedKey === staffSecret) {
        return { authorized: true, role: 'staff', userId: 'system-staff' };
    }

    // Also allow real user tokens if they have 'staff' role
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data.user) {
                const role = data.user.app_metadata?.role || data.user.user_metadata?.role;
                if (role === 'staff' || role === 'admin') {
                    return { authorized: true, userId: data.user.id, role: 'staff' };
                }
            }
        } catch { }
    }

    logger.security('Staff Access Denied', { requestId });
    return { authorized: false, error: 'Staff access required' };
}
