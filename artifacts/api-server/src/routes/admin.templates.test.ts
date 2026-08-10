/**
 * Integration tests for the Live Franchise template system
 *
 * Covers:
 *   GET  /admin/templates            — list templates (auth required)
 *   POST /admin/templates            — create a template (auth required)
 *   POST /admin/templates/:id/create-market — instantiate a market (auth required)
 *   Anonymous callers receive 401 on all write + read endpoints
 *   Markets created from a template record the correct templateId and category
 *   Default duration is applied when closesAt is omitted
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, pool, marketsTable, marketTemplatesTable } from '@workspace/db';
import adminRouter from './admin.js';

// ─── App factories ──────────────────────────────────────────────────────────

/** Authenticated admin app — injects a fake authenticated user. */
function buildAuthedApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    _req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    _req.user = { id: 'test-admin' } as Express.User;
    next();
  });
  app.use(adminRouter);
  return app;
}

/** Unauthenticated app — simulates an anonymous caller. */
function buildAnonApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    _req.isAuthenticated = (() => false) as Request['isAuthenticated'];
    next();
  });
  app.use(adminRouter);
  return app;
}

// ─── Fixture tracking ───────────────────────────────────────────────────────

const createdTemplateIds: number[] = [];
const createdMarketIds: number[] = [];
const RUN_ID = Date.now();

afterEach(async () => {
  if (createdMarketIds.length) {
    for (const id of createdMarketIds) {
      await db.delete(marketsTable).where(eq(marketsTable.id, id));
    }
    createdMarketIds.length = 0;
  }
  if (createdTemplateIds.length) {
    for (const id of createdTemplateIds) {
      await db.delete(marketTemplatesTable).where(eq(marketTemplatesTable.id, id));
    }
    createdTemplateIds.length = 0;
  }
});

afterAll(async () => {
  await pool.end();
});

// ─── Helper ─────────────────────────────────────────────────────────────────

async function insertTemplate(overrides: Partial<{
  franchiseName: string;
  engine: string;
  templateQuestion: string;
  clockType: string;
  category: string;
  defaultDurationDays: number;
}> = {}) {
  const [row] = await db.insert(marketTemplatesTable).values({
    franchiseName: overrides.franchiseName ?? `TEST_FRANCHISE_${RUN_ID}`,
    engine: overrides.engine ?? 'BUZZ_OR_BOO',
    templateQuestion: overrides.templateQuestion ?? 'Is [SUBJECT] BUZZ or BOO?',
    clockType: overrides.clockType ?? 'NOW',
    category: overrides.category ?? 'CULTURE',
    defaultDurationDays: overrides.defaultDurationDays ?? 3,
  }).returning();
  createdTemplateIds.push(row.id);
  return row;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GET /admin/templates', () => {
  it('returns 401 for anonymous callers', async () => {
    const res = await request(buildAnonApp()).get('/admin/templates');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it('returns a templates array for authenticated callers', async () => {
    const template = await insertTemplate({ franchiseName: `LIST_TEST_${RUN_ID}` });
    const res = await request(buildAuthedApp()).get('/admin/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
    const found = res.body.templates.find((t: any) => t.id === template.id);
    expect(found).toBeDefined();
    expect(found.franchiseName).toBe(`LIST_TEST_${RUN_ID}`);
    expect(found.engine).toBe('BUZZ_OR_BOO');
  });
});

describe('POST /admin/templates', () => {
  it('returns 401 for anonymous callers', async () => {
    const res = await request(buildAnonApp())
      .post('/admin/templates')
      .send({
        franchiseName: 'ANON_TEST',
        engine: 'BUZZ_OR_BOO',
        templateQuestion: 'Is [SUBJECT] worth it?',
        clockType: 'NOW',
        category: 'CULTURE',
        defaultDurationDays: 5,
      });
    expect(res.status).toBe(401);
  });

  it('creates a template and returns 201 for authenticated callers', async () => {
    const payload = {
      franchiseName: `CREATE_TEST_${RUN_ID}`,
      engine: 'MULTI_CHOICE',
      templateQuestion: 'Which is HOTTEST: [VENUE A], [VENUE B], or [VENUE C]?',
      clockType: 'NOW',
      category: 'CITY',
      defaultDurationDays: 7,
      description: 'Test franchise',
    };
    const res = await request(buildAuthedApp()).post('/admin/templates').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.franchiseName).toBe(payload.franchiseName);
    expect(res.body.engine).toBe('MULTI_CHOICE');
    createdTemplateIds.push(res.body.id);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(buildAuthedApp())
      .post('/admin/templates')
      .send({ franchiseName: 'INCOMPLETE' }); // missing engine, templateQuestion, etc.
    expect(res.status).toBe(400);
  });
});

describe('POST /admin/templates/:id/create-market', () => {
  it('returns 401 for anonymous callers', async () => {
    const template = await insertTemplate();
    const res = await request(buildAnonApp())
      .post(`/admin/templates/${template.id}/create-market`)
      .send({ title: 'Test', filledQuestion: 'Is this BUZZ or BOO?', subcategory: 'test' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the template does not exist', async () => {
    const res = await request(buildAuthedApp())
      .post('/admin/templates/999999/create-market')
      .send({ title: 'Test', filledQuestion: 'Does this place buzz?', subcategory: 'test' });
    expect(res.status).toBe(404);
  });

  it('creates a market with the template category and records templateId', async () => {
    const template = await insertTemplate({ category: 'BEAUTY', engine: 'BUZZ_OR_BOO' });
    const res = await request(buildAuthedApp())
      .post(`/admin/templates/${template.id}/create-market`)
      .send({
        title: `Template Market ${RUN_ID}`,
        filledQuestion: `Is Glossier BUZZ or BOO?`,
        subcategory: 'Skincare',
      });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('BEAUTY');
    expect(res.body.marketFormat).toBe('BUZZ_OR_BOO');
    createdMarketIds.push(res.body.id);

    // Verify templateId is persisted in the database
    const [dbRow] = await db.select().from(marketsTable).where(eq(marketsTable.id, res.body.id));
    expect(dbRow).toBeDefined();
    expect(dbRow.templateId).toBe(template.id);
  });

  it('applies default duration when closesAt is omitted', async () => {
    const template = await insertTemplate({ defaultDurationDays: 5 });
    const before = new Date();
    const res = await request(buildAuthedApp())
      .post(`/admin/templates/${template.id}/create-market`)
      .send({
        title: `Duration Test ${RUN_ID}`,
        filledQuestion: 'Is this still buzzworthy?',
        subcategory: 'Trends',
      });
    expect(res.status).toBe(201);
    createdMarketIds.push(res.body.id);

    const closesAt = new Date(res.body.closesAt);
    const diffDays = (closesAt.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
    // Should be approximately 5 days (allow ±1 for test timing)
    expect(diffDays).toBeGreaterThan(4);
    expect(diffDays).toBeLessThan(6);
  });

  it('respects a provided closesAt override', async () => {
    const template = await insertTemplate({ defaultDurationDays: 30 });
    const customClose = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days
    const res = await request(buildAuthedApp())
      .post(`/admin/templates/${template.id}/create-market`)
      .send({
        title: `Close Override ${RUN_ID}`,
        filledQuestion: 'Will this brand bounce back?',
        subcategory: 'Labels',
        closesAt: customClose,
      });
    expect(res.status).toBe(201);
    createdMarketIds.push(res.body.id);

    const closesAt = new Date(res.body.closesAt);
    const customCloseDate = new Date(customClose);
    // Should be within 1 minute of the requested close date
    expect(Math.abs(closesAt.getTime() - customCloseDate.getTime())).toBeLessThan(60_000);
  });
});
