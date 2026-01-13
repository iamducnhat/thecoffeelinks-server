import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

export function middleware(request: NextRequest) {
    const origin = request.headers.get('origin') || ''
    const allowedOrigins = getAllowedOrigins()
    
    // Check if origin is allowed (or if no origin header for same-origin/mobile requests)
    const isAllowedOrigin = !origin || allowedOrigins.includes(origin) || origin.includes('localhost')
    
    // Determine the Access-Control-Allow-Origin value
    const corsOrigin = isAllowedOrigin ? (origin || '*') : allowedOrigins[0]
    
    // Staff API routes require authentication
    const isStaffRoute = request.nextUrl.pathname.startsWith('/api/staff')
    
    if (isStaffRoute && STAFF_API_SECRET) {
        const authHeader = request.headers.get('X-Staff-Api-Key') || request.headers.get('Authorization')
        const providedKey = authHeader?.replace('Bearer ', '').replace('ApiKey ', '')
        
        if (providedKey !== STAFF_API_SECRET) {
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
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Staff-Api-Key',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '86400',
            },
        })
    }

    // For all other requests, add CORS and security headers
    const response = NextResponse.next()
    
    // CORS headers
    response.headers.set('Access-Control-Allow-Origin', corsOrigin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Staff-Api-Key')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    
    // Security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

    return response
}

export const config = {
    matcher: '/api/:path*',
}
