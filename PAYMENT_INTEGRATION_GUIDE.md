# Payment Integration Guide

This document outlines how to integrate real payment providers into TheCoffeeLinks application.

## Current Status: BYPASS MODE

The payment verification endpoint (`/api/payments/verify`) is currently in **bypass mode** for development purposes. All validation checks are skipped.

### To Enable Production Mode

In `/src/app/api/payments/verify/route.ts`:

```typescript
// Change from:
const BYPASS_PAYMENT_VALIDATION = true;

// To:
const BYPASS_PAYMENT_VALIDATION = false;
```

---

## Payment Flow Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Swift App     │───▶│   Server API    │───▶│ Payment Gateway │
│  (CheckoutView) │    │ /payments/verify│    │  (Stripe/VNPay) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        │  1. Send payment      │  2. Validate with     │
        │     details           │     payment provider  │
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                    3. Return payment token
                                │
                    4. Create order with token
```

---

## Supported Payment Methods

| Method    | Raw Value  | Provider         | Status       |
|-----------|------------|------------------|--------------|
| Cash      | `cash`     | N/A (in-store)   | ✅ Bypass OK |
| Card      | `card`     | Stripe           | ⏳ TODO      |
| MoMo      | `momo`     | MoMo API         | ⏳ TODO      |
| ZaloPay   | `zalopay`  | ZaloPay API      | ⏳ TODO      |

---

## Integration Steps by Provider

### 1. Stripe (International Cards)

#### Setup

```bash
npm install stripe
```

#### Environment Variables

```env
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
```

#### Implementation

```typescript
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16',
});

// In /api/payments/verify/route.ts
import { stripe } from '@/lib/stripe';

// Create PaymentIntent
const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Stripe uses cents
    currency: 'vnd',
    payment_method_types: ['card'],
    metadata: {
        storeId,
        itemCount: items.length,
    },
});

return {
    token: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
};
```

#### iOS Integration

```swift
// Add to Podfile or SPM
// pod 'StripePaymentSheet'

import StripePaymentSheet

// Configure Stripe
func configureStripe() {
    StripeAPI.defaultPublishableKey = "pk_test_xxxx"
}

// Present payment sheet
func presentPaymentSheet(clientSecret: String) async throws -> Bool {
    var configuration = PaymentSheet.Configuration()
    configuration.merchantDisplayName = "TheCoffeeLinks"
    
    let paymentSheet = PaymentSheet(
        paymentIntentClientSecret: clientSecret,
        configuration: configuration
    )
    
    // Present and handle result
}
```

---

### 2. VNPay (Vietnam Domestic)

#### Setup

```bash
npm install crypto-js querystring
```

#### Environment Variables

```env
VNPAY_TMN_CODE=XXXX
VNPAY_HASH_SECRET=xxxxx
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://your-app.com/api/payments/vnpay-return
```

#### Implementation

```typescript
// src/lib/vnpay.ts
import crypto from 'crypto';
import querystring from 'querystring';

export function createVNPayUrl(params: {
    amount: number;
    orderId: string;
    orderInfo: string;
    ipAddr: string;
}): string {
    const vnp_Params: Record<string, string> = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: process.env.VNPAY_TMN_CODE!,
        vnp_Amount: (params.amount * 100).toString(),
        vnp_CreateDate: formatDate(new Date()),
        vnp_CurrCode: 'VND',
        vnp_IpAddr: params.ipAddr,
        vnp_Locale: 'vn',
        vnp_OrderInfo: params.orderInfo,
        vnp_OrderType: 'food_delivery',
        vnp_ReturnUrl: process.env.VNPAY_RETURN_URL!,
        vnp_TxnRef: params.orderId,
    };

    const sortedParams = sortObject(vnp_Params);
    const signData = querystring.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET!);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return `${process.env.VNPAY_URL}?${signData}&vnp_SecureHash=${signed}`;
}
```

#### iOS Integration

```swift
// Open VNPay URL in Safari/WebView
func openVNPayPayment(url: String) {
    if let paymentURL = URL(string: url) {
        UIApplication.shared.open(paymentURL)
    }
}

// Handle return via deep link
// URL Scheme: thecoffeelinks://vnpay-return?vnp_ResponseCode=00
```

---

### 3. MoMo (Vietnam E-Wallet)

#### Setup

```bash
npm install axios
```

#### Environment Variables

```env
MOMO_PARTNER_CODE=XXXX
MOMO_ACCESS_KEY=xxxx
MOMO_SECRET_KEY=xxxx
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api
```

#### Implementation

```typescript
// src/lib/momo.ts
import crypto from 'crypto';
import axios from 'axios';

export async function createMoMoPayment(params: {
    amount: number;
    orderId: string;
    orderInfo: string;
}) {
    const requestId = `${Date.now()}_${params.orderId}`;
    const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY}&amount=${params.amount}&extraData=&ipnUrl=${process.env.MOMO_IPN_URL}&orderId=${params.orderId}&orderInfo=${params.orderInfo}&partnerCode=${process.env.MOMO_PARTNER_CODE}&redirectUrl=${process.env.MOMO_REDIRECT_URL}&requestId=${requestId}&requestType=captureWallet`;

    const signature = crypto
        .createHmac('sha256', process.env.MOMO_SECRET_KEY!)
        .update(rawSignature)
        .digest('hex');

    const response = await axios.post(`${process.env.MOMO_ENDPOINT}/create`, {
        partnerCode: process.env.MOMO_PARTNER_CODE,
        accessKey: process.env.MOMO_ACCESS_KEY,
        requestId,
        amount: params.amount,
        orderId: params.orderId,
        orderInfo: params.orderInfo,
        redirectUrl: process.env.MOMO_REDIRECT_URL,
        ipnUrl: process.env.MOMO_IPN_URL,
        requestType: 'captureWallet',
        extraData: '',
        signature,
        lang: 'vi',
    });

    return response.data;
}
```

#### iOS Integration

```swift
// MoMo provides SDK for iOS
// pod 'MoMoPayment'

import MoMoPayment

func payWithMoMo(amount: Int, orderId: String) {
    MoMoPayment.createPaymentInformation(
        action: .Pay,
        appScheme: "thecoffeelinks",
        merchantname: "TheCoffeeLinks",
        merchantcode: "MOMO_PARTNER_CODE",
        amount: amount,
        orderId: orderId,
        description: "Coffee order",
        fee: 0
    )
}

// Handle callback
func application(_ app: UIApplication, open url: URL, options: ...) -> Bool {
    if url.scheme == "thecoffeelinks" {
        // Parse MoMo response
        MoMoPayment.handleOpenURL(url)
        return true
    }
    return false
}
```

---

### 4. ZaloPay (Vietnam E-Wallet)

#### Environment Variables

```env
ZALOPAY_APP_ID=xxxx
ZALOPAY_KEY1=xxxx
ZALOPAY_KEY2=xxxx
ZALOPAY_ENDPOINT=https://sb-openapi.zalopay.vn/v2
```

#### Implementation

Similar to MoMo - uses HMAC signature verification and deep linking.

---

## Database Schema for Payments

```sql
-- Add to existing migrations

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    user_id UUID REFERENCES users(id),
    
    -- Payment details
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'VND',
    payment_method VARCHAR(50) NOT NULL,
    
    -- Provider data
    provider VARCHAR(50), -- 'stripe', 'vnpay', 'momo', 'zalopay'
    provider_transaction_id VARCHAR(255),
    provider_reference VARCHAR(255),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    -- 'pending', 'processing', 'verified', 'completed', 'failed', 'refunded'
    
    -- Metadata
    metadata JSONB,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for lookups
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_tx ON payments(provider_transaction_id);
```

---

## Security Checklist

Before going to production:

- [ ] **BYPASS_PAYMENT_VALIDATION** set to `false`
- [ ] All API keys stored in environment variables
- [ ] HTTPS enforced for all payment endpoints
- [ ] Webhook signature verification implemented
- [ ] Payment amounts validated server-side (not trusting client)
- [ ] Idempotency keys implemented for duplicate prevention
- [ ] Rate limiting on payment endpoints
- [ ] Logging and monitoring configured
- [ ] PCI DSS compliance reviewed (for card payments)
- [ ] Test all refund flows
- [ ] Implement payment timeout handling

---

## Testing

### Stripe Test Cards

| Card Number      | Scenario              |
|------------------|-----------------------|
| 4242424242424242 | Successful payment    |
| 4000000000000002 | Card declined         |
| 4000002500003155 | Requires 3D Secure    |

### VNPay Test Mode

Use sandbox URL and test credentials from VNPay dashboard.

### MoMo Test Mode

Use MoMo sandbox environment with test phone numbers.

---

## Quick Reference

### Current Payment Flow (Bypass Mode)

```swift
// iOS: CheckoutView.swift -> OrderService.swift
let token = try await service.verifyPayment(
    amount: total,
    paymentMethod: selectedPaymentMethod.rawValue,
    storeId: storeId,
    items: items
)
// Returns mock token like "PAY_XXXXXXXXXXXX"
```

### To-Do for Production

1. Implement provider-specific handlers in `/api/payments/verify`
2. Add webhook endpoints for async payment confirmations
3. Create database table for payment records
4. Update Swift app to handle provider-specific flows (SDK, deep links)
5. Add refund endpoint `/api/payments/refund`
6. Implement payment status polling for async methods

---

## Contact

For payment integration support, contact the backend team or refer to:
- [Stripe Docs](https://stripe.com/docs)
- [VNPay Docs](https://sandbox.vnpayment.vn/apis/)
- [MoMo Docs](https://developers.momo.vn/)
- [ZaloPay Docs](https://docs.zalopay.vn/)
