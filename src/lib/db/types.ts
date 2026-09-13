import type { RowDataPacket } from "mysql2/promise";

export type TemplateStatus = "pending" | "approved" | "rejected" | "changes_requested";

export interface TemplateRow extends RowDataPacket {
    id: number;
    userId: number;
    type: "global" | "private";
    template_name: string;
    slug: string;
    msg_content: string;
    variables: string[] | string | null;
    status: TemplateStatus;
    reviewed_by: number | null;
    reviewed_at: Date | null;
    active: number;
    rejection_reason: string | null;
    createdAt: Date;
    updatedAt: Date;
    // joined
    owner_name?: string;
    owner_email?: string;
    reviewer_name?: string | null;
    sent_count?: number;
    human_review_open?: number;
}

export interface MessageRow extends RowDataPacket {
    id: number;
    userId: number;
    senderId: string | null;
    phoneNumber: string;
    message: string;
    isTest: number;
    purpose?: "customer" | "internal";
    deliveryStatus: string | null;
    deliveryCode: string | null;
    deliveryDetail: string | null;
    deliveredAt: Date | null;
    dlrReceivedAt: Date | null;
    dlrPayload: string | null;
    retryAttempts: number | null;
    providerId: string | null;
    providerResponse: string | null;
    cost: string | null;
    reason: string | null;
    transactionId: string | null;
    createdAt: Date;
    owner_name?: string;
    owner_email?: string;
    review_verdict?: "clean" | "marketing" | "unsure" | null;
    review_is_human?: number | null;
    review_reviewer?: string | null;
    review_confidence?: string | null;
}

export interface UserRow extends RowDataPacket {
    id: number;
    name: string;
    username: string;
    email: string;
    phone: string | null;
    role: "user" | "admin" | "superadmin";
    statuc: "active" | "suspended" | "banned";
    registered_at: Date | null;
    verifiedEmail: number;
    verifiedPhone: number;
    created_at: Date;
    balance?: string | null;
    messages_30d?: number;
    last_sign_in?: Date | null;
    keys_live?: number;
    keys_test?: number;
}

export interface SupportRow extends RowDataPacket {
    id: number;
    userId: number;
    subject: string;
    body: string;
    status: "open" | "answered" | "closed";
    priority: "normal" | "high";
    created_at: Date;
    updated_at: Date;
    owner_name?: string;
    owner_email?: string;
    reply_count?: number;
}

export interface SupportReplyRow extends RowDataPacket {
    id: number;
    messageId: number;
    authorId: number;
    authorRole: "user" | "admin";
    body: string;
    created_at: Date;
    author_name?: string;
}

export interface PaymentRow extends RowDataPacket {
    id: number;
    userId: number;
    amount: string;
    transaction_code: string | null;
    payment_method: string | null;
    transaction_status: string | null;
    currency: string | null;
    checkoutRequestID: string | null;
    responseDescription: string | null;
    transactionDate: Date | null;
    phone: string | null;
    purchaseType: string | null;
    created_at: Date;
    owner_name?: string;
    owner_email?: string;
}

export interface AuditRow extends RowDataPacket {
    id: number;
    adminId: number;
    action: string;
    targetType: string;
    targetId: number | null;
    reason: string | null;
    before_json: unknown;
    after_json: unknown;
    ip_address: string | null;
    created_at: Date;
    admin_name?: string;
}

export interface SignInRow extends RowDataPacket {
    id: number;
    userId: number | null;
    outcome: "success" | "failed";
    attempted_identifier: string | null;
    access_time: Date;
    ip_address: string | null;
    browser_name: string | null;
    os_name: string | null;
    device_type: string | null;
    user_name?: string | null;
}

export interface PricingRow extends RowDataPacket {
    id: number;
    registrationFee: string;
    tier1Min: number; tier1Max: number; tier1Price: string;
    tier2Min: number; tier2Max: number; tier2Price: string;
    tier3Min: number; tier3Max: number; tier3Price: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    isActive: number;
    created_at: Date;
}
