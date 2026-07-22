export interface CliFlags {
  autoExit: boolean;
  resume: boolean;
  dev: boolean;
  requireAuth?: boolean;
}

/** Parse server CLI flags; unknown arguments are ignored. */
export function parseCliFlags(argv: string[]): CliFlags {
  return {
    autoExit: !argv.includes('--no-auto-exit'),
    resume: argv.includes('--resume'),
    dev: argv.includes('--dev'),
    requireAuth: argv.includes('--require-auth'),
  };
}
