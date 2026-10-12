import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { KlingPipeline } from '@/studio/kling-pipeline';
import { user } from './auth.schema';

export const studioOrder = pgTable('studio_order', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  packId: text('pack_id').notNull(),
  cents: integer('cents').notNull(),
  videos: integer('videos').notNull(),
  currency: text('currency').notNull().default('USD'),
  acquiringOrderId: text('acquiring_order_id').unique(),
  checkoutUrl: text('checkout_url'),
  status: text('status').$type<'pending' | 'paid' | 'closed'>().notNull().default('pending'),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ userIdx: index('studio_order_user_idx').on(table.userId) }));

export const studioVideo = pgTable('studio_video', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  sceneId: text('scene_id').notNull(),
  photoHash: text('photo_hash').notNull(),
  referenceUrl: text('reference_url').notNull(),
  requestBody: jsonb('request_body').$type<Record<string, unknown>>(),
  klingPipeline: jsonb('kling_pipeline').$type<KlingPipeline>(),
  providerTaskId: text('provider_task_id').unique(),
  status: text('status').$type<'reserved' | 'processing' | 'succeeded' | 'failed'>().notNull().default('reserved'),
  videoUrl: text('video_url'),
  failureReason: text('failure_reason'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  leaseOwner: text('lease_owner'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ userIdx: index('studio_video_user_idx').on(table.userId) }));
