import { db } from './connection.js';

export type Entity = 'recipes' | 'collections';

const stmtRead = db.prepare<[string]>('SELECT next_id FROM id_sequence WHERE entity = ?');
const stmtWrite = db.prepare<[string, number]>(
  'INSERT INTO id_sequence (entity, next_id) VALUES (?, ?)' +
    ' ON CONFLICT(entity) DO UPDATE SET next_id = excluded.next_id',
);

/**
 * Seeds a counter from the rows already present, so an existing database
 * (or a freshly seeded one) never hands out an id that is currently in use.
 */
function highestExistingId(entity: Entity): number {
  const row = db.prepare(`SELECT MAX(CAST(id AS INTEGER)) AS mx FROM ${entity}`).get() as {
    mx: number | null;
  };
  return row.mx ?? 0;
}

/**
 * Allocates the next id for an entity and advances the counter atomically.
 *
 * Ids are never reused: the counter only ever moves forward, even when the
 * highest-numbered row is deleted.
 */
export const allocateId = db.transaction((entity: Entity): string => {
  const row = stmtRead.get(entity) as { next_id: number } | undefined;
  const next = row?.next_id ?? highestExistingId(entity) + 1;
  stmtWrite.run(entity, next + 1);
  return String(next);
});

/** Re-derive every counter from current table contents — used after a reset. */
export function resyncSequences(): void {
  for (const entity of ['recipes', 'collections'] as const) {
    stmtWrite.run(entity, highestExistingId(entity) + 1);
  }
}
