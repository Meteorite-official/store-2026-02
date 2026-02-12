/*
  Paper Galgame: minimal static VN engine
  - loads game-data.json
  - menu selects audience + guide persona
  - supports dialog scenes + quiz scenes + ending scene
  - localStorage save/continue
*/

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = 'paper2galgame.save.v1';

function loadJson(url) {
  return fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  });
}

function showScreen(which) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('screen--active');
  $(which).classList.add('screen--active');
}

function openModal(title, bodyHtml, footerButtons=[]) {
  $('screenModal').setAttribute('aria-hidden', 'false');
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  const footer = $('modalFooter');
  footer.innerHTML = '';
  for (const btn of footerButtons) footer.appendChild(btn);
}

function closeModal() {
  $('screenModal').setAttribute('aria-hidden', 'true');
  $('modalTitle').textContent = '';
  $('modalBody').innerHTML = '';
  $('modalFooter').innerHTML = '';
}

function mkBtn(text, { kind='default', onClick }={}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn' + (kind==='primary' ? ' btn--primary' : kind==='danger' ? ' btn--danger' : kind==='ghost' ? ' btn--ghost' : '');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

function setChoices(btns) {
  const wrap = $('choices');
  wrap.innerHTML = '';
  for (const b of btns) wrap.appendChild(b);
}

function setDialog({ speaker, text }) {
  $('speaker').textContent = speaker;
  $('text').textContent = text;
}

function pickLine(scene, audience, guide) {
  const L = scene.lines?.[audience]?.[guide];
  if (!L) {
    // fallback order
    const fallback = scene.lines?.informed?.senpai || scene.lines?.expert?.senpai || scene.lines?.lay?.senpai;
    return fallback || { speaker: 'Guide', text: '[Missing text]' };
  }
  return L;
}

function pickPrompt(scene, audience) {
  return scene.prompt?.[audience] ?? scene.prompt?.informed ?? scene.prompt?.expert ?? scene.prompt?.lay ?? '';
}

function pickTextByAudience(obj, audience) {
  if (typeof obj === 'string') return obj;
  return obj?.[audience] ?? obj?.informed ?? obj?.expert ?? obj?.lay ?? '';
}

function computeModeLabel(data, audience, guide) {
  const a = data.labels?.audiences?.[audience] ?? audience;
  const g = data.labels?.guides?.[guide] ?? guide;
  return `${a} · ${g}`;
}

function runGame(data) {
  const scenesById = new Map(data.scenes.map(s => [s.id, s]));

  const state = {
    audience: 'informed',
    guide: 'senpai',
    sceneId: data.scenes[0]?.id || 'prologue',
    quiz: {},
  };

  function renderScene() {
    const scene = scenesById.get(state.sceneId);
    if (!scene) {
      setDialog({ speaker: 'System', text: `Scene not found: ${state.sceneId}` });
      setChoices([]);
      return;
    }

    $('chipChapter').textContent = scene.chapter || 'Chapter';
    $('chipMode').textContent = computeModeLabel(data, state.audience, state.guide);

    if (scene.kind === 'dialog') {
      const line = pickLine(scene, state.audience, state.guide);
      setDialog(line);
      setChoices([]);
      $('btnNext').disabled = false;
      return;
    }

    if (scene.kind === 'quiz') {
      $('btnNext').disabled = true;
      const prompt = pickPrompt(scene, state.audience);
      setDialog({ speaker: 'System', text: prompt });

      const btns = scene.options.map(opt => {
        const t = pickTextByAudience(opt.text, state.audience);
        return mkBtn(t, {
          onClick: () => {
            const fb = pickTextByAudience(opt.feedback, state.audience);
            state.quiz[scene.id] = { chosen: opt.id, correct: !!opt.correct };
            saveState(state);
            openModal(
              opt.correct ? '回答正确' : '再想想',
              `<div>${escapeHtml(fb).replace(/\n/g,'<br/>')}</div>`,
              [mkBtn('继续', { kind: 'primary', onClick: () => { closeModal(); goto(scene.next); } })]
            );
          }
        });
      });
      setChoices(btns);
      return;
    }

    if (scene.kind === 'ending') {
      $('btnNext').disabled = true;
      const line = pickLine(scene, state.audience, state.guide);
      setDialog(line);

      const ctaText = pickTextByAudience(scene.cta?.text || data.meta?.endCtaText || 'Continue', state.audience);
      setChoices([
        mkBtn(ctaText, {
          kind: 'primary',
          onClick: () => {
            const url = data.meta?.redirectUrl;
            if (!url) return;
            window.location.href = url;
          }
        }),
        mkBtn('返回菜单', {
          onClick: () => {
            showScreen('screenMenu');
          }
        })
      ]);

      // save completion state
      saveState(state);
      return;
    }

    setDialog({ speaker: 'System', text: `Unknown scene kind: ${scene.kind}` });
    setChoices([]);
  }

  function goto(nextId) {
    if (!nextId) {
      // if missing next, go to ending if exists
      if (scenesById.has('ending')) nextId = 'ending';
      else return;
    }
    state.sceneId = nextId;
    saveState(state);
    renderScene();
  }

  // Menu wiring
  $('btnStart').addEventListener('click', () => {
    state.audience = $('selAudience').value;
    state.guide = $('selGuide').value;
    state.sceneId = data.scenes[0]?.id || 'prologue';
    state.quiz = {};
    saveState(state);
    showScreen('screenGame');
    renderScene();
  });

  $('btnContinue').addEventListener('click', () => {
    const saved = loadState();
    if (!saved) {
      openModal('没有存档', '当前浏览器没有找到存档。', [mkBtn('知道了', { kind:'primary', onClick: closeModal })]);
      return;
    }
    Object.assign(state, saved);
    showScreen('screenGame');
    renderScene();
  });

  $('btnRestart').addEventListener('click', () => {
    openModal('确认重来？', '这会清除本地存档并回到菜单。', [
      mkBtn('取消', { onClick: closeModal }),
      mkBtn('重来', { kind:'danger', onClick: () => { clearState(); closeModal(); showScreen('screenMenu'); } })
    ]);
  });

  $('btnNext').addEventListener('click', () => {
    const scene = scenesById.get(state.sceneId);
    if (!scene) return;
    goto(scene.next);
  });

  $('btnSaves').addEventListener('click', () => {
    const saved = loadState();
    if (!saved) {
      openModal('存档', '当前没有存档。开始游戏后会自动存档。', [mkBtn('关闭', { kind:'primary', onClick: closeModal })]);
      return;
    }
    openModal('存档', `<pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(saved, null, 2))}</pre>`, [mkBtn('关闭', { kind:'primary', onClick: closeModal })]);
  });

  $('btnConfig').addEventListener('click', () => {
    openModal('设置', '这是一个静态模板引擎示例。你可以在后续版本加入：打字速度、字体大小、术语注释开关等。', [mkBtn('关闭', { kind:'primary', onClick: closeModal })]);
  });

  // Modal close
  $('screenModal').addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.close === '1') closeModal();
  });

  // initial screen
  showScreen('screenMenu');
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

loadJson('game-data.json')
  .then(runGame)
  .catch(err => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:white; padding:16px">Failed to load game-data.json\n${escapeHtml(err.message)}</pre>`;
  });
