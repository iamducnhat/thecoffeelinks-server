import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/linkedin
 * LinkedIn OAuth2 with OpenID Connect authentication
 * 
 * Request body:
 * {
 *   "code": "linkedin_auth_code",
 *   "redirect_uri": "your_app_redirect_uri"
 * }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { code, redirect_uri } = body;

        if (!code) {
            return NextResponse.json({ error: 'Authorization code required' }, { status: 400 });
        }

        if (!redirect_uri) {
            return NextResponse.json({ error: 'Redirect URI required' }, { status: 400 });
        }

        const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
        const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;

        if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
            console.error('LinkedIn OAuth credentials not configured');
            return NextResponse.json({ 
                error: 'LinkedIn authentication not configured',
                message: 'Please contact support'
            }, { status: 503 });
        }

        // 1. Exchange authorization code for access token
        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri,
                client_id: LINKEDIN_CLIENT_ID,
                client_secret: LINKEDIN_CLIENT_SECRET,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            console.error('LinkedIn token exchange failed:', errorData);
            return NextResponse.json({ 
                error: 'Failed to authenticate with LinkedIn',
                details: errorData 
            }, { status: 400 });
        }

        const tokenData = await tokenResponse.json();
        const { access_token, id_token } = tokenData;

        // 2. Decode ID token to get user info (OpenID Connect)
        // ID token is a JWT with user info
        let userInfo: any;
        
        if (id_token) {
            // Decode ID token (base64 decode the payload)
            const tokenParts = id_token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                userInfo = {
                    sub: payload.sub, // LinkedIn user ID
                    email: payload.email,
                    email_verified: payload.email_verified,
                    name: payload.name,
                    given_name: payload.given_name,
                    family_name: payload.family_name,
                    picture: payload.picture,
                };
            }
        }

        // 3. Fetch detailed profile from LinkedIn API (optional, for more data)
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            // Merge with userInfo from ID token
            userInfo = { ...userInfo, ...profileData };
        }

        if (!userInfo || !userInfo.sub) {
            return NextResponse.json({ 
                error: 'Failed to fetch LinkedIn profile' 
            }, { status: 400 });
        }

        // 4. Check if user exists in Supabase by LinkedIn ID
        const linkedinId = `linkedin_${userInfo.sub}`;
        const email = userInfo.email;
        
        // Try to find existing user by LinkedIn provider ID
        const { data: existingUsers } = await supabaseAdmin
            .from('users')
            .select('id, email, auth_provider_id')
            .eq('auth_provider', 'linkedin')
            .eq('auth_provider_id', linkedinId)
            .limit(1);

        let userId: string;
        let isNewUser = false;

        if (existingUsers && existingUsers.length > 0) {
            // User exists, use their ID
            userId = existingUsers[0].id;
        } else {
            // Check if user exists by email (linking accounts)
            const { data: emailUsers } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', email)
                .limit(1);

            if (emailUsers && emailUsers.length > 0) {
                // Link LinkedIn to existing account
                userId = emailUsers[0].id;
                
                await supabaseAdmin
                    .from('users')
                    .update({
                        auth_provider: 'linkedin',
                        auth_provider_id: linkedinId,
                        linkedin_url: `https://www.linkedin.com/in/${userInfo.sub}`,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', userId);
            } else {
                // Create new user
                isNewUser = true;
                const { data: newUser, error: createError } = await supabaseAdmin
                    .from('users')
                    .insert({
                        email: email,
                        full_name: userInfo.name || `${userInfo.given_name} ${userInfo.family_name}`,
                        avatar_url: userInfo.picture,
                        auth_provider: 'linkedin',
                        auth_provider_id: linkedinId,
                        linkedin_url: `https://www.linkedin.com/in/${userInfo.sub}`,
                        email_verified: userInfo.email_verified || false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select('id')
                    .single();

                if (createError || !newUser) {
                    console.error('Failed to create user:', createError);
                    return NextResponse.json({ 
                        error: 'Failed to create user account',
                        details: createError 
                    }, { status: 500 });
                }

                userId = newUser.id;
            }
        }

        // 5. Create Supabase auth session using admin API
        // Use createUser if new user, or updateUserById to ensure auth user exists
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            email_confirm: userInfo.email_verified || true,
            user_metadata: {
                full_name: userInfo.name,
                avatar_url: userInfo.picture,
                linkedin_id: userInfo.sub,
                provider: 'linkedin',
            },
        });

        if (authError && authError.message !== 'User already registered') {
            console.error('Failed to create auth user:', authError);
            return NextResponse.json({ 
                error: 'Failed to create session',
                details: authError 
            }, { status: 500 });
        }

        // Generate session token using admin API
        const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
        });

        if (sessionError) {
            console.error('Failed to generate session:', sessionError);
            return NextResponse.json({ 
                error: 'Failed to create session',
                details: sessionError 
            }, { status: 500 });
        }

        // Return magic link URL that contains the tokens
        // The client should extract tokens from the URL or use it directly
        return NextResponse.json({
            success: true,
            user: {
                id: userId,
                email: email,
                full_name: userInfo.name,
                avatar_url: userInfo.picture,
                is_new_user: isNewUser
            },
            auth_url: sessionData.properties.action_link,
            message: 'Use auth_url to complete authentication'
        });

    } catch (error: any) {
        console.error('LinkedIn auth error:', error);
        return NextResponse.json({ 
            error: 'Internal server error',
            message: error.message 
        }, { status: 500 });
    }
}
