/**
 * `node dist/scripts/snapshot.js` (run inside the container with `docker exec`)
 *
 * Writes a verified copy of the database to `$DATA_DIR/snapshots/cocktail.db`
 * and prints its path. Reads `DATA_DIR` directly: it must not load the app's
 * env module, which would validate settings this command does not need.
 */
import { snapshotDatabase } from '../lib/snapshot.js';

const dataDir = process.env['DATA_DIR'];

try {
  if (!dataDir) throw new Error('DATA_DIR is not set');
  process.stdout.write(`${await snapshotDatabase(dataDir)}\n`);
} catch (error) {
  process.stderr.write(`snapshot: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
