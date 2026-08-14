/**
 * Tests for the startup index assertion.
 *
 * Covers:
 *   1.  Index absent from `markets` → throws with remediation instructions
 *   2.  Index present but INVALID (interrupted concurrent build) → throws
 *   3.  Index present and valid but NOT UNIQUE → throws
 *   4.  Index present, valid, unique but composite (num_key_cols > 1) → throws
 *   5.  Index present, valid, unique, single-key but uses expression keys → throws
 *   6.  Index present, valid, unique, single plain key but keyed on wrong column → throws
 *   7.  Index present, valid, unique, plain 'title' key but predicate is null → throws
 *   8.  Index present, valid, unique, plain 'title' key but predicate is 'status != OPEN' → throws
 *   9.  Index present, valid, unique, plain 'title' key but predicate is 'status = OPEN AND ...' → throws
 *   10. Index present, valid, unique, plain 'title' key but predicate is 'title = OPEN' (wrong column) → throws
 *   11. Happy path — all checks pass (pg_get_expr with casts) → resolves without error
 *   12. Happy path — literal-first predicate form ('OPEN' = status) → resolves
 *   13. Happy path — predicate without casts (older PostgreSQL rendering) → resolves
 *   14. A same-named index on a different table is invisible (catalog filters by table) → throws
 *   15. Unexpected DB error propagates so the caller can exit the process
 *   16. Catalog query binds on table name, schema, key column count, and predicate expression
 */

import { describe, it, expect, vi } from "vitest";
import { assertRequiredIndexes } from "./assertRequiredIndexes.js";

// ---------------------------------------------------------------------------
// Local structural pool type — mirrors QueryablePool in the SUT
// without importing 'pg'.
// ---------------------------------------------------------------------------
interface QueryablePool {
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePool(
  rows: {
    indisvalid: boolean;
    indisunique: boolean;
    num_key_cols: number;
    no_expressions: boolean;
    key_column: string | null;
    predicate: string | null;
  }[],
): QueryablePool {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

function makeFailingPool(err: Error): QueryablePool {
  return { query: vi.fn().mockRejectedValue(err) };
}

// ---------------------------------------------------------------------------
// The expected valid row — what the catalog returns for a healthy index.
// pg_get_expr renders the predicate with casts on PostgreSQL 14+.
// ---------------------------------------------------------------------------
const VALID_ROW = {
  indisvalid: true,
  indisunique: true,
  num_key_cols: 1,
  no_expressions: true,
  key_column: "title",
  predicate: "((status)::text = 'OPEN'::text)",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assertRequiredIndexes", () => {
  // ── absence ───────────────────────────────────────────────────────────────

  it("throws when the index does not exist on the markets table", async () => {
    await expect(assertRequiredIndexes(makePool([]))).rejects.toThrow(
      /does not exist/,
    );
  });

  it("thrown message includes actionable remediation when index is absent", async () => {
    await expect(assertRequiredIndexes(makePool([]))).rejects.toThrow(
      /post-merge\.sh/,
    );
  });

  // ── validity ──────────────────────────────────────────────────────────────

  it("throws when the index is INVALID (interrupted concurrent build)", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, indisvalid: false }])),
    ).rejects.toThrow(/INVALID/);
  });

  it("thrown message for INVALID index includes DROP instruction", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, indisvalid: false }])),
    ).rejects.toThrow(/DROP INDEX/);
  });

  // ── uniqueness ────────────────────────────────────────────────────────────

  it("throws when the index is valid but NOT UNIQUE", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, indisunique: false }])),
    ).rejects.toThrow(/not a UNIQUE index/);
  });

  // ── composite key ────────────────────────────────────────────────────────

  it("throws when the index has more than one key column (composite index)", async () => {
    // e.g. UNIQUE INDEX ON markets (title, status) WHERE status = 'OPEN'
    // — valid arbiter target is ON CONFLICT (title, status), not ON CONFLICT (title)
    await expect(
      assertRequiredIndexes(
        makePool([{ ...VALID_ROW, num_key_cols: 2 }]),
      ),
    ).rejects.toThrow(/2 key column/);
  });

  it("thrown message for composite index mentions exactly one key column requirement", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, num_key_cols: 2 }])),
    ).rejects.toThrow(/exactly one/);
  });

  // ── expression keys ───────────────────────────────────────────────────────

  it("throws when the index uses expression keys instead of a plain column", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([{ ...VALID_ROW, no_expressions: false, key_column: null }]),
      ),
    ).rejects.toThrow(/expression keys/);
  });

  // ── key column ────────────────────────────────────────────────────────────

  it("throws when the sole key column is not 'title'", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, key_column: "status" }])),
    ).rejects.toThrow(/keyed on 'status' rather than 'title'/);
  });

  it("thrown message for wrong key column includes remediation", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, key_column: "question" }])),
    ).rejects.toThrow(/post-merge\.sh/);
  });

  // ── predicate — null / missing ────────────────────────────────────────────

  it("throws when the predicate is null (no WHERE clause — not a partial index)", async () => {
    await expect(
      assertRequiredIndexes(makePool([{ ...VALID_ROW, predicate: null }])),
    ).rejects.toThrow(/unexpected predicate/);
  });

  // ── predicate — wrong operator ────────────────────────────────────────────

  it("throws when the predicate uses != instead of = (status != 'OPEN')", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([{ ...VALID_ROW, predicate: "((status)::text != 'OPEN'::text)" }]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  it("throws when the predicate uses <> (status <> 'OPEN')", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([{ ...VALID_ROW, predicate: "((status)::text <> 'OPEN'::text)" }]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  // ── predicate — extra conditions ──────────────────────────────────────────

  it("throws when the predicate has extra AND conditions (status = 'OPEN' AND ...)", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([
          {
            ...VALID_ROW,
            predicate: "((status)::text = 'OPEN'::text AND (title IS NOT NULL))",
          },
        ]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  it("throws when the predicate is wrapped in NOT", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([
          { ...VALID_ROW, predicate: "NOT ((status)::text = 'OPEN'::text)" },
        ]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  // ── predicate — expression-wrapped column ────────────────────────────────

  it("throws when the predicate wraps status in a function call (lower(status) = 'OPEN')", async () => {
    // lower(status) = 'OPEN' contains 'status' and 'OPEN' but is a different
    // expression — PostgreSQL cannot infer it as the conflict arbiter for
    // ON CONFLICT (title) WHERE status = 'OPEN'.
    await expect(
      assertRequiredIndexes(
        makePool([
          { ...VALID_ROW, predicate: "(lower(status) = 'OPEN')" },
        ]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  it("throws when the predicate wraps status in a cast-of-expression form ((lower(status))::text = 'OPEN'::text)", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([
          {
            ...VALID_ROW,
            predicate: "((lower(status))::text = 'OPEN'::text)",
          },
        ]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  // ── predicate — wrong column ──────────────────────────────────────────────

  it("throws when the predicate references 'OPEN' but via the wrong column (title = 'OPEN')", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([{ ...VALID_ROW, predicate: "((title)::text = 'OPEN'::text)" }]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  it("throws when the predicate checks status but against a different value (status = 'CLOSED')", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([
          { ...VALID_ROW, predicate: "((status)::text = 'CLOSED'::text)" },
        ]),
      ),
    ).rejects.toThrow(/unexpected predicate/);
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it("resolves without error for the standard pg_get_expr output with casts", async () => {
    await expect(
      assertRequiredIndexes(makePool([VALID_ROW])),
    ).resolves.toBeUndefined();
  });

  it("resolves for the literal-first predicate form ('OPEN' = status)", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([
          { ...VALID_ROW, predicate: "('OPEN'::text = (status)::text)" },
        ]),
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves for predicate without casts — older PostgreSQL rendering", async () => {
    await expect(
      assertRequiredIndexes(
        makePool([{ ...VALID_ROW, predicate: "(status = 'OPEN')" }]),
      ),
    ).resolves.toBeUndefined();
  });

  // ── wrong-table guard ────────────────────────────────────────────────────

  it("treats a same-named index on a different table as absent (catalog query filters by table name)", async () => {
    // When the catalog query's c_tbl.relname = 'markets' filter excludes a
    // same-named index on another table, the result set is empty.
    await expect(assertRequiredIndexes(makePool([]))).rejects.toThrow(
      /does not exist/,
    );
  });

  // ── error propagation ────────────────────────────────────────────────────

  it("propagates unexpected DB errors so the caller can exit the process", async () => {
    const dbErr = new Error("connection refused");
    await expect(
      assertRequiredIndexes(makeFailingPool(dbErr)),
    ).rejects.toThrow("connection refused");
  });

  // ── catalog query shape ──────────────────────────────────────────────────

  it("catalog query pins index to markets table, current schema, requests key count and predicate", async () => {
    const pool = makePool([VALID_ROW]);
    const querySpy = pool.query as ReturnType<typeof vi.fn>;
    await assertRequiredIndexes(pool);

    expect(querySpy).toHaveBeenCalledOnce();
    const [sql] = querySpy.mock.calls[0] as [string];

    // Must bind the index relation to the 'markets' table
    expect(sql).toMatch(/c_tbl\.relname\s*=\s*'markets'/);
    // Must scope to the current search-path schema (not hardcode 'public')
    expect(sql).toMatch(/current_schema\(\)/);
    // Must request the predicate expression for predicate validation
    expect(sql).toMatch(/pg_get_expr/);
    // Must request the uniqueness flag
    expect(sql).toMatch(/indisunique/);
    // Must request the number of key columns (to catch composite indexes)
    expect(sql).toMatch(/indnkeyatts/);
    // Must resolve the key column name via pg_attribute
    expect(sql).toMatch(/pg_attribute/);
  });
});
