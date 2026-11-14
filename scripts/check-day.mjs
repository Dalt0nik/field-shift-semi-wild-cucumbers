// Runs the app on another decision day, next to the usual dev server, to check that nothing in the interface
// depends on the day of the demo. It uses its own build folder (.next-check) and port.
// Usage: npm run check:day -- 2026-11-14 [port]        then open http://localhost:3111
//        BASE=http://localhost:3111 OUT=screenshots-check node scripts/shots.mjs 1280     to photograph every state
// The supported days are SUPPORTED_DAYS in src/pilot/demo.ts. Next adds the build folder to tsconfig.json while it
// runs; that line can be dropped again afterwards.
import { spawn } from 'node:child_process';

const day = process.argv[2], port = process.argv[3] ?? '3111';
if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) { console.error('Usage: npm run check:day -- YYYY-MM-DD [port]'); process.exit(1); }
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', port], { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_DECISION_DATE: day, NEXT_DIST_DIR: '.next-check' } });
child.on('exit', code => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
