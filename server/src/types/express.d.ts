// Augments Express's own global `Request`, which `@types/express` (a direct
// dependency) extends. Augmenting `express-serve-static-core` instead would
// need that package as a direct dependency under pnpm's strict `node_modules`.
declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when the request carries a valid admin session. */
      admin?: { username: string } | undefined;
    }
  }
}

export {};
