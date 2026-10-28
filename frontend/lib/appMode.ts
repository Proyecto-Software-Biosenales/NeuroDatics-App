/**
 * Which edition this build is. The student edition is compiled with
 * NEXT_PUBLIC_APP_MODE=local, which `student/build.ps1` sets around `next build`; the value is
 * inlined at build time, so a server build carries none of the local-only branches' behaviour.
 */
export const IS_LOCAL_MODE = process.env.NEXT_PUBLIC_APP_MODE === "local"

/** Where a visitor without a session goes: the local edition asks for a profile instead of a sign-in. */
export const SIGN_IN_PATH = IS_LOCAL_MODE ? "/perfiles" : "/login"
