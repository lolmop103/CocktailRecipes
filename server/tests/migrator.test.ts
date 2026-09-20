import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '../src/data/migrator.js';
import { MIGRATIONS } from '../src/data/migrations/index.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  ).map((r) => r.name);
}

function appliedVersions(db: Database.Database): number[] {
  return (
    db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
      version: number;
    }[]
  ).map((r) => r.version);
}

describe('migrate', () => {
  it('createsEverySchemaObject_onAFreshDatabase', () => {
    const db = freshDb();

    migrate(db);

    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        'recipes',
        'recipe_ingredients',
        'ingredient_meta',
        'collections',
        'collection_recipes',
        'id_sequence',
        'schema_migrations',
      ]),
    );
  });

  it('records_everyMigration_itApplied', () => {
    const db = freshDb();

    migrate(db);

    expect(appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it('isIdempotent_acrossRepeatedRuns', () => {
    const db = freshDb();

    migrate(db);
    const first = appliedVersions(db);
    migrate(db);

    expect(appliedVersions(db)).toEqual(first);
  });

  it('appliesOnlyPendingMigrations', () => {
    const db = freshDb();
    migrate(db);

    // Pretend the newest migration had not run yet.
    const newest = MIGRATIONS[MIGRATIONS.length - 1]!;
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(newest.version);
    db.exec('DROP TABLE collection_recipes');
    db.exec(`CREATE TABLE collection_recipes (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      recipe_id     TEXT NOT NULL,
      PRIMARY KEY (collection_id, recipe_id)
    )`);

    migrate(db);

    expect(appliedVersions(db)).toContain(newest.version);
  });

  it('usesUniqueVersions_inOrder', () => {
    const versions = MIGRATIONS.map((m) => m.version);

    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});

describe('migration 004 — collection_recipes foreign key', () => {
  it('addsRecipeForeignKey_toAnExistingTableThatLacksIt', () => {
    const db = freshDb();

    migrate(db);

    const ddl = (
      db.prepare("SELECT sql FROM sqlite_master WHERE name='collection_recipes'").get() as {
        sql: string;
      }
    ).sql;
    // `CREATE TABLE IF NOT EXISTS` could never have added this to a live database.
    expect(ddl).toContain('REFERENCES recipes(id)');
  });

  it('rejects_membershipRowsForUnknownRecipes', () => {
    const db = freshDb();
    migrate(db);
    db.prepare("INSERT INTO collections (id, name) VALUES ('1', 'Party')").run();

    expect(() =>
      db.prepare("INSERT INTO collection_recipes VALUES ('1', 'no-such-recipe')").run(),
    ).toThrow();
  });

  it('preservesValidRows_whileDroppingOrphans', () => {
    const db = freshDb();
    migrate(db);

    // Rewind to the pre-FK shape, with one good row and one orphan.
    db.pragma('foreign_keys = OFF');
    db.exec('DROP TABLE collection_recipes');
    db.exec(`CREATE TABLE collection_recipes (
      collection_id TEXT NOT NULL,
      recipe_id     TEXT NOT NULL,
      PRIMARY KEY (collection_id, recipe_id)
    )`);
    db.prepare("INSERT INTO collections (id, name) VALUES ('1', 'Party')").run();
    db.prepare("INSERT INTO recipes (id, name, is_mocktail) VALUES ('10', 'Real Recipe', 0)").run();
    db.prepare("INSERT INTO collection_recipes VALUES ('1', '10')").run();
    db.prepare("INSERT INTO collection_recipes VALUES ('1', 'ghost')").run();
    db.prepare('DELETE FROM schema_migrations WHERE version = 4').run();
    db.pragma('foreign_keys = ON');

    migrate(db);

    const rows = db.prepare('SELECT recipe_id FROM collection_recipes').all() as {
      recipe_id: string;
    }[];
    expect(rows.map((r) => r.recipe_id)).toEqual(['10']);
  });
});
