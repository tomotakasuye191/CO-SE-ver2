/* =========================================================================
   site2（コンジョイント）の画面制御。4財共通。各HTMLで window.GOOD_CODE を指定して読み込む。
   流れ：説明 → 17問(3択) → 推定(端末内) → GASへ記録(自動リトライ) → site4へ自動遷移
   ・診断結果は被験者には見せない（記録のみ）
   ・1問ごとの回答時間(ミリ秒)を記録
   ========================================================================= */
(function () {
  'use strict';
  var CFG = window.EXP_CONFIG;
  var DEF = window.CONJOINT_DEFS[window.GOOD_CODE];
  var E = window.ConjointEngine;
  var GOOD = DEF.good;
  var RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

  var P = new URLSearchParams(window.location.search);
  var SYS = {
    id: P.get('id') || '', group: P.get('group') || '', good1: P.get('good1') || '', good2: P.get('good2') || '',
    current: P.get('current') || '1', gender: P.get('gender') || '', age: P.get('age') || ''
  };

  // GASのコールドスタート対策
  try { fetch(CFG.GAS_URL, { method: 'GET', mode: 'no-cors' }).catch(function () {}); } catch (e) {}

  // 次のsite4を速く表示するため、裏で画像を先読みしておく
  (function preload() {
    var names = [];
    var maxN = (GOOD === 'yogurt') ? 32 : 31;
    for (var i = 1; i <= maxN; i++) names.push(String(i));
    for (var j = 1; j <= 20; j++) names.push('b' + j);
    names.forEach(function (n) { var im = new Image(); im.src = CFG.BASE_URL + 'images/' + GOOD + '/' + n + '.jpg'; });
  })();

  var N = DEF.design.length;
  var state = {
    current: 0, answers: new Array(N).fill(null),
    shownAt: 0, rtFirst: new Array(N).fill(null), rtFinal: new Array(N).fill(null),
    startedAt: 0, lastResult: null
  };

  function $(id) { return document.getElementById(id); }
  function showScreen(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (el) { el.classList.remove('active'); });
    $(id).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderProgressDots() {
    var wrap = $('progress-wrap');
    wrap.innerHTML = '';
    for (var i = 0; i < N; i++) {
      var d = document.createElement('div');
      d.className = 'progress-dot' + (i < state.current ? ' done' : '') + (i === state.current ? ' current' : '');
      wrap.appendChild(d);
    }
  }

  function renderOption(el, alt, label) {
    var pkIdx = alt[DEF.attrs.indexOf('package')];
    var img = '<div class="nutrition-image-box"><img src="../' + DEF.packageImages[pkIdx] + '" alt="パッケージデザインのイメージ"></div>';
    var rows = DEF.attrs.map(function (a, i) {
      if (a === 'package') return '';
      return '<div class="attr-row"><span class="k">' + DEF.attrLabels[a] + '</span><span class="v">' + DEF.labels[a][alt[i]] + '</span></div>';
    }).join('');
    el.innerHTML = '<div class="opt-label">選択肢 ' + label + '</div>' + img + rows;
  }

  function renderSet() {
    var idx = state.current, s = DEF.design[idx];
    $('progress-label').textContent = 'セット ' + (idx + 1) + ' / ' + N;
    renderProgressDots();
    renderOption($('option-A'), s[0], 'A');
    renderOption($('option-B'), s[1], 'B');
    renderOption($('option-C'), s[2], 'C');
    Array.prototype.forEach.call(document.querySelectorAll('.option-card'), function (c) { c.classList.remove('selected'); });
    $('btn-next-set').disabled = true;
    state.shownAt = Date.now();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('btn-start').addEventListener('click', function () {
    state.startedAt = Date.now();
    state.current = 0;
    renderSet();
    showScreen('screen-conjoint');
  });

  Array.prototype.forEach.call(document.querySelectorAll('.option-card'), function (card) {
    card.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.option-card'), function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      var i = state.current, now = Date.now() - state.shownAt;
      state.answers[i] = parseInt(card.dataset.choice, 10);
      if (state.rtFirst[i] === null) state.rtFirst[i] = now;
      state.rtFinal[i] = now;
      $('btn-next-set').disabled = false;
    });
  });

  $('btn-next-set').addEventListener('click', function () {
    if (state.answers[state.current] === null) return;
    state.current += 1;
    if (state.current < N) renderSet(); else finish();
  });

  function r(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }

  function buildPayload() {
    var an = E.analyze(DEF, state.answers);
    var ac1 = '', ac2 = '';
    var keys = Object.keys(DEF.attention).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length >= 1) ac1 = (state.answers[keys[0] - 1] === DEF.attention[keys[0]]) ? 'pass' : 'fail';
    if (keys.length >= 2) ac2 = (state.answers[keys[1] - 1] === DEF.attention[keys[1]]) ? 'pass' : 'fail';
    var lu = {};
    DEF.attrs.forEach(function (a) { lu[a] = an.lu[a].map(function (x) { return r(x, 5); }); });
    var payload = {
      action: 'submitConjoint', id: SYS.id, good: GOOD, gender: SYS.gender, age: SYS.age,
      surveyId: DEF.surveyId, levelVersion: window.CONJOINT_VERSION, lambda: E.LAMBDA,
      choices: state.answers.map(function (i) { return String.fromCharCode(65 + i); }),
      rtFinalMs: state.rtFinal, rtFirstMs: state.rtFirst,
      totalSec: r((Date.now() - state.startedAt) / 1000, 1),
      attentionCheck1: ac1, attentionCheck2: ac2,
      attrs: DEF.attrs,
      ranking: an.ranking.map(function (x) { return { attr: x.attr, label: x.label, range: r(x.range, 5), pct: r(x.pct, 3), utils: x.utils.map(function (u) { return r(u, 5); }) }; }),
      lu: lu,
      coef: an.coef,
      beta: an.beta.map(function (b) { return r(b, 6); }),
      top1: an.top1, top2: an.top2
    };
    return { payload: payload, lu: lu };
  }

  function finish() {
    $('submit-status').textContent = '回答を記録しています…';
    $('btn-retry-submit').style.display = 'none';
    showScreen('screen-result');
    state.lastResult = buildPayload();
    send(state.lastResult, 0);
  }

  function nextUrl(lu) {
    var q = new URLSearchParams({
      id: SYS.id, group: SYS.group, good1: SYS.good1, good2: SYS.good2, current: SYS.current,
      gender: SYS.gender, age: SYS.age, good: GOOD, lu: JSON.stringify(lu)
    });
    return CFG.BASE_URL + 'site4/index.html?' + q.toString();
  }

  function send(res, attempt) {
    var label = attempt > 0 ? '（自動再送信 ' + attempt + '/' + RETRY_DELAYS_MS.length + ' 回目…）' : '';
    $('submit-status').textContent = '回答を記録しています…' + label;
    fetch(CFG.GAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(res.payload)
    }).then(function (resp) { return resp.text(); })
      .then(function (text) {
        var d; try { d = JSON.parse(text); } catch (e) { throw new Error('予期しない応答'); }
        if (d.status !== 'ok') throw new Error(d.message || '記録に失敗しました');
        try { sessionStorage.setItem('experiment_lu_' + GOOD, JSON.stringify(res.lu)); } catch (e) {}
        $('submit-status').textContent = '記録が完了しました。実験画面に移動します…';
        window.location.href = nextUrl(res.lu);
      })
      .catch(function () { retryOrFail(res, attempt); });
  }

  function retryOrFail(res, attempt) {
    if (attempt < RETRY_DELAYS_MS.length) {
      var delay = RETRY_DELAYS_MS[attempt];
      $('submit-status').textContent = '通信に失敗しました。' + Math.round(delay / 1000) + '秒後に自動で再送信します…';
      setTimeout(function () { send(res, attempt + 1); }, delay);
      return;
    }
    $('submit-status').textContent = '回答の記録に失敗しました。お手数ですが下のボタンからもう一度お試しください。';
    $('btn-retry-submit').style.display = 'block';
  }

  $('btn-retry-submit').addEventListener('click', function () {
    $('btn-retry-submit').style.display = 'none';
    send(state.lastResult, 0);
  });

  // テスト用に公開
  window.__conjointTest = { state: state, buildPayload: buildPayload, nextUrl: nextUrl };
})();
