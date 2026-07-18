// All project-specific settings. The engine reads nothing else.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Load SARVAM_API_KEY from backend/.env so the key lives in exactly one place
// and is never hardcoded or committed.
if (!process.env.SARVAM_API_KEY) {
  try {
    const env = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
    const m = env.match(/^SARVAM_API_KEY=(.+)$/m);
    if (m) process.env.SARVAM_API_KEY = m[1].trim();
  } catch { /* engine will error clearly if the key is still missing */ }
}

/** Mint a valid workspace token using the backend's own auth module, so
 *  recording never needs a human password (and no credential lands in this
 *  repo). Equivalent to a real login — same signing secret, same role. */
function mintOwnerToken() {
  const py = 'backend/.venv/Scripts/python.exe';
  const code = [
    'import sys; sys.path.insert(0, "backend")',
    'from app.auth import configured_users, create_access_token',
    'u = configured_users()["owner"]',
    'print(create_access_token(u)[0])',
  ].join('; ');
  return execFileSync(py, ['-c', code], { encoding: 'utf8' }).trim();
}

export default {
  baseUrl: 'http://localhost:5000',

  /** Seed auth, then land on the workspace ready to drive. */
  async login(page, { pause }) {
    const token = mintOwnerToken();
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('mrmilk_auth_token', t);
      localStorage.setItem('mrmilk_auth_user', JSON.stringify({
        username: 'owner', name: 'Owner', role: 'owner',
        permissions: ['admin:read','customers:read','chat:use','feedback:write',
                      'imports:read','imports:write','reports:read'],
      }));
    }, token);
    await page.goto(`${this.baseUrl}/?view=workspace`, { waitUntil: 'networkidle2' });
    await pause(3500);
  },

  // Hindi narration, technical nouns left in English — reads the way the team
  // actually speaks, per the recipe's guidance on Hinglish.
  tts: {
    language: 'hi-IN',
    speaker: 'shubh',
    model: 'bulbul:v3',
    pace: 0.85,
    sampleRate: 22050,
  },

  chrome: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ffmpeg: 'ffmpeg',
  ffprobe: 'ffprobe',

  outDir: './recordings',
  outFile: 'referral-engine-walkthrough.mp4',
  viewport: { width: 1600, height: 900 },
  headless: 'new',

  caption: { bg: 'rgba(7,64,105,.94)', color: '#fff', titleSize: 21, subSize: 14.5 },
};
