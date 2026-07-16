-- CreateTable
CREATE TABLE "GoogleAuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAuthToken_userId_key" ON "GoogleAuthToken"("userId");

-- CreateIndex
CREATE INDEX "GoogleAuthToken_userId_idx" ON "GoogleAuthToken"("userId");

-- AddForeignKey
ALTER TABLE "GoogleAuthToken" ADD CONSTRAINT "GoogleAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
