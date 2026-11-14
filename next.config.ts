import type { NextConfig } from 'next';

// NEXT_DIST_DIR: a second build folder, so that a check on another decision day (NEXT_PUBLIC_DECISION_DATE) or a
// production build can run next to the dev server.
const config: NextConfig = { reactStrictMode: true, devIndicators: false, distDir: process.env.NEXT_DIST_DIR || '.next' };
export default config;
