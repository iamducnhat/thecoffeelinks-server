import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * POST /api/payments/verify
 * 
 * Payment verification endpoint.
 * 
 * ============================================================
 * CONFIGURATION:
 * Set PAYMENT_MODE environment variable:
 * - 'production' = Requires real payment integration (fails without it)
 * - 'sandbox' = Validates inputs but returns mock success
 * - 'bypass' = No validation (DEVELOPMENT ONLY - NOT FOR PRODUCTION)
 * ============================================================
 * 
 * In production, this should integrate with a real payment gateway:
 * - Stripe (International cards)
 * - VNPay (Vietnam domestic cards/banks)  
 * - MoMo (Vietnam e-wallet)
 * - ZaloPay (Vietnam e-wallet)
 */

type PaymentMode = 'production' | 'sandbox' | 'bypass';

const getPaymentMode = (): PaymentMode => {
    const mode = process.env.PAYMENT_MODE?.toLowerCase();
    if (mode === 'production' || mode === 'sandbox' || mode === 'bypass') {
        return mode;
    }
    // Default to sandbox for safety (validates but doesn't require real gateway)
    return 'sandbox';
};

export async function POST(request: Request) {
    try {
        const paymentMode = getPaymentMode();
        const body = await request.json();
        const { amount, paymentMethod, storeId, items } = body;

        // ============================================================
        // MODE-BASED BEHAVIOR
        // ============================================================
        
        if (paymentMode === 'production') {
            // PRODUCTION MODE: Require real payment gateway integration
            // This will fail until a real gateway is integrated
            return NextResponse.json(
                { 
                    success: false, 
                    error: 'Payment gateway not configured. Please contact support.',
                    mode: 'production'
                },
                { status: 503 }
            );
        }
        
        if (paymentMode === 'bypass') {
            // BYPASS MODE: Skip all validation (DANGEROUS - dev only)
            console.warn('🚨 PAYMENT BYPASS MODE ACTIVE - THIS IS NOT SAFE FOR PRODUCTION!');
        } else {
            // SANDBOX MODE: Validate inputs but return mock success
            if (!amount || amount <= 0) {
                return NextResponse.json(
                    { success: false, error: 'Invalid payment amount' },
                    { status: 400 }
                );
            }

            if (!paymentMethod) {
                return NextResponse.json(
                    { success: false, error: 'Payment method is required' },
                    { status: 400 }
                );
            }

            if (!items || items.length === 0) {
                return NextResponse.json(
                    { success: false, error: 'No items in order' },
                    { status: 400 }
                );
            }
            
            // Validate payment method is supported
            const supportedMethods = ['card', 'momo', 'zalopay', 'apple_pay', 'points'];
            if (!supportedMethods.includes(paymentMethod)) {
                return NextResponse.json(
                    { success: false, error: `Unsupported payment method: ${paymentMethod}` },
                    { status: 400 }
                );
            }
        }

        // Generate mock payment token
        const paymentToken = `PAY_${paymentMode.toUpperCase()}_${randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`;

        // Simulate payment processing delay (300-800ms)
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

        const paymentRecord = {
            token: paymentToken,
            amount,
            paymentMethod,
            storeId: storeId || null,
            status: 'verified',
            mode: paymentMode,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
        };

        // Only log in non-production to avoid leaking payment info
        if (paymentMode !== 'production') {
            console.log(`Payment verified (${paymentMode.toUpperCase()}):`, paymentRecord);
        }

        return NextResponse.json({
            success: true,
            payment: {
                token: paymentToken,
                status: 'verified',
                amount,
                expiresAt: paymentRecord.expiresAt,
            },
            // Include mode in response so clients know this is sandbox/test
            _mode: paymentMode !== 'production' ? paymentMode : undefined,
        });

    } catch (error: any) {
        console.error('Payment verification error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Payment verification failed' },
            { status: 500 }
        );
    }
}
