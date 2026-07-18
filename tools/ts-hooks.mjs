// Register the extensionless-import resolver so `node --import ./tools/ts-hooks.mjs foo.ts`
// can load the game's TypeScript source directly (types stripped natively by Node 24).
import { register } from 'node:module';

register('./ts-resolve.mjs', import.meta.url);
