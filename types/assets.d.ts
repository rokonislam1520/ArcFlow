/**
 * Ambient declarations for non-code imports.
 *
 * Next.js ships declarations for CSS *modules* (`*.module.css`) in
 * `next/types/global.d.ts`, but not for plain global stylesheets. A bare
 * `import './globals.css'` therefore has no type declaration behind it.
 *
 * Older TypeScript stayed silent about that. TypeScript 5.6 added error 2882
 * ("Cannot find module or type declarations for side-effect import"), so newer
 * compilers report it while the version pinned in package.json does not — which
 * is exactly how the editor and the CLI ended up disagreeing.
 *
 * Declaring the module is the actual fix rather than a suppression: the import
 * genuinely is valid, because the bundler resolves it at build time. This tells
 * the type system the truth instead of hiding the complaint.
 *
 * The more specific `*.module.css` pattern in Next's own declarations still
 * wins where it applies, since TypeScript prefers the closest pattern match.
 */
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
