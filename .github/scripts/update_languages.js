// name=.github/scripts/update_languages.js
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.PERSONAL_TOKEN || process.env.PAT_1;
if (!TOKEN) {
  console.error('❌ PERSONAL_TOKEN or PAT_1 is not set. Add it to repository secrets as PERSONAL_TOKEN or PAT_1.');
  process.exit(1);
}

const headers = {
  Authorization: `token ${TOKEN}`,
  'User-Agent': 'github-actions-language-aggregator',
  Accept: 'application/vnd.github+json'
};

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
  }
  return res.json();
}

async function listAllRepos() {
  const perPage = 100;
  let page = 1;
  let all = [];
  while (true) {
    const url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&type=owner&sort=updated`;
    const items = await fetchJson(url);
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (items.length < perPage) break;
    page++;
  }
  return all;
}

async function aggregateLanguages(repos) {
  const totals = new Map();
  for (const repo of repos) {
    // optional: skip forks or archived repos:
    // if (repo.fork || repo.archived) continue;
    const url = `https://api.github.com/repos/${repo.full_name}/languages`;
    try {
      const langs = await fetchJson(url);
      for (const [lang, bytes] of Object.entries(langs)) {
        totals.set(lang, (totals.get(lang) || 0) + bytes);
      }
      console.log(`Fetched languages for ${repo.full_name}`);
    } catch (err) {
      console.warn(`Warning: failed to fetch languages for ${repo.full_name}: ${err.message}`);
    }
  }
  return totals;
}

function colorForLanguage(lang, idx) {
  const palette = [
    '#2b7cff','#ff6b6b','#6bffb3','#ffd166','#9d7cff','#00c2a8','#ff8fb1','#ffb86b',
    '#8ae1ff','#cba6ff'
  ];
  return palette[idx % palette.length];
}

function buildSVG(totals, topN = 8) {
  const entries = Array.from(totals.entries()).sort((a,b) => b[1] - a[1]).slice(0, topN);
  const totalBytes = entries.reduce((s,[,b]) => s+b, 0) || 1;
  const width = 760;
  const rowHeight = 34;
  const padding = 14;
  const height = padding * 2 + entries.length * rowHeight;

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Languages chart">\n`;
  svg += `<style>
    .label { font: 14px Arial, Helvetica, sans-serif; fill: #e6eef8; }
    .percent { font: 12px Arial, Helvetica, sans-serif; fill: #cfe6ff; }
    .bar-bg { fill: rgba(255,255,255,0.06); }
    .lang-name { font: 13px Arial, Helvetica, sans-serif; fill: #ffffff; }
    .bar-text { font: 12px Arial, Helvetica, sans-serif; fill: #000000; font-weight:600; }
  </style>\n`;

  // background
  svg += `<rect width="100%" height="100%" fill="#0b1220" rx="8" />\n`;

  entries.forEach(( [lang, bytes], i) => {
    const y = padding + i * rowHeight;
    const pct = bytes / totalBytes;
    const barMaxWidth = width - 260; // leave space for labels
    const barWidth = Math.max(2, Math.round(pct * barMaxWidth));
    const color = colorForLanguage(lang, i);

    // lang text
    svg += `<text x="18" y="${y + 20}" class="lang-name">${lang}</text>\n`;
    // percent text (right side)
    const pctText = (pct * 100).toFixed(2) + '%';
    svg += `<text x="${width - 18}" y="${y + 20}" text-anchor="end" class="percent">${pctText}</text>\n`;

    // bar background
    svg += `<rect x="180" y="${y + 6}" width="${barMaxWidth}" height="18" rx="9" class="bar-bg" />\n`;
    // bar foreground
    svg += `<rect x="180" y="${y + 6}" width="${barWidth}" height="18" rx="9" fill="${color}" />\n`;
  });

  svg += `</svg>`;
  return svg;
}

function buildMarkdownSection(totals) {
  const entries = Array.from(totals.entries()).sort((a,b) => b[1] - a[1]);
  const totalBytes = entries.reduce((s,[,b]) => s+b, 0) || 1;
  let md = '\n## Aggregated language usage (including private repos)\n\n';
  md += `![Language chart](https://raw.githubusercontent.com/abdulsalam401/abdulsalam401/main/assets/lang_chart.svg)\n\n`;
  md += '| Language | Percent |\n';
  md += '|---|---:|\n';
  for (const [lang, bytes] of entries.slice(0, 10)) {
    const pct = (bytes / totalBytes * 100).toFixed(2);
    md += `| ${lang} | ${pct}% |\n`;
  }
  md += `\n_Total bytes counted: ${totalBytes.toLocaleString()}_\n`;
  return md;
}

function replaceSectionInReadme(readmePath, newSection) {
  const startMarker = '<!--LANGUAGE_SUMMARY_START-->';
  const endMarker = '<!--LANGUAGE_SUMMARY_END-->';
  let readme = '';
  try {
    readme = fs.readFileSync(readmePath, 'utf8');
  } catch (err) {
    console.warn('README.md not found, creating a new one.');
    readme = '';
  }

  if (readme.includes(startMarker) && readme.includes(endMarker)) {
    const before = readme.split(startMarker)[0];
    const after = readme.split(endMarker)[1];
    const replaced = `${before}${startMarker}\n${newSection}\n${endMarker}${after}`;
    fs.writeFileSync(readmePath, replaced, 'utf8');
    console.log('Replaced existing language summary section in README.md');
  } else {
    const appended = `${readme}\n\n${startMarker}\n${newSection}\n${endMarker}\n`;
    fs.writeFileSync(readmePath, appended, 'utf8');
    console.log('Appended new language summary section to README.md');
  }
}

(async () => {
  try {
    console.log('Listing repositories for authenticated user...');
    const repos = await listAllRepos();
    console.log(`Found ${repos.length} repositories (owner).`);

    const totals = await aggregateLanguages(repos);

    // Ensure assets folder exists
    const assetsDir = path.join(process.cwd(), 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    // Generate SVG and write to assets/lang_chart.svg
    const svg = buildSVG(totals, 8);
    const svgPath = path.join(assetsDir, 'lang_chart.svg');
    fs.writeFileSync(svgPath, svg, 'utf8');
    console.log(`Wrote SVG to ${svgPath}`);

    // Build markdown block and insert into README
    const mdSection = buildMarkdownSection(totals);
    const readmePath = path.join(process.cwd(), 'README.md');
    replaceSectionInReadme(readmePath, mdSection);

    console.log('✅ README and assets updated. Commit will be created by the workflow.');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
