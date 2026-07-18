// TTS + record + mux + concat. Copied from NARRATED-VIDEO-RECIPE.md as-is,
// except makeHelpers() which the recipe explicitly expects you to adapt to your
// UI (see §11). Mr Milk's workspace is tab-driven with inline-styled tables
// rather than a role="dialog" admin pattern, so the click/scroll helpers below
// target that instead.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const KEY = process.env.SARVAM_API_KEY;
if (!KEY) { console.error('SARVAM_API_KEY is not set'); process.exit(1); }

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

export async function build(cfg, narration, scenes) {
  const FF = cfg.ffmpeg, FFP = cfg.ffprobe;
  const OUT = cfg.outDir;
  const SEG = join(OUT, 'segments');
  const TMP = join(tmpdir(), 'narrated-video');
  const FRAMES = join(TMP, 'frames');
  mkdirSync(SEG, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const dur = (f) =>
    parseFloat(execFileSync(FFP, ['-v','error','-show_entries','format=duration','-of','csv=p=0', f])
      .toString().trim());

  const splitChunks = (t, max = 480) => {
    if (t.length <= max) return [t];
    const parts = t.split(/(?<=[।.!?])\s*/).filter(Boolean);
    const out = []; let cur = '';
    for (const p of parts) {
      if ((cur + p).length > max && cur) { out.push(cur); cur = p; } else cur += p;
    }
    if (cur) out.push(cur);
    return out;
  };

  async function tts(id, text) {
    const chunks = splitChunks(text);
    const wavs = [];
    for (let i = 0; i < chunks.length; i++) {
      let audio;
      for (let attempt = 0; attempt < 7; attempt++) {
        let res;
        try {
          res = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: { 'api-subscription-key': KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inputs: [chunks[i]],
              target_language_code: cfg.tts.language,
              speaker: cfg.tts.speaker,
              model: cfg.tts.model,
              speech_sample_rate: cfg.tts.sampleRate,
              pace: cfg.tts.pace,
            }),
          });
        } catch (e) { if (attempt < 6) { await pause(3000); continue; } throw e; }
        if (res.status === 200) { audio = (await res.json()).audios[0]; break; }
        if (res.status === 429 || res.status >= 500) { await pause(2500); continue; }
        throw new Error(`Sarvam TTS ${res.status}: ${await res.text()}`);
      }
      if (!audio) throw new Error(`TTS failed for ${id} chunk ${i}`);
      const w = join(TMP, `${id}_${i}.wav`);
      writeFileSync(w, Buffer.from(audio, 'base64'));
      wavs.push(w);
      await pause(300);
    }
    const out = join(TMP, `${id}.wav`);
    if (wavs.length === 1) execFileSync(FF, ['-y','-i',wavs[0],out], { stdio:'ignore' });
    else {
      const list = join(TMP, `${id}_list.txt`);
      writeFileSync(list, wavs.map((w) => `file '${w.replace(/\\/g,'/')}'`).join('\n'));
      execFileSync(FF, ['-y','-f','concat','-safe','0','-i',list,'-c','copy',out], { stdio:'ignore' });
    }
    return { wav: out, d: dur(out) };
  }

  async function record(page, id, target, fn, wav) {
    const dir = join(FRAMES, id);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });

    const client = await page.target().createCDPSession();
    const frames = [];
    client.on('Page.screencastFrame', async (e) => {
      frames.push({ data: e.data, ts: e.metadata.timestamp });
      try { await client.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch {}
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });

    const t0 = Date.now();
    await fn();
    const elapsed = (Date.now() - t0) / 1000;
    await pause(Math.max(0.5, target + 0.5 - elapsed) * 1000);

    await client.send('Page.stopScreencast').catch(() => {});
    await pause(200);
    await client.detach().catch(() => {});
    if (!frames.length) { log(`  !! ${id}: no frames captured`); return; }

    const lines = [];
    frames.forEach((f, i) => {
      const file = join(dir, `f${String(i).padStart(5,'0')}.jpg`);
      writeFileSync(file, Buffer.from(f.data, 'base64'));
      const next = frames[i + 1];
      const d = next ? Math.max(0.033, Math.min(6, next.ts - f.ts)) : 1.0;
      lines.push(`file '${file.replace(/\\/g,'/')}'`, `duration ${d.toFixed(3)}`);
    });
    lines.push(`file '${join(dir, `f${String(frames.length-1).padStart(5,'0')}.jpg`).replace(/\\/g,'/')}'`);
    const listFile = join(dir, 'list.txt');
    writeFileSync(listFile, lines.join('\n'));

    const silent = join(TMP, `${id}_v.mp4`);
    execFileSync(FF, ['-y','-f','concat','-safe','0','-i',listFile,
      '-vf','fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
      '-movflags','+faststart', silent], { stdio:'ignore' });
    rmSync(dir, { recursive: true, force: true });

    const Dv = dur(silent), Da = wav ? wav.d : 0;
    const out = join(SEG, `${id}.mp4`);
    if (wav) {
      const final = (Math.max(Dv, Da) + 0.4).toFixed(2);
      const pad = (parseFloat(final) - Dv).toFixed(2);
      execFileSync(FF, ['-y','-i',silent,'-i',wav.wav,
        '-filter_complex',`[0:v]tpad=stop_mode=clone:stop_duration=${pad}[v]`,
        '-map','[v]','-map','1:a',
        '-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',
        '-c:a','aac','-b:a','128k','-t',final,'-movflags','+faststart', out], { stdio:'ignore' });
    } else execFileSync(FF, ['-y','-i',silent,'-c','copy',out], { stdio:'ignore' });
    log(`  ok ${id}  (${frames.length} frames | video ${Dv.toFixed(1)}s | audio ${Da.toFixed(1)}s)`);
  }

  // ---- helpers, adapted for the Mr Milk workspace ------------------------
  const makeHelpers = (page) => ({
    pause,
    goto: async (path) => {
      await page.goto(`${cfg.baseUrl}${path}`, { waitUntil: 'networkidle2' }).catch(() => {});
      await pause(800);
      for (let i = 0; i < 14; i++) {
        const busy = await page.evaluate(
          () => document.querySelectorAll('[class*="animate-pulse"],[class*="skeleton"]').length
        ).catch(() => 0);
        if (!busy) break;
        await pause(280);
      }
    },
    caption: async (title, sub = '') => {
      if (!cfg.caption) return;
      await page.evaluate((t, s, c) => {
        let el = document.getElementById('__cap');
        if (!el) { el = document.createElement('div'); el.id = '__cap'; document.documentElement.appendChild(el); }
        el.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:2147483647;
          background:linear-gradient(transparent,${c.bg});color:${c.color};
          padding:16px 30px 20px;font-family:Inter,Segoe UI,system-ui,sans-serif;pointer-events:none`;
        el.innerHTML = `<div style="font-size:${c.titleSize}px;font-weight:700">${t}</div>` +
          (s ? `<div style="font-size:${c.subSize}px;opacity:.9;margin-top:3px">${s}</div>` : '');
      }, title, sub, cfg.caption).catch(() => {});
    },
    paced: async (seconds, steps) => {
      const budget = seconds * 1000, t0 = Date.now();
      for (let i = 0; i < steps.length; i++) {
        await steps[i]();
        const want = budget * ((i + 1) / steps.length);
        const wait = want - (Date.now() - t0);
        if (wait > 200) await pause(wait);
      }
    },
    // Workspace tabs are plain <button>s with exact labels.
    tab: async (label, after = 2500) => {
      const el = await page.evaluateHandle((x) =>
        [...document.querySelectorAll('button')]
          .find((b) => (b.textContent || '').replace(/\s+/g,' ').trim() === x) || null, label);
      if (!el.asElement()) return false;
      await el.asElement().click(); await pause(after); return true;
    },
    clickText: async (label, after = 1500) => {
      const el = await page.evaluateHandle((x) =>
        [...document.querySelectorAll('button,a')]
          .find((b) => (b.textContent || '').replace(/\s+/g,' ').trim() === x) || null, label);
      if (!el.asElement()) return false;
      await el.asElement().click(); await pause(after); return true;
    },
    // Expanding a worklist row needs a click on a CELL — clicking the <tr>
    // itself lands between cells and misses the handler.
    clickRow: async (index = 0, after = 2000) => {
      const el = await page.evaluateHandle((i) => {
        const rows = document.querySelectorAll('table tbody tr');
        const r = rows[i];
        return r ? r.querySelectorAll('td')[2] || r.querySelector('td') : null;
      }, index);
      if (!el.asElement()) return false;
      await el.asElement().click(); await pause(after); return true;
    },
    // NOTE: the workspace scrolls an inner <div style="overflow-y:auto">, not
    // the window — so window.scrollTo/scrollBy silently do nothing here. Every
    // scroll helper resolves the real scrolling container first.
    scrollTo: async (text, after = 1400) => {
      await page.evaluate((t) => {
        // Must find the INNERMOST match. textContent includes descendants, so
        // a naive .find() returns some outer container whose text happens to
        // contain the string — scrolling that lands at the top of the page,
        // not at the thing you asked for.
        const all = [...document.querySelectorAll(
          'h1,h2,h3,h4,td,th,div,span,strong,button,a,p,label')];
        const hits = all.filter((x) => (x.textContent || '').includes(t));
        const el = hits.find((m) => !hits.some((o) => o !== m && m.contains(o)));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, text);
      await pause(after);
    },
    scrollY: async (px, after = 1200) => {
      await page.evaluate((y) => {
        const sc = [...document.querySelectorAll('div')].find(
          (e) => e.scrollHeight > e.clientHeight + 80 &&
                 ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)
        ) || document.scrollingElement;
        sc.scrollBy({ top: y, behavior: 'smooth' });
      }, px);
      await pause(after);
    },
    top: async (after = 900) => {
      await page.evaluate(() => {
        const sc = [...document.querySelectorAll('div')].find(
          (e) => e.scrollHeight > e.clientHeight + 80 &&
                 ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)
        ) || document.scrollingElement;
        sc.scrollTo({ top: 0, behavior: 'smooth' });
      }, after);
      await pause(after);
    },
    esc: async () => { await page.keyboard.press('Escape').catch(() => {}); await pause(500); },
  });

  const ids = Object.keys(narration);
  const only = process.argv.slice(2);
  const want = (id) => !only.length || only.includes(id);

  log('TTS...');
  const wavs = {};
  for (const id of ids) {
    if (!want(id)) continue;
    wavs[id] = await tts(id, narration[id]);
    // Never log the narration itself — Devanagari on a cp1252 Windows console
    // throws UnicodeEncodeError and kills the run (recipe gotcha #10).
    log(`  audio ${id} = ${wavs[id].d.toFixed(1)}s`);
  }

  const browser = await puppeteer.launch({
    executablePath: cfg.chrome,
    headless: cfg.headless,
    args: ['--no-sandbox', `--window-size=${cfg.viewport.width},${cfg.viewport.height}`, '--hide-scrollbars'],
    defaultViewport: cfg.viewport,
  });
  try {
    const page = await browser.newPage();
    await cfg.login.call(cfg, page, { pause });
    const h = makeHelpers(page);
    for (const id of ids) {
      if (!want(id)) continue;
      const scene = scenes[id];
      if (!scene) { log(`  !! no scene for "${id}" - skipping`); continue; }
      await record(page, id, wavs[id].d, () => scene(page, h, wavs[id].d), wavs[id]);
    }
  } catch (e) { console.error('RECORDING ERROR:', e);
  } finally { await browser.close(); }

  const present = ids.filter((id) => existsSync(join(SEG, `${id}.mp4`)));
  if (!present.length) { log('nothing to stitch'); return; }
  const listFile = join(TMP, 'concat.txt');
  writeFileSync(listFile, present.map((id) => `file '${join(SEG, `${id}.mp4`).replace(/\\/g,'/')}'`).join('\n'));
  const final = join(OUT, cfg.outFile);
  execFileSync(FF, ['-y','-f','concat','-safe','0','-i',listFile,
    '-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-movflags','+faststart', final], { stdio:'ignore' });
  log(`\nDONE ${final}  (${present.length} segments)`);
}
