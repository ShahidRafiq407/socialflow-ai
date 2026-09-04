-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'LINKEDIN', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'PINTEREST');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'AGENT');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandDNA" (
    "id" TEXT NOT NULL,
    "tone" TEXT,
    "missionVision" TEXT,
    "targetAudience" TEXT,
    "primaryColors" TEXT[],
    "forbiddenWords" TEXT[],
    "writingStyle" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandDNA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT,
    "accountId" TEXT NOT NULL DEFAULT '',
    "handle" TEXT NOT NULL DEFAULT '',
    "pageName" TEXT,
    "avatarUrl" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "chatSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "promptContext" TEXT NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "platformOverrides" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "platform" "Platform" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,
    "automationRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imagePrompt" TEXT,
    "format" TEXT,
    "hashtags" TEXT[],
    "mediaType" TEXT,
    "mediaSource" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "publishError" TEXT,
    "agentLogs" JSONB,
    "campaignTopic" TEXT,
    "campaignHook" TEXT,
    "captionHistory" JSONB,
    "mediaHistory" JSONB,
    "publishedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HashtagGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[],
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashtagGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthGoal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadTarget" INTEGER NOT NULL DEFAULT 150,
    "leadType" TEXT NOT NULL DEFAULT 'QUALIFIED_LEADS',
    "customLeadTypeName" TEXT,
    "timeframeDays" INTEGER NOT NULL DEFAULT 60,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetPlatforms" TEXT[] DEFAULT ARRAY['LinkedIn', 'Instagram', 'Facebook', 'TikTok']::TEXT[],
    "pausedPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    "statusReason" TEXT,
    "autopilotMode" TEXT NOT NULL DEFAULT 'ASSISTED',
    "autopilotPermissions" JSONB,
    "isAutopilotPaused" BOOLEAN NOT NULL DEFAULT false,
    "isPublishingPaused" BOOLEAN NOT NULL DEFAULT false,
    "strategy" JSONB,
    "decisions" JSONB,
    "experiments" JSONB,
    "metricSnapshots" JSONB,
    "lastAuditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Workspace_userId_idx" ON "Workspace"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandDNA_workspaceId_key" ON "BrandDNA"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandDNA_workspaceId_idx" ON "BrandDNA"("workspaceId");

-- CreateIndex
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_workspaceId_platform_key" ON "SocialAccount"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "Competitor_workspaceId_idx" ON "Competitor"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatSession_workspaceId_idx" ON "ChatSession"("workspaceId");

-- CreateIndex
CREATE INDEX "Message_chatSessionId_idx" ON "Message"("chatSessionId");

-- CreateIndex
CREATE INDEX "Memory_workspaceId_idx" ON "Memory"("workspaceId");

-- CreateIndex
CREATE INDEX "Memory_category_idx" ON "Memory"("category");

-- CreateIndex
CREATE INDEX "AutomationRule_workspaceId_idx" ON "AutomationRule"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentPost_workspaceId_idx" ON "ContentPost"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentPost_automationRuleId_idx" ON "ContentPost"("automationRuleId");

-- CreateIndex
CREATE INDEX "Post_workspaceId_idx" ON "Post"("workspaceId");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "HashtagGroup_workspaceId_idx" ON "HashtagGroup"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthGoal_workspaceId_key" ON "GrowthGoal"("workspaceId");

-- CreateIndex
CREATE INDEX "GrowthGoal_workspaceId_idx" ON "GrowthGoal"("workspaceId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandDNA" ADD CONSTRAINT "BrandDNA_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HashtagGroup" ADD CONSTRAINT "HashtagGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthGoal" ADD CONSTRAINT "GrowthGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

