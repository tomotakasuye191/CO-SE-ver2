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
  // コード（推定・記録ロジック）の版。計算や記録の方法を変えたら更新する。
  var CODE_VERSION = 'site2_code_2026-10-21a';

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
    lastResult: null, attempts: []
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('btn-start').addEventListener('click', function () {
    state.current = 0;
    renderSet();
    showScreen('screen-conjoint');
  });

  Array.prototype.forEach.call(document.querySelectorAll('.option-card'), function (card) {
    card.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.option-card'), function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      var i = state.current;
      state.answers[i] = parseInt(card.dataset.choice, 10);
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
      attentionCheck1: ac1, attentionCheck2: ac2,
      attrs: DEF.attrs,
      ranking: an.ranking.map(function (x) { return { attr: x.attr, label: x.label, range: r(x.range, 5), pct: r(x.pct, 3), utils: x.utils.map(function (u) { return r(u, 5); }) }; }),
      lu: lu,
      coef: an.coef,
      beta: an.beta.map(function (b) { return r(b, 6); }),
      top1: an.top1, top2: an.top2,
      // --- 分析用の追加記録（班員版の記録項目を取り込み） ---
      codeVersion: CODE_VERSION, designHash: E.designHash(DEF),
      paramNames: E.paramNames(DEF), betaSE: an.fit.betaSE.map(function (b) { return r(b, 6); }),
      fit: { logLik: r(an.fit.logLik, 6), nullLogLik: r(an.fit.nullLogLik, 6), mcFadden: r(an.fit.mcFadden, 6),
             hitRate: r(an.fit.hitRate, 6), chosenProbs: an.fit.chosenProbs.map(function (x) { return r(x, 6); }) },
      estimation: { iterations: an.est.iterations, converged: an.est.converged, lastDelta: an.est.lastDelta,
                    maxAbsBeta: r(Math.max.apply(null, an.beta.map(Math.abs)), 6), maxAbsGrad: an.fit.maxAbsGrad },
      allSameChoice: (function () { var s = {}; state.answers.forEach(function (x) { s[x] = 1; }); return Object.keys(s).length === 1; })(),
      submittedAt: new Date().toISOString()   // 診断用。GASは記録しない
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

  // ---- 送信と原因の特定 ----
  // 失敗するたびに「何が・どの段階で・何秒で」失敗したかを state.attempts に貯め、
  // ・画面に原因を出し、・console に出し、・（GASに届く場合は）エラーログシートへ送る。
  function nowJst() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' JST';
  }

  function diagText(res) {
    var lines = [
      '【原因の情報】この内容を班員（実験担当）に伝えてください',
      '日時: ' + nowJst(),
      'ID: ' + SYS.id + ' / 財: ' + GOOD + ' / 版: ' + (CODE_VERSION || ''),
      'オンライン表示: ' + (navigator.onLine ? 'はい' : 'いいえ') + ' / 端末: ' + (navigator.userAgent || '').slice(0, 120),
      '送信回数: ' + state.attempts.length
    ];
    state.attempts.forEach(function (a, i) {
      lines.push((i + 1) + '回目: ' + a.kind + ' / ' + a.ms + 'ms / ' + a.message);
    });
    return lines.join('\n');
  }

  function showDiag(res) {
    var box = $('submit-diag');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'submit-diag';
      box.style.cssText = 'white-space:pre-wrap;word-break:break-all;text-align:left;font-size:12px;background:#f4f4f4;border-radius:8px;padding:10px;margin:12px 0;user-select:all;';
      $('submit-status').parentNode.insertBefore(box, $('btn-retry-submit'));
    }
    box.textContent = diagText(res);
  }

  function reportToServer(res) {
    // 失敗の原因をGASのエラーログへ送る（GASに届かなければ何もしない）
    var last = state.attempts[state.attempts.length - 1] || {};
    try {
      fetch(CFG.GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'logClientError', failedAction: 'submitConjoint', id: SYS.id, good: GOOD,
          kind: last.kind || '', message: last.message || '', detail: diagText(res), elapsedMs: last.ms, errorId: last.errorId || '' })
      }).catch(function () {});
    } catch (e) {}
  }

  function fail(res, attempt, t0, kind, message, errorId) {
    state.attempts.push({ kind: kind, message: message, ms: Date.now() - t0, errorId: errorId || '' });
    try { console.error('[conjoint送信失敗]', kind, message, 'attempt=' + attempt); } catch (e) {}
    retryOrFail(res, attempt, kind + '：' + message);
  }

  function send(res, attempt) {
    var label = attempt > 0 ? '（自動再送信 ' + attempt + '/' + RETRY_DELAYS_MS.length + ' 回目…）' : '';
    $('submit-status').textContent = '回答を記録しています…' + label;
    var t0 = Date.now(), httpStatus = '';
    fetch(CFG.GAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(res.payload)
    }).then(function (resp) { httpStatus = resp.status; return resp.text(); })
      .then(function (text) {
        var d;
        try { d = JSON.parse(text); }
        catch (e) {
          // GASが「JSONではなくHTML」を返した＝権限・割当上限・デプロイ未更新など
          fail(res, attempt, t0, 'GASの応答が想定外(HTTP ' + httpStatus + ')', (text || '').replace(/\s+/g, ' ').slice(0, 160)); return;
        }
        if (d.status !== 'ok') { fail(res, attempt, t0, 'GASがエラーを返した', d.message || '(メッセージなし)', d.errorId); return; }
        if (d.warnings && d.warnings.length) { try { console.warn('[conjoint] 一部の保存に失敗(回答は保存済み):', d.warnings); } catch (e) {} }
        try { sessionStorage.setItem('experiment_lu_' + GOOD, JSON.stringify(res.lu)); } catch (e) {}
        $('submit-status').textContent = '記録が完了しました。実験画面に移動します…';
        window.location.href = nextUrl(res.lu);
      })
      .catch(function (err) {
        fail(res, attempt, t0, '通信できなかった(fetch失敗)', (err && err.message) || String(err));
      });
  }

  function retryOrFail(res, attempt, why) {
    if (attempt < RETRY_DELAYS_MS.length) {
      var delay = RETRY_DELAYS_MS[attempt];
      $('submit-status').textContent = '失敗しました（' + why + '）。' + Math.round(delay / 1000) + '秒後に自動で再送信します…';
      setTimeout(function () { send(res, attempt + 1); }, delay);
      return;
    }
    $('submit-status').textContent = '回答の記録に失敗しました。お手数ですが下のボタンからもう一度お試しください。';
    showDiag(res);
    reportToServer(res);
    $('btn-retry-submit').style.display = 'block';
  }

  $('btn-retry-submit').addEventListener('click', function () {
    $('btn-retry-submit').style.display = 'none';
    var box = $('submit-diag'); if (box) box.textContent = '';
    state.attempts = [];
    send(state.lastResult, 0);
  });

  // テスト用に公開
  window.__conjointTest = { state: state, buildPayload: buildPayload, nextUrl: nextUrl };
})();
