/**
 * Build env-specific volunteer web app HTML from scripts/_volunteer-app.html.
 *
 * Environments:
 *   dev     -> api-dev.karmadots.org,  karmadots.org/dev/
 *   test    -> api-test.karmadots.org, karmadots.org/test/
 *   retreat -> api.karmadots.org,      karmadots.org/retreat/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nyDeployStamp } from './deploy/stamp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** @typedef {'dev'|'test'|'retreat'} VolunteerEnv */
/** @typedef {'api'|'pages'} VolunteerDeployMode */

export const VOLUNTEER_ENVS = {
  dev: {
    path: 'dev',
    apiOrigin: 'https://api-dev.karmadots.org',
    titleSuffix: ' (Dev)',
    envBadge: 'Dev',
    uiChannel: 'testers',
    remoteDir: process.env.JH_DEV_DIR || 'private-server-dev',
    loginUrl: 'https://api-dev.karmadots.org/dev/',
    pagesUrl: 'https://karmadots.org/dev/',
  },
  test: {
    path: 'test',
    apiOrigin: 'https://api-test.karmadots.org',
    titleSuffix: ' (Test)',
    envBadge: 'Test',
    uiChannel: 'testers',
    remoteDir: process.env.JH_TEST_DIR || 'private-server-test',
    loginUrl: 'https://api-test.karmadots.org/test/',
    pagesUrl: 'https://karmadots.org/test/',
  },
  retreat: {
    path: 'retreat',
    apiOrigin: 'https://api.karmadots.org',
    titleSuffix: '',
    envBadge: '',
    uiChannel: '',
    remoteDir: process.env.JH_RETREAT_DIR || 'private-server',
    loginUrl: 'https://api.karmadots.org/retreat/',
    pagesUrl: 'https://karmadots.org/retreat/',
  },
};

/**
 * @param {VolunteerEnv} env
 * @param {{ mode?: VolunteerDeployMode, build?: string }} [opts]
 */
export function buildVolunteerAppHtml(env, opts = {}) {
  const cfg = VOLUNTEER_ENVS[env];
  if (!cfg) throw new Error(`unknown volunteer env: ${env}`);

  const mode = opts.mode || 'api';
  const build = opts.build || nyDeployStamp();
  const tpl = fs.readFileSync(path.join(repoRoot, 'scripts', '_volunteer-app.html'), 'utf8');

  const assetPrefix = mode === 'api' ? '/login/' : `/${cfg.path}/`;
  const canonical = mode === 'api' ? cfg.loginUrl : cfg.pagesUrl;
  const title = `Jewel Heart Volunteers${cfg.titleSuffix}`;
  const envBadgeHtml = cfg.envBadge
    ? `    <p class="jh-env-badge" aria-label="Environment">${cfg.envBadge}</p>\n`
    : '';
  const uiChannelLine = cfg.uiChannel
    ? `      uiChannel: '${cfg.uiChannel}',\n`
    : '';

  return tpl
    .replaceAll('__JH_WEB_BUILD__', build)
    .replaceAll('__JH_VOLUNTEER_ENV__', env)
    .replaceAll('__JH_API_ORIGIN__', cfg.apiOrigin)
    .replaceAll('__JH_ASSET_PREFIX__', assetPrefix)
    .replaceAll('__JH_CANONICAL_URL__', canonical)
    .replaceAll('__JH_PAGE_TITLE__', title)
    .replaceAll('__JH_ENV_BADGE_HTML__', envBadgeHtml)
    .replaceAll('__JH_UI_CHANNEL_LINE__', uiChannelLine);
}

/** @param {VolunteerEnv} env @param {VolunteerDeployMode} mode */
export function buildVolunteerManifest(env, mode = 'pages') {
  const cfg = VOLUNTEER_ENVS[env];
  const startUrl = mode === 'api' ? `/${cfg.path}/` : `/${cfg.path}/`;
  const iconPrefix = mode === 'api' ? '/login/' : `/${cfg.path}/`;
  return {
    name: `JewelHeart Volunteers${cfg.titleSuffix}`,
    short_name: 'JewelHeart',
    description: 'JewelHeart retreat volunteer app',
    start_url: startUrl,
    display: 'standalone',
    background_color: '#5bb5e8',
    theme_color: '#92160e',
    icons: [
      { src: `${iconPrefix}apple-touch-icon.png`, sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: `${iconPrefix}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${iconPrefix}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}

export function buildVolunteerRedirectHtml(targetPath = '/dev/') {
  const target = String(targetPath).startsWith('/') ? targetPath : `/${targetPath}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Redirecting…</title>
</head>
<body>
  <p><a id="jh-vol-redirect-fallback" href="${target}">Continue to Jewel Heart Volunteers</a></p>
  <script>
    (function () {
      var base = ${JSON.stringify(target)};
      var dest = base + (location.search || '') + (location.hash || '');
      var a = document.getElementById('jh-vol-redirect-fallback');
      if (a) a.href = dest;
      location.replace(dest);
    })();
  </script>
</body>
</html>
`;
}
