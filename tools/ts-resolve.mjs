// Resolve hook: let Node's native TypeScript type-stripping import the game's
// source, which uses extensionless relative specifiers (`./constants`) for the
// bundler. Node's ESM resolver requires explicit extensions, so we append `.ts`
// for relative imports that have no extension and resolve to a real file.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
  }
  return next(specifier, context);
}
