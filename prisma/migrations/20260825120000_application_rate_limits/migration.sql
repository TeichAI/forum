-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "subject" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("subject", "scope")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
