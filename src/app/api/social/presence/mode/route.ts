import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/social/presence/mode
 * 
 * Set user's presence mode (Focus/Open) per spec.
 * - focus: Private, not visible to others
 * - open: Visible to connected users at same store
 */

// Helper to extract and validate user from auth token
async function getAuthenticatedUserId(request: Request): Promise<{ userId: string | null; error?: string }> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return { userId: null, error: 'Authorization required' };
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return { userId: null, error: 'Invalid token' };
    }
    
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            return { userId: null, error: 'Invalid authentication token' };
        }
        return { userId: data.user.id };
    } catch {
        return { userId: null, error: 'Authentication failed' };
    }
}

const VALID_MODES = ['open', 'focus'] as const;
type PresenceMode = typeof VALID_MODES[number];

export async function POST(request: Request) {
    try {
        const { userId, error: authError } = await getAuthenticatedUserId(request);
        if (authError || !userId) {
            return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { mode } = body;

        if (!mode || !VALID_MODES.includes(mode)) {
            return NextResponse.json({ 
                error: `Invalid mode. Valid options: ${VALID_MODES.join(', ')}` 
            }, { status: 400 });
        }

        // Check if user has presence record
        const { data: existingPresence } = await supabaseAdmin
            .from('user_presence')
            .select('user_id, store_id')
            .eq('user_id', userId)
            .single();

        if (!existingPresence) {
            // Create new presence record with focus mode (no store)
            const { error: insertError } = await supabaseAdmin
                .from('user_presence')
                .insert({
                    user_id: userId,
                    mode: mode as PresenceMode,
                    store_id: null,
                    last_seen: new Date().toISOString()
                });

            if (insertError) {
                console.error('Presence insert error:', insertError);
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }
        } else {
            // Update existing presence
            await supabaseAdmin.rpc('update_presence_mode', {
                p_user_id: userId,
                p_mode: mode
            });
        }

        return NextResponse.json({ 
            success: true, 
            mode 
        });

    } catch (error: any) {
        console.error('Set presence mode error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
