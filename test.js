// ==UserScript==
// @name         GitHub Repo Visibility Quick Switch
// @namespace    https://github.com/runleap
// @version      2.0
// @description  在 GitHub 仓库设置页面添加快速切换 Public/Private 的悬浮工具集。支持 GitHub API（需 Token）和 DOM 自动操作两种模式。
// @author       runleap
// @match        https://github.com/*/settings
// @icon         https://github.githubassets.com/favicons/favicon-dark.svg
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const [_, owner, repo] = window.location.pathname.split('/');
  if (!owner || !repo) return;

  /* ── Storage ── */
  const STORAGE_KEY = 'gv_config';
  function loadCfg() {
    try {
      return JSON.parse(GM_getValue(STORAGE_KEY, '{}'));
    } catch {
      return {};
    }
  }
  function saveCfg(cfg) {
    GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
  }

  /* ── Helpers ── */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isDark = () =>
    document.documentElement.getAttribute('data-color-mode') === 'dark' ||
    !!document.querySelector('meta[name="color-mode"][content="dark"]');

  function detectVisFromPage() {
    const m = document.body.innerText.match(
      /currently (public|private|internal)/i,
    );
    return m ? m[1].toLowerCase() : null;
  }

  function repoFullName() {
    return `${owner}/${repo}`;
  }

  /* ── Styles ── */
  GM_addStyle(`
    .gv2 {
      all: initial;
      position: fixed; bottom: 24px; right: 24px; z-index: 999999;
      font: 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Noto Sans,Helvetica,Arial,sans-serif;
      color: #1f2328; user-select: none;
    }
    .gv2 * { box-sizing: border-box; }
    .gv2-w {
      background: #ffffff; border: 1px solid #d0d7de; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(140,149,159,0.2);
      overflow: hidden; transition: all .2s ease;
      min-width: 220px;
    }
    .gv2.dark .gv2-w { background: #161b22; border-color: #30363d; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    .gv2.dark { color: #e6edf3; }

    .gv2-h {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px 8px; border-bottom: 1px solid #d0d7de;
      cursor: pointer;
    }
    .gv2.dark .gv2-h { border-bottom-color: #30363d; }
    .gv2-h-repo { font-weight: 600; font-size: 12px; }
    .gv2-h-btn {
      background: none; border: none; cursor: pointer; padding: 2px 4px;
      border-radius: 4px; color: #656d76; font-size: 14px; line-height: 1;
    }
    .gv2.dark .gv2-h-btn { color: #8b949e; }
    .gv2-h-btn:hover { background: #d0d7de; }
    .gv2.dark .gv2-h-btn:hover { background: #30363d; }

    .gv2-body { padding: 8px 12px 12px; }

    .gv2-status {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 0 8px; font-size: 11px; color: #656d76;
    }
    .gv2.dark .gv2-status { color: #8b949e; }
    .gv2-status-dot {
      width: 8px; height: 8px; border-radius: 50%; display: inline-block;
    }
    .gv2-status-dot.public { background: #da3633; }
    .gv2-status-dot.private { background: #238636; }
    .gv2-status-dot.internal { background: #d29922; }
    .gv2-status-dot.unknown { background: #8b949e; }
    .gv2-status-label { font-weight: 600; text-transform: capitalize; }
    .gv2-status-mode {
      margin-left: auto; font-size: 10px; background: #f6f8fa;
      padding: 1px 6px; border-radius: 4px;
    }
    .gv2.dark .gv2-status-mode { background: #0d1117; }

    .gv2-row { display: flex; gap: 6px; margin-bottom: 6px; }
    .gv2-btn {
      flex: 1; padding: 6px 12px; border: none; border-radius: 6px;
      cursor: pointer; font-weight: 600; font-size: 12px; color: #fff;
      transition: all .15s; text-align: center;
    }
    .gv2-btn:disabled { opacity: .4; cursor: not-allowed; }
    .gv2-btn:not(:disabled):hover { filter: brightness(1.12); transform: translateY(-1px); }
    .gv2-btn:not(:disabled):active { transform: translateY(0); }
    .gv2-btn-pub { background: #da3633; }
    .gv2-btn-prv { background: #238636; }
    .gv2-btn-pub.active { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #da3633; }
    .gv2-btn-prv.active { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #238636; }
    .gv2-btn-pub.active:hover, .gv2-btn-prv.active:hover { filter: none; transform: none; cursor: default; }

    .gv2-actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .gv2-act {
      background: none; border: 1px solid #d0d7de; border-radius: 6px;
      padding: 3px 8px; cursor: pointer; font-size: 11px; color: #656d76;
      transition: all .12s; display: inline-flex; align-items: center; gap: 3px;
    }
    .gv2.dark .gv2-act { border-color: #30363d; color: #8b949e; }
    .gv2-act:hover { background: #f6f8fa; }
    .gv2.dark .gv2-act:hover { background: #0d1117; }
    .gv2-act.active { border-color: #0969da; color: #0969da; }
    .gv2.dark .gv2-act.active { border-color: #58a6ff; color: #58a6ff; }

    .gv2-debug {
      margin-top: 6px; padding: 6px 8px;
      background: #f6f8fa; border-radius: 6px;
      font: 10px/1.4 ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
      color: #57606a; max-height: 120px; overflow-y: auto;
      display: none; word-break: break-word;
    }
    .gv2.dark .gv2-debug { background: #0d1117; color: #8b949e; }

    .gv2-token-input {
      margin-top: 6px; padding: 8px; border: 1px solid #d0d7de; border-radius: 6px;
      display: none;
    }
    .gv2.dark .gv2-token-input { border-color: #30363d; }
    .gv2-token-input input {
      width: 100%; padding: 4px 8px; border: 1px solid #d0d7de; border-radius: 4px;
      font-size: 11px; font-family: ui-monospace,SFMono-Regular,"SF Mono",monospace;
      margin-bottom: 4px;
    }
    .gv2.dark .gv2-token-input input {
      background: #0d1117; border-color: #30363d; color: #e6edf3;
    }
    .gv2-token-input .gv2-ti-actions { display: flex; gap: 4px; }
    .gv2-token-input button {
      padding: 3px 10px; border: 1px solid #d0d7de; border-radius: 4px;
      font-size: 11px; cursor: pointer; background: #fff;
    }
    .gv2.dark .gv2-token-input button {
      background: #21262d; border-color: #30363d; color: #e6edf3;
    }
    .gv2-token-input button:hover { background: #f6f8fa; }
    .gv2.dark .gv2-token-input button:hover { background: #30363d; }
    .gv2-token-input button.gv2-ti-save { background: #0969da; color: #fff; border-color: #0969da; }
    .gv2-token-input button.gv2-ti-save:hover { background: #0860ca; }
    .gv2-token-input .gv2-ti-msg { font-size: 10px; margin-top: 4px; color: #656d76; }

    .gv2-mini {
      display: none;
      background: #ffffff; border: 1px solid #d0d7de; border-radius: 20px;
      box-shadow: 0 4px 12px rgba(140,149,159,0.15);
      padding: 6px 14px; cursor: pointer; font-weight: 600; font-size: 12px;
      align-items: center; gap: 6px; transition: all .2s;
    }
    .gv2.dark .gv2-mini { background: #161b22; border-color: #30363d; color: #e6edf3; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .gv2-mini:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(140,149,159,0.25); }
    .gv2.dark .gv2-mini:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
    .gv2-mini .gv2-m-dot {
      width: 8px; height: 8px; border-radius: 50%; display: inline-block;
    }
    .gv2-mini .gv2-m-dot.public { background: #da3633; }
    .gv2-mini .gv2-m-dot.private { background: #238636; }
    .gv2-mini .gv2-m-dot.internal { background: #d29922; }
    .gv2-mini .gv2-m-dot.unknown { background: #8b949e; }
  `);

  /* ── Logger ── */
  let dbgEl = null;
  const log = (() => {
    const lines = [];
    return {
      add(msg, isErr) {
        lines.push({ msg, isErr });
        console.log('[GV2]', msg);
        if (!dbgEl) return;
        dbgEl.style.display = 'block';
        const line = document.createElement('div');
        line.textContent = (isErr ? '✗ ' : '· ') + msg;
        if (isErr) line.style.color = '#da3633';
        dbgEl.appendChild(line);
        dbgEl.scrollTop = dbgEl.scrollHeight;
      },
      clear() {
        lines.length = 0;
        if (dbgEl) {
          dbgEl.innerHTML = '';
          dbgEl.style.display = 'none';
        }
      },
      getAll() {
        return [...lines];
      },
    };
  })();

  /* ── API Mode ── */
  async function apiCheckToken(token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (res.status === 401)
        return { valid: false, reason: 'Token invalid or expired' };
      if (res.status === 403)
        return { valid: false, reason: 'Token lacks repo scope' };
      if (!res.ok) return { valid: false, reason: `API error ${res.status}` };
      const data = await res.json();
      return { valid: true, visibility: data.visibility };
    } catch (e) {
      return { valid: false, reason: e.message };
    }
  }

  async function apiSetVisibility(token, targetVis) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ visibility: targetVis }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errBody.slice(0, 200)}`);
    }
    return res.json();
  }

  /* ── DOM Mode ── */
  async function domChangeVisibility(targetVis) {
    const btn = findChangeVisBtn();
    if (!btn) throw new Error("Cannot find 'Change visibility' button");
    log.add(`Clicking "Change visibility"`);
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    btn.click();
    await sleep(1500);

    const dialog = await waitForDialog();
    if (!dialog) throw new Error('Visibility dialog did not appear');

    log.add(`Dialog found, selecting "${targetVis}"`);
    await selectVisibilityInDialog(dialog, targetVis);
    await sleep(400);

    log.add(`Looking for confirm button…`);
    const confirmed = await confirmInDialog(dialog);
    if (!confirmed) throw new Error('Could not find confirm button in dialog');
    log.add(`Confirm clicked ✓`);
    await sleep(2000);
  }

  function findChangeVisBtn() {
    const candidates = document.querySelectorAll(
      "button, [role='button'], a[href], summary, [data-action], [onclick]",
    );
    for (const el of candidates) {
      const t = el.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (t.includes('change visibility') && t.length < 50) return el;
    }
    log.add('Change visibility button candidates:', true);
    [...candidates]
      .filter((c) => c.textContent.trim())
      .slice(0, 20)
      .forEach((c) =>
        log.add(
          `  <${c.tagName}> "${c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}"`,
        ),
      );
    return null;
  }

  async function waitForDialog(timeout = 10000) {
    for (let i = 0; i < timeout / 500; i++) {
      const d = findVisibilityDialog();
      if (d) return d;
      await sleep(500);
    }
    log.add('No visibility dialog found. Dumping all dialogs:', true);
    document
      .querySelectorAll(
        '[role="dialog"], [role="alertdialog"], .Overlay, [data-component="Overlay"]',
      )
      .forEach((el) => {
        log.add(
          `  "${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 150)}"`,
        );
      });
    return null;
  }

  function findVisibilityDialog() {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], .Overlay, [data-component="Overlay"]',
    );
    for (const d of dialogs) {
      const text = d.textContent.toLowerCase();
      if (text.includes('search code') || text.includes('search repositories'))
        continue;
      if (
        text.includes('visibility') ||
        text.includes('make this repository') ||
        text.includes('change repository') ||
        (text.includes('public') && text.includes('private'))
      ) {
        return d;
      }
    }
    return null;
  }

  async function selectVisibilityInDialog(dialog, targetVis) {
    const label = targetVis === 'public' ? 'public' : 'private';
    let done = false;

    const radios = dialog.querySelectorAll('input[type="radio"]');
    for (const r of radios) {
      const val = (r.value || '').toLowerCase();
      if (val === label || val.includes(label)) {
        r.click();
        log.add(`Radio selected: ${r.value}`);
        done = true;
        await sleep(300);
        break;
      }
    }

    if (!done) {
      const segs = dialog.querySelectorAll(
        '[role="tab"][aria-selected], [role="radio"], [data-value]',
      );
      for (const s of segs) {
        const v = (s.dataset?.value || s.textContent || '')
          .toLowerCase()
          .trim();
        if (v.includes(label)) {
          s.click();
          log.add(`Segment clicked: ${v}`);
          done = true;
          await sleep(300);
          break;
        }
      }
    }

    if (!done) {
      const labels = dialog.querySelectorAll('label, span, div');
      for (const lb of labels) {
        const t = lb.textContent.trim().toLowerCase();
        if (t === label && lb.children.length === 0) {
          lb.click();
          log.add(`Label clicked: ${t}`);
          done = true;
          await sleep(300);
          break;
        }
      }
    }

    if (!done) {
      log.add(
        `Could not select "${targetVis}" — trying direct click on dialog body`,
        true,
      );
      const visEl = [...dialog.querySelectorAll('*')].find(
        (el) =>
          el.textContent.trim().toLowerCase() === label &&
          el.offsetParent !== null,
      );
      if (visEl) {
        visEl.click();
        done = true;
        await sleep(300);
      }
    }

    if (!done) log.add(`⚠ Could not find "${targetVis}" radio/segment`);
  }

  async function confirmInDialog(dialog) {
    const btns = dialog.querySelectorAll('button:not([disabled])');
    const terms = [
      'make this repository',
      'i understand, change',
      'i understand',
      'change visibility',
      'change repository visibility',
      'make this repo',
      'make it public',
      'make it private',
    ];

    let found = null;
    for (const b of btns) {
      const t = b.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      for (const term of terms) {
        if (t.includes(term)) {
          found = b;
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      found.click();
      log.add(
        `Confirm clicked: "${found.textContent.replace(/\s+/g, ' ').trim().slice(0, 50)}"`,
      );
      return true;
    }

    const primary = dialog.querySelector('.btn-primary, .btn-danger');
    if (primary && !primary.disabled) {
      primary.click();
      log.add(
        `Primary/danger button clicked: "${primary.textContent.replace(/\s+/g, ' ').trim().slice(0, 50)}"`,
      );
      return true;
    }

    log.add('Available buttons in dialog:', true);
    btns.forEach((b) =>
      log.add(`  "${b.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}"`),
    );
    return false;
  }

  /* ── Main Runner ── */
  let running = false;

  async function run(targetVis, cfg, stateEl, pubBtn, prvBtn) {
    if (targetVis === 'public') {
      document.querySelector('#visibility_menu-list').click();
      document.querySelector('#repo-visibility-proceed-button-public').click();
      document.querySelector('#repo-visibility-proceed-button-public').click();
      document.querySelector('#repo-visibility-proceed-button-public').click();
    }
    if (targetVis === 'private') {
      document.querySelector('#visibility_menu-list').click();
      document.querySelector('#repo-visibility-proceed-button-private').click();
      document.querySelector('#repo-visibility-proceed-button-private').click();
      document.querySelector('#repo-visibility-proceed-button-private').click();
    }

    return;
    if (running) return;
    running = true;
    log.clear();

    try {
      const pageVis = detectVisFromPage();
      log.add(`Target: ${targetVis}, Page says: ${pageVis || '?'}`);

      if (targetVis === pageVis) {
        log.add('Already set — skipping');
        updateStatus(stateEl, pageVis, cfg);
        return;
      }

      if (cfg.token) {
        log.add('Mode: API (token available)');
        updateState('via API…');
        const result = await apiSetVisibility(cfg.token, targetVis);
        log.add(`API success: ${result.visibility} ✓`);
        log.add('Reloading…');
        setTimeout(() => location.reload(), 1500);
      } else {
        log.add('Mode: DOM (no token)');
        updateState('via DOM…');
        await domChangeVisibility(targetVis);
        log.add('✓ Done! Reloading…');
        setTimeout(() => location.reload(), 2000);
      }
    } catch (e) {
      log.add(`Error: ${e.message}`, true);
    } finally {
      if (pubBtn) pubBtn.disabled = false;
      if (prvBtn) prvBtn.disabled = false;
      running = false;
    }
  }

  function updateState(msg) {
    const el = document.querySelector('.gv2-status-mode');
    if (el) el.textContent = msg;
  }

  function updateStatus(stateEl, vis, cfg) {
    if (!stateEl) return;
    const dot = stateEl.querySelector('.gv2-status-dot');
    const label = stateEl.querySelector('.gv2-status-label');
    const mode = stateEl.querySelector('.gv2-status-mode');
    if (dot) {
      dot.className = `gv2-status-dot ${vis || 'unknown'}`;
    }
    if (label) {
      label.textContent = vis || 'Unknown';
    }
    if (mode) {
      mode.textContent = cfg.token ? 'API' : 'DOM';
    }
  }

  /* ── Token Management ── */
  function showTokenPanel(panel, input, msgEl) {
    panel.style.display = 'block';
    const cfg = loadCfg();
    input.value = cfg.token || '';
    msgEl.textContent = '';
    input.focus();
  }

  async function saveToken(input, panel, msgEl, stateEl) {
    const token = input.value.trim();
    if (!token) {
      msgEl.textContent = 'Token cannot be empty';
      msgEl.style.color = '#da3633';
      return;
    }

    msgEl.textContent = 'Validating…';
    msgEl.style.color = '#656d76';
    const result = await apiCheckToken(token);

    if (result.valid) {
      const cfg = loadCfg();
      cfg.token = token;
      saveCfg(cfg);
      msgEl.textContent = `✓ Token valid (repo: ${result.visibility || 'ok'})`;
      msgEl.style.color = '#238636';
      updateStatus(stateEl, result.visibility || detectVisFromPage(), cfg);
      setTimeout(() => {
        panel.style.display = 'none';
      }, 1500);
    } else {
      msgEl.textContent = `✗ ${result.reason}`;
      msgEl.style.color = '#da3633';
    }
  }

  function clearToken(input, panel, msgEl, stateEl) {
    const cfg = loadCfg();
    delete cfg.token;
    saveCfg(cfg);
    input.value = '';
    msgEl.textContent = 'Token removed';
    msgEl.style.color = '#656d76';
    updateStatus(stateEl, detectVisFromPage(), cfg);
    setTimeout(() => {
      panel.style.display = 'none';
    }, 1000);
  }

  /* ── Toolbar ── */
  function init() {
    const cfg = loadCfg();
    let vis = detectVisFromPage();
    const dk = isDark();

    const container = document.createElement('div');
    container.className = `gv2${dk ? ' dark' : ''}`;

    /* ── Full toolbar ── */
    const widget = document.createElement('div');
    widget.className = 'gv2-w';

    const header = document.createElement('div');
    header.className = 'gv2-h';
    const repoLabel = document.createElement('span');
    repoLabel.className = 'gv2-h-repo';
    repoLabel.textContent = repoFullName();
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'gv2-h-btn';
    collapseBtn.textContent = '−';
    collapseBtn.title = 'Collapse';
    collapseBtn.onclick = (e) => {
      e.stopPropagation();
      toggleCollapse();
    };
    header.onclick = toggleCollapse;
    header.appendChild(repoLabel);
    header.appendChild(collapseBtn);
    widget.appendChild(header);

    const body = document.createElement('div');
    body.className = 'gv2-body';

    const statusEl = document.createElement('div');
    statusEl.className = 'gv2-status';
    statusEl.innerHTML = `
      <span class="gv2-status-dot ${vis || 'unknown'}"></span>
      <span>Current: <strong class="gv2-status-label">${vis || 'Unknown'}</strong></span>
      <span class="gv2-status-mode">${cfg.token ? 'API' : 'DOM'}</span>
    `;
    body.appendChild(statusEl);

    const row = document.createElement('div');
    row.className = 'gv2-row';

    const pubBtn = document.createElement('button');
    pubBtn.className = `gv2-btn gv2-btn-pub${vis === 'public' ? ' active' : ''}`;
    pubBtn.textContent = 'Public';
    pubBtn.disabled = running;

    const prvBtn = document.createElement('button');
    prvBtn.className = `gv2-btn gv2-btn-prv${vis === 'private' ? ' active' : ''}`;
    prvBtn.textContent = 'Private';
    prvBtn.disabled = running;

    pubBtn.onclick = () => {
      pubBtn.disabled = true;
      prvBtn.disabled = true;
      run('public', cfg, statusEl, pubBtn, prvBtn);
    };
    prvBtn.onclick = () => {
      pubBtn.disabled = true;
      prvBtn.disabled = true;
      run('private', cfg, statusEl, pubBtn, prvBtn);
    };

    row.appendChild(pubBtn);
    row.appendChild(prvBtn);
    body.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'gv2-actions';

    const tokenBtn = document.createElement('button');
    tokenBtn.className = 'gv2-act';
    tokenBtn.textContent = cfg.token ? '🔑 Token ✓' : '🔑 Set Token';
    tokenBtn.title = cfg.token
      ? 'Change or remove GitHub Token'
      : 'Add GitHub Personal Access Token for API mode';

    const dbgToggle = document.createElement('button');
    dbgToggle.className = 'gv2-act';
    dbgToggle.textContent = '🐛 Debug';
    dbgToggle.onclick = () => {
      dbgToggle.classList.toggle('active');
      if (dbgEl)
        dbgEl.style.display =
          dbgEl.style.display === 'block' ? 'none' : 'block';
    };

    actions.appendChild(tokenBtn);
    actions.appendChild(dbgToggle);
    body.appendChild(actions);

    dbgEl = document.createElement('div');
    dbgEl.className = 'gv2-debug';
    dbgEl.textContent = `detected: ${vis || '?'}`;
    body.appendChild(dbgEl);

    const tokenPanel = document.createElement('div');
    tokenPanel.className = 'gv2-token-input';
    const tokenInput = document.createElement('input');
    tokenInput.type = 'password';
    tokenInput.placeholder = 'ghp_xxxxxxxxxxxxxxxxxxxx';
    tokenInput.spellcheck = false;
    const tiActions = document.createElement('div');
    tiActions.className = 'gv2-ti-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'gv2-ti-save';
    saveBtn.textContent = 'Save';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Remove';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    const tiMsg = document.createElement('div');
    tiMsg.className = 'gv2-ti-msg';
    tiActions.appendChild(saveBtn);
    tiActions.appendChild(clearBtn);
    tiActions.appendChild(cancelBtn);
    tokenPanel.appendChild(tokenInput);
    tokenPanel.appendChild(tiActions);
    tokenPanel.appendChild(tiMsg);
    body.appendChild(tokenPanel);

    tokenBtn.onclick = () => {
      const isOpen = tokenPanel.style.display === 'block';
      if (isOpen) {
        tokenPanel.style.display = 'none';
        return;
      }
      showTokenPanel(tokenPanel, tokenInput, tiMsg);
    };

    saveBtn.onclick = () => {
      saveToken(tokenInput, tokenPanel, tiMsg, statusEl);
    };
    tokenInput.onkeydown = (e) => {
      if (e.key === 'Enter') saveToken(tokenInput, tokenPanel, tiMsg, statusEl);
      if (e.key === 'Escape') {
        tokenPanel.style.display = 'none';
      }
    };
    clearBtn.onclick = () => {
      clearToken(tokenInput, tokenPanel, tiMsg, statusEl);
    };
    cancelBtn.onclick = () => {
      tokenPanel.style.display = 'none';
    };

    widget.appendChild(body);
    container.appendChild(widget);

    /* ── Mini collapsed pill ── */
    const mini = document.createElement('div');
    mini.className = 'gv2-mini';
    const mDot = document.createElement('span');
    mDot.className = `gv2-m-dot ${vis || 'unknown'}`;
    const mText = document.createElement('span');
    mText.textContent = repoFullName();
    mini.appendChild(mDot);
    mini.appendChild(mText);
    mini.onclick = toggleCollapse;
    container.appendChild(mini);

    function toggleCollapse() {
      const expanded = widget.style.display !== 'none';
      widget.style.display = expanded ? 'none' : '';
      mini.style.display = expanded ? 'flex' : 'none';
      collapseBtn.textContent = expanded ? '+' : '−';
      collapseBtn.title = expanded ? 'Expand' : 'Collapse';
    }

    document.body.appendChild(container);

    if (cfg.token) {
      apiCheckToken(cfg.token).then((result) => {
        if (result.valid) {
          vis = result.visibility;
          updateStatus(statusEl, vis, cfg);
          pubBtn.className = `gv2-btn gv2-btn-pub${vis === 'public' ? ' active' : ''}`;
          prvBtn.className = `gv2-btn gv2-btn-prv${vis === 'private' ? ' active' : ''}`;
        } else {
          log.add(`Token invalid: ${result.reason}`, true);
          delete cfg.token;
          saveCfg(cfg);
          tokenBtn.textContent = '🔑 Set Token';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
