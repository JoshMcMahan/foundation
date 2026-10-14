// The host's bundler replaces process.env.NODE_ENV by that exact spelling, so
// development-only code must read it with a dot, not the bracket an index
// signature asks for.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV?: string
  }
}
