declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the session middleware when the request carries a valid admin session. */
    admin?: { username: string } | undefined;
  }
}

export {};
