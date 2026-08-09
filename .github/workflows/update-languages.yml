const fs = require('fs');
const path = require('path');

const TOKEN = process.env.PERSONAL_TOKEN;
if (!TOKEN) {
  console.error('❌ PERSONAL_TOKEN is not set. Add it to repository secrets as PERSONAL_TOKEN.');
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
    // skip archived repos optionally:
    // if (repo.archived) continue;
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

function buildMarkdownTable(totals) {
  const entries = Array.from(totals.entries()).sort((a,b) => b[1] - a[1]);
  const totalBytes = entries.reduce((s,[,b]) => s+b, 0);
  if (entries.length === 0) return 'No language data found.';

  // Build simple table
  let md = '\n## Aggregated language usage (including private repos)\n\n';
  md += '| Language | Bytes | Percent |\n';
  md += '|---|---:|---:|\n';
  for (const [lang, bytes] of entries) {
    const pct = totalBytes ? (bytes / totalBytes * 100) : 0;
    md += `| ${lang} | ${bytes.toLocaleString()} | ${pct.toFixed(2)}% |\n`;
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
    // Append section at the end
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

    // Optionally filter repositories here:
    // e.g., only include non-forks: repos = repos.filter(r => !r.fork);

    const totals = await aggregateLanguages(repos);
    const mdTable = buildMarkdownTable(totals);

    const readmePath = path.join(process.cwd(), 'README.md');
    replaceSectionInReadme(readmePath, mdTable);

    console.log('✅ README updated. Commit will be created by the workflow.');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
