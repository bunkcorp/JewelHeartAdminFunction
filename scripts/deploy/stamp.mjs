/**
 * Deploy build stamps — America/New_York (EDT/EST), minute precision.
 * Format: YYYY-MM-DD-HH:mm  (e.g. 2026-06-30-11:28)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @param {Date} [date] */
export function nyDeployStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}:${get('minute')}`;
}

export function stampApiHomeSource(content, stamp) {
  return content
    .replace(
      /export const VOLUNTEER_API_BUILD_STAMP = '[^']*';/,
      `export const VOLUNTEER_API_BUILD_STAMP = '${stamp}';`,
    )
    .replace(
      /const VOLUNTEER_SDUI_BUILD_STAMP = '[^']*';/,
      `const VOLUNTEER_SDUI_BUILD_STAMP = '${stamp}';`,
    );
}

export function stampWebSduiSource(content, stamp) {
  return content.replace(
    /export const JH_LOGIN_WEB_BUILD = '[^']*';/,
    `export const JH_LOGIN_WEB_BUILD = '${stamp}';`,
  );
}

/**
 * Write a deploy-stamped copy of a repo file to a temp path for scp.
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {'api'|'web'} kind
 * @param {string} stamp
 */
export function writeStampedTempCopy(repoRoot, relPath, kind, stamp) {
  const src = path.join(repoRoot, relPath);
  const content = fs.readFileSync(src, 'utf8');
  const stamped =
    kind === 'api' ? stampApiHomeSource(content, stamp) : stampWebSduiSource(content, stamp);
  const tmp = path.join(
    os.tmpdir(),
    `jh-stamp-${kind}-${path.basename(relPath)}`,
  );
  fs.writeFileSync(tmp, stamped, 'utf8');
  return tmp;
}
