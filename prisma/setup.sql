-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CONSUMER', 'VENDOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('MUA', 'CATERING', 'DECORATION', 'PHOTOGRAPHY', 'ATTIRE', 'WEDDING_ORGANIZER', 'VENUE', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "BookingItemStatus" AS ENUM ('PENDING', 'ON_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_MEDIATION', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "fullName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "description" TEXT,
    "region" TEXT NOT NULL,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "kybVerified" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountName" TEXT,
    "pjpDestinationId" TEXT,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_services" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_projects" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "guestCount" INTEGER,
    "location" TEXT,
    "themePref" TEXT,
    "totalBudget" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_allocations" (
    "id" TEXT NOT NULL,
    "weddingProjectId" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "plannedAmount" INTEGER NOT NULL,
    "actualAmount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "weddingProjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_items" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorServiceId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "BookingItemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "platformFee" INTEGER NOT NULL,
    "pjpProvider" TEXT NOT NULL,
    "pjpTransactionId" TEXT,
    "qrisString" TEXT,
    "qrisImageUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_splits" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bookingItemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorAmount" INTEGER NOT NULL,
    "platformFeeAmount" INTEGER NOT NULL,
    "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "pjpTransferId" TEXT,

    CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "bookingItemId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrls" TEXT[],
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingItemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendation_logs" (
    "id" TEXT NOT NULL,
    "weddingProjectId" TEXT NOT NULL,
    "queryParams" JSONB NOT NULL,
    "candidateVendorIds" TEXT[],
    "recommendedPackage" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recommendation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_slots" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "amountPaid" INTEGER NOT NULL,

    CONSTRAINT "featured_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_phone_key" ON "accounts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_accountId_key" ON "vendors"("accountId");

-- CreateIndex
CREATE INDEX "vendors_category_region_idx" ON "vendors"("category", "region");

-- CreateIndex
CREATE INDEX "vendors_priceMin_priceMax_idx" ON "vendors"("priceMin", "priceMax");

-- CreateIndex
CREATE INDEX "vendor_services_vendorId_idx" ON "vendor_services"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_allocations_weddingProjectId_category_key" ON "budget_allocations"("weddingProjectId", "category");

-- CreateIndex
CREATE INDEX "booking_items_vendorId_status_idx" ON "booking_items"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_bookingId_key" ON "payments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pjpTransactionId_key" ON "payments"("pjpTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_splits_bookingItemId_key" ON "payment_splits"("bookingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_bookingItemId_key" ON "disputes"("bookingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_bookingItemId_key" ON "reviews"("bookingItemId");

-- CreateIndex
CREATE INDEX "featured_slots_vendorId_endDate_idx" ON "featured_slots"("vendorId", "endDate");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_projects" ADD CONSTRAINT "wedding_projects_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_weddingProjectId_fkey" FOREIGN KEY ("weddingProjectId") REFERENCES "wedding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_weddingProjectId_fkey" FOREIGN KEY ("weddingProjectId") REFERENCES "wedding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_vendorServiceId_fkey" FOREIGN KEY ("vendorServiceId") REFERENCES "vendor_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "booking_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "booking_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "booking_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation_logs" ADD CONSTRAINT "ai_recommendation_logs_weddingProjectId_fkey" FOREIGN KEY ("weddingProjectId") REFERENCES "wedding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_slots" ADD CONSTRAINT "featured_slots_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

