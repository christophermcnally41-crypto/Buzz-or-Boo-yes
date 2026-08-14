/**
 * Local structural interface — pool from @workspace/db satisfies this shape.
 * Using a structural type avoids importing 'pg' directly into the api-server
 * package, which does not declare pg as a dependency.
 *
 * query is non-generic here: the SUT casts rows to IndexRow internally,
 * so callers (and test mocks) only need to return Record<string, unknown>[].
 */
export interface QueryablePool {
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Result row returned by the catalog sanity check.
 * @internal
 */
interface IndexRow {
  indisvalid: boolean;
  indisunique: boolean;
  /** Number of key attributes (excludes INCLUDE columns; avoids composite false-positives). */
  num_key_cols: number;
  /** true when all key columns are plain columns (no expression keys). */
  no_expressions: boolean;
  /** Name of the first (and, if num_key_cols = 1, only) key column. */
  key_column: string | null;
  /** pg_get_expr output — e.g. "((status)::text = 'OPEN'::text)" */
  predicate: string | null;
}

/**
 * Returns true when the pg_get_expr predicate string represents exactly
 * `status = 'OPEN'` with a bare equality operator (not !=, <=, >=, <>).
 *
 * The function strips one level of wrapping parentheses that pg_get_expr adds
 * to the predicate tree, then matches the remainder against an anchored pattern
 * that requires the ENTIRE stripped expression to be `status = 'OPEN'` with
 * optional casts and optional parens around the bare `status` identifier.
 *
 * Accepted forms (with optional casts and surrounding parentheses from pg_get_expr):
 *   ((status)::text = 'OPEN'::text)   — PostgreSQL 14+ standard
 *   (status = 'OPEN')                  — without casts
 *   ('OPEN'::text = (status)::text)    — literal-first form
 *   ((status)::character varying = 'OPEN'::character varying)
 *
 * Rejected forms (all explicitly covered by tests):
 *   lower(status) = 'OPEN'             — expression-wrapped column
 *   (lower(status))::text = 'OPEN'     — cast of expression
 *   status != 'OPEN'                   — inequality operator
 *   status = 'OPEN' AND ...            — extra conditions
 *   NOT (status = 'OPEN')              — negation
 *   title = 'OPEN'                     — wrong column
 *
 * @internal
 */
function predicateScopesStatusToOpen(predicate: string): boolean {
  // Strip the single outer paren that pg_get_expr wraps the predicate in.
  let p = predicate.trim();
  if (p.startsWith("(") && p.endsWith(")")) {
    p = p.slice(1, -1).trim();
  }

  // Optional cast suffix accepted on both operands: ::text or ::character varying.
  // Anchored (^ … $) so the ENTIRE stripped predicate must match — any extra
  // conditions, operators, or function wrappers cause rejection.
  //
  // Column patterns:
  //   \(?\s*status\s*\)?  — bare `status` with optional wrapping parens (no prefix).
  //   This explicitly rejects function-wrapped forms like `lower(status)` because
  //   those would start the match with `lower(` before the `(` or `status` the
  //   pattern requires at position 0.
  const CAST       = "(?:::(?:text|character varying))?";
  const BARE_COL   = `\\(?\\s*status\\s*\\)?${CAST}`;
  const LITERAL    = `'OPEN'${CAST}`;

  const statusFirst = new RegExp(`^${BARE_COL}\\s*=\\s*${LITERAL}$`, "i");
  const openFirst   = new RegExp(`^${LITERAL}\\s*=\\s*${BARE_COL}$`, "i");

  return statusFirst.test(p) || openFirst.test(p);
}

/**
 * Assert that all structural database invariants required for safe operation
 * are in place before the server begins accepting traffic.
 *
 * Checks the following properties of the `markets_open_title_unique` index:
 *   1. It exists on the `markets` table in the current search-path schema.
 *   2. `indisvalid = true`       — the CONCURRENTLY build completed successfully.
 *   3. `indisunique = true`      — it is genuinely a UNIQUE index.
 *   4. `indnkeyatts = 1`         — exactly one key column (not a composite index).
 *   5. No expression keys        — the key is a plain column, not a computed value.
 *   6. Key column is `title`     — confirms arbiter for ON CONFLICT (title).
 *   7. Predicate is `status = 'OPEN'` — confirms partial scope for open editions only.
 *
 * @throws {Error} with a descriptive, actionable message if any check fails.
 *   The caller is responsible for logging and exiting the process.
 */
export async function assertRequiredIndexes(pool: QueryablePool): Promise<void> {
  const { rows: rawRows } = await pool.query(`
    SELECT
      i.indisvalid,
      i.indisunique,
      i.indnkeyatts                        AS num_key_cols,
      (i.indexprs IS NULL)                 AS no_expressions,
      (
        SELECT a.attname
        FROM   pg_attribute a
        WHERE  a.attrelid = i.indrelid
          AND  a.attnum   = i.indkey[0]
      )                                    AS key_column,
      pg_get_expr(i.indpred, i.indrelid)   AS predicate
    FROM pg_class     c_idx
    JOIN pg_index     i     ON i.indexrelid = c_idx.oid
    JOIN pg_class     c_tbl ON c_tbl.oid    = i.indrelid
    JOIN pg_namespace n     ON n.oid         = c_tbl.relnamespace
    WHERE c_idx.relname = 'markets_open_title_unique'
      AND c_tbl.relname = 'markets'
      AND n.nspname     = current_schema()
  `);
  const rows = rawRows as unknown as IndexRow[];

  // ── 1. Index does not exist on the markets table ────────────────────────────
  if (rows.length === 0) {
    throw new Error(
      "Required index 'markets_open_title_unique' on table 'markets' does not exist. " +
      "Run scripts/post-merge.sh or apply " +
      "lib/db/src/migrations/0016_markets_open_title_unique_partial_idx.sql " +
      "before starting the server.",
    );
  }

  const row = rows[0];

  // ── 2. Index exists but the concurrent build was interrupted ────────────────
  if (!row.indisvalid) {
    throw new Error(
      "Index 'markets_open_title_unique' on 'markets' exists but is INVALID " +
      "(the concurrent build was likely interrupted by a duplicate key or crash). " +
      "Drop it and recreate: DROP INDEX markets_open_title_unique; " +
      "then re-run scripts/post-merge.sh.",
    );
  }

  // ── 3. Index exists and is valid but is not unique ──────────────────────────
  if (!row.indisunique) {
    throw new Error(
      "Index 'markets_open_title_unique' on 'markets' is not a UNIQUE index. " +
      "The ON CONFLICT guard requires a unique index to prevent duplicate successors. " +
      "Drop and recreate it via scripts/post-merge.sh.",
    );
  }

  // ── 4. Index has more than one key column (composite index) ─────────────────
  // A composite index on (title, status) is not a valid arbiter for
  // ON CONFLICT (title) WHERE status = 'OPEN'.
  if (row.num_key_cols !== 1) {
    throw new Error(
      `Index 'markets_open_title_unique' on 'markets' has ${row.num_key_cols} key ` +
      "column(s) but must have exactly one ('title'). A composite index is not " +
      "a valid conflict arbiter for ON CONFLICT (title). " +
      "Drop and recreate it via scripts/post-merge.sh.",
    );
  }

  // ── 5. Index has expression keys — cannot be a plain column index ──────────
  if (!row.no_expressions) {
    throw new Error(
      "Index 'markets_open_title_unique' on 'markets' uses expression keys, " +
      "not a plain column. It cannot serve as the conflict arbiter for " +
      "ON CONFLICT (title). Drop and recreate it via scripts/post-merge.sh.",
    );
  }

  // ── 6. The sole key column is not 'title' ───────────────────────────────────
  if (row.key_column !== "title") {
    throw new Error(
      `Index 'markets_open_title_unique' on 'markets' is keyed on ` +
      `'${row.key_column ?? "<unknown>"}' rather than 'title'. ` +
      "It cannot serve as the conflict arbiter for ON CONFLICT (title). " +
      "Drop and recreate it via scripts/post-merge.sh.",
    );
  }

  // ── 7. Predicate does not scope to exactly status = 'OPEN' ─────────────────
  if (!row.predicate || !predicateScopesStatusToOpen(row.predicate)) {
    throw new Error(
      `Index 'markets_open_title_unique' on 'markets' has an unexpected predicate: ` +
      `${JSON.stringify(row.predicate)}. ` +
      "Expected a partial index WHERE status = 'OPEN' (bare equality, no extra conditions). " +
      "Drop and recreate it via scripts/post-merge.sh.",
    );
  }
}
