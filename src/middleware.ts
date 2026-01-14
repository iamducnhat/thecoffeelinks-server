import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { publicRateLimiter, authRateLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// Allowed origins for CORS - configure via environment variables
const getAllowedOrigins = (): string[] => {
    const envOrigins = process.env.ALLOWED_ORIGINS
    if (envOrigins) {
        return envOrigins.split(',').map(o => o.trim())
    }
    // Default allowed origins (production + development)
    return [
        'https://thecoffeelinks-admin.vercel.app',
        'https://thecoffeelinks-staff.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
    ]
}

// Staff API secret for simple authentication
const STAFF_API_SECRET = process.env.STAFF_API_SECRET

export async function middleware(request: NextRequest) {
    const origin = request.headers.get('origin') || ''
    const allowedOrigins = getAllowedOrigins()
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

    // Correlation ID
    const requestId = crypto.randomUUID()
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-request-id', requestId)

    // Rate Limiting Logic
    let rateLimitResult
    const authHeader = request.headers.get('Authorization')

    // Determine Rate Limit bucket
    if (authHeader) {
        // Simple User ID extraction attempt (this is loose, ideally verify JWT signature here but expensive in edge)
        // We track by token hash or just IP for now if parsing fails, 
        // but for auth middleware usually we want to track user ID. 
        // Given edge limitations, we'll track by IP for now even for auth, 
        // to avoid complex JWT parsing deps in middleware unless essential.
        // Or track by the auth token signature itself as the key.
        const tokenPart = authHeader.substring(authHeader.length - 20) // Use tail of token as simplified key
        rateLimitResult = authRateLimiter.check(`${ip}:${tokenPart}`, 1000) // 1000 req/min for auth
    } else {
        rateLimitResult = publicRateLimiter.check(ip, 100) // 100 req/min for public
    }

    if (!rateLimitResult.success) {
        logger.security('Rate Limit Exceeded', { ip, requestId, path: request.nextUrl.pathname })
        return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            }
        })
    }

    // Check if origin is allowed (or if no origin header for same-origin/mobile requests)
    const isAllowedOrigin = !origin || allowedOrigins.includes(origin) || origin.includes('localhost')

    // Determine the Access-Control-Allow-Origin value
    const corsOrigin = isAllowedOrigin ? (origin || '*') : allowedOrigins[0]

    // Staff API routes require authentication
    const isStaffRoute = request.nextUrl.pathname.startsWith('/api/staff')

    if (isStaffRoute && STAFF_API_SECRET) {
        const staffKey = request.headers.get('X-Staff-Api-Key') || request.headers.get('Authorization')
        const providedKey = staffKey?.replace('Bearer ', '').replace('ApiKey ', '')

        if (providedKey !== STAFF_API_SECRET) {
            logger.security('Staff Auth Failed', { ip, requestId })
            return NextResponse.json(
                { error: 'Unauthorized: Invalid or missing staff API key' },
                {
                    status: 401,
                    headers: {
                        'Access-Control-Allow-Origin': corsOrigin,
                    }
                }
            )
        }
    }

    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Staff-Api-Key, X-Admin-Key',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '86400',
            },
        })
    }

    // For all other requests, add CORS and security headers
    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })

    // CORS headers
    response.headers.set('Access-Control-Allow-Origin', corsOrigin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Staff-Api-Key, X-Admin-Key')
    response.headers.set('Access-Control-Allow-Credentials', 'true')

    // Rate Limit Headers
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString())
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())

    // Security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY') // Clickjacking protection
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains') // HSTS
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()') // Deny sensitive features

    // Content Security Policy (Report-Only for now)
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.supabase.co https://*.vercel-scripts.com",
        "connect-src 'self' https://*.supabase.co https://*.vercel.app",
        "img-src 'self' blob: data: https://*.supabase.co",
        "style-src 'self' 'unsafe-inline'",
        "frame-ancestors 'none'",
    ].join('; ')

    response.headers.set('Content-Security-Policy-Report-Only', csp)

    // Pass correlation ID in response too for debugging
    response.headers.set('x-request-id', requestId)

    return response
}

export const config = {
    matcher: '/api/:path*',
}
