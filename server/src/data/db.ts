import { db } from './connection.js';
import { seedIfEmpty } from './seed.js';

// Composition root for the data layer. Importing ./connection.js has already
// opened the database and applied the schema; all that is left is making sure
// a fresh database has something in it.
seedIfEmpty();

export { db };
