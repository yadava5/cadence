-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TagType" AS ENUM ('DATE', 'TIME', 'PRIORITY', 'LOCATION', 'PERSON', 'LABEL', 'PROJECT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleId" TEXT,
    "googleRefreshToken" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "description" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "recurrence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT,
    "calendarId" TEXT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8B5CF6',
    "icon" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "task_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "scheduledDate" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "originalInput" TEXT,
    "cleanTitle" TEXT,
    "userId" TEXT NOT NULL,
    "taskListId" TEXT NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TagType" NOT NULL,
    "color" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_tags" (
    "taskId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "iconName" TEXT NOT NULL,

    CONSTRAINT "task_tags_pkey" PRIMARY KEY ("taskId","tagId")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE INDEX "calendars_userId_idx" ON "calendars"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_userId_name_key" ON "calendars"("userId", "name");

-- CreateIndex
CREATE INDEX "events_userId_idx" ON "events"("userId");

-- CreateIndex
CREATE INDEX "events_calendarId_idx" ON "events"("calendarId");

-- CreateIndex
CREATE INDEX "events_start_end_idx" ON "events"("start", "end");

-- CreateIndex
CREATE INDEX "events_userId_start_end_idx" ON "events"("userId", "start", "end");

-- CreateIndex
CREATE INDEX "task_lists_userId_idx" ON "task_lists"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_lists_userId_name_key" ON "task_lists"("userId", "name");

-- CreateIndex
CREATE INDEX "tasks_userId_idx" ON "tasks"("userId");

-- CreateIndex
CREATE INDEX "tasks_taskListId_idx" ON "tasks"("taskListId");

-- CreateIndex
CREATE INDEX "tasks_completed_idx" ON "tasks"("completed");

-- CreateIndex
CREATE INDEX "tasks_scheduledDate_idx" ON "tasks"("scheduledDate");

-- CreateIndex
CREATE INDEX "tasks_userId_completed_idx" ON "tasks"("userId", "completed");

-- CreateIndex
CREATE INDEX "tasks_userId_taskListId_completed_idx" ON "tasks"("userId", "taskListId", "completed");

-- CreateIndex
CREATE INDEX "tasks_userId_scheduledDate_idx" ON "tasks"("userId", "scheduledDate");

-- CreateIndex
CREATE INDEX "tasks_createdAt_idx" ON "tasks"("createdAt");

-- CreateIndex
CREATE INDEX "tags_userId_idx" ON "tags"("userId");

-- CreateIndex
CREATE INDEX "tags_type_idx" ON "tags"("type");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_userId_name_key" ON "tags"("userId", "name");

-- CreateIndex
CREATE INDEX "task_tags_taskId_idx" ON "task_tags"("taskId");

-- CreateIndex
CREATE INDEX "task_tags_tagId_idx" ON "task_tags"("tagId");

-- CreateIndex
CREATE INDEX "attachments_taskId_idx" ON "attachments"("taskId");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "task_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

