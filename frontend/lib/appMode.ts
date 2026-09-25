/**
 * Which edition this build is. The student edition is compiled with
 * NEXT_PUBLIC_APP_MODE=local (see `npm run build:local`); the value is inlined at build time,
 * so a server build carries none of the local-only branches' behaviour.
 */
export const IS_LOCAL_MODE = process.env.NEXT_PUBLIC_APP_MODE === "local"
