/* =========================================================================
   コンジョイント推定エンジン（site2 と site4 で共用。ブラウザ／Node 両対応）
   ・多項ロジット(MNL)をニュートン・ラフソン法で個人内推定（切片なし）
   ・カテゴリ属性：効果コーディング、数値属性：[x, x^2]（x=(値-center)/scale）
   ・リッジ正則化 λ = 2.0（シミュレーションで決定。班員の元コードは1.2）
   ・重視度 = 各属性の水準別効用の範囲(max-min)
   ・実在商品の効用：数値属性は「推定した3水準の効用の区分線形補間」（水準範囲外は端の値で頭打ち）、
     カテゴリ属性は該当水準の効用（水準に対応しないものは 0）
   ========================================================================= */
(function (root) {
  'use strict';

  var LAMBDA = 2.0;

  function numericX(def, attr, levelIdx) {
    var n = def.num[attr];
    return (n.values[levelIdx] - n.center) / n.scale;
  }

  function effectCode(levelIdx, nLevels) {
    if (nLevels === 3) {
      if (levelIdx === 0) return [1, 0];
      if (levelIdx === 1) return [0, 1];
      return [-1, -1];
    }
    return levelIdx === 0 ? [1] : [-1];
  }

  function buildX(def, alt) {
    var x = [];
    def.attrs.forEach(function (a, k) {
      if (def.coding[a] === 'linear') {
        var xv = numericX(def, a, alt[k]);
        x.push(xv, xv * xv);
      } else {
        effectCode(alt[k], def.nlev[a]).forEach(function (c) { x.push(c); });
      }
    });
    return x;
  }

  function nParams(def) {
    return def.attrs.reduce(function (s, a) {
      if (def.coding[a] === 'linear') return s + 2;
      return s + (def.nlev[a] === 3 ? 2 : 1);
    }, 0);
  }

  function solveLinear(A, b) {
    var n = A.length;
    var M = A.map(function (row, i) { return row.concat([b[i]]); });
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      var d = M[col][col] || 1e-9;
      for (var c = col; c <= n; c++) M[col][c] /= d;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col];
        for (var c2 = col; c2 <= n; c2++) M[r2][c2] -= f * M[col][c2];
      }
    }
    return M.map(function (row) { return row[n]; });
  }

  // choices: 各セットで選んだ選択肢の index(0,1,2) の配列。反復回数・収束も返す版
  function estimateFull(def, choices, lambda) {
    if (lambda === undefined) lambda = LAMBDA;
    var sets = def.design;
    var P = nParams(def);
    var beta = new Array(P).fill(0);
    var iterations = 0, converged = false, lastDelta = Infinity;
    var X = sets.map(function (set) { return set.map(function (alt) { return buildX(def, alt); }); });
    for (var iter = 0; iter < 40; iter++) {
      var grad = new Array(P).fill(0);
      var A = []; for (var i = 0; i < P; i++) A.push(new Array(P).fill(0));
      for (var s = 0; s < X.length; s++) {
        var xs = X[s];
        var u = xs.map(function (x) { return x.reduce(function (sum, xi, k) { return sum + xi * beta[k]; }, 0); });
        var maxU = Math.max.apply(null, u);
        var expU = u.map(function (v) { return Math.exp(v - maxU); });
        var sumExp = expU.reduce(function (a, b) { return a + b; }, 0);
        var p = expU.map(function (v) { return v / sumExp; });
        var chosen = choices[s];
        var mu = new Array(P).fill(0);
        for (var k = 0; k < P; k++) for (var j = 0; j < 3; j++) mu[k] += p[j] * xs[j][k];
        for (var k2 = 0; k2 < P; k2++) grad[k2] += xs[chosen][k2] - mu[k2];
        for (var k3 = 0; k3 < P; k3++) for (var l = 0; l < P; l++) {
          var val = 0;
          for (var j2 = 0; j2 < 3; j2++) val += p[j2] * xs[j2][k3] * xs[j2][l];
          A[k3][l] += val - mu[k3] * mu[l];
        }
      }
      for (var q = 0; q < P; q++) { grad[q] -= lambda * beta[q]; A[q][q] += lambda; }
      var delta = solveLinear(A, grad);
      var maxAbs = 0;
      for (var m = 0; m < P; m++) { beta[m] += delta[m]; maxAbs = Math.max(maxAbs, Math.abs(delta[m])); }
      iterations = iter + 1; lastDelta = maxAbs;
      if (maxAbs < 1e-6) { converged = true; break; }
    }
    return { beta: beta, iterations: iterations, converged: converged, lastDelta: lastDelta };
  }
  function estimateMNL(def, choices, lambda) { return estimateFull(def, choices, lambda).beta; }

  // 係数の名前（beta配列の並びと同じ順）
  function paramNames(def) {
    var names = [];
    def.attrs.forEach(function (a) {
      if (def.coding[a] === 'linear') names.push(a + '.slope', a + '.quad');
      else if (def.nlev[a] === 3) names.push(a + '.b1', a + '.b2');
      else names.push(a + '.b1');
    });
    return names;
  }

  // 質問セット（水準番号）の識別用ハッシュ（FNV-1a 32bit。班員版と同じ式：設問セットのJSONをハッシュ）
  function designHash(def) {
    var str = JSON.stringify(def.design), h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    var t = h.toString(16); while (t.length < 8) t = '0' + t; return t;
  }

  // 推定結果の当てはまりと不確実性（リッジ項を含まない対数尤度、的中率、係数の標準誤差）
  //  nullLogLik = 17×ln(1/3)、mcFadden = 1 - logLik/nullLogLik、hitRate = 推定した効用最大の選択肢と実際の選択が一致した割合
  //  betaSE = (ヘッセ行列+λI)の逆行列の対角の平方根（事後分布のラプラス近似に相当）
  function computeFit(def, choices, beta, lambda) {
    if (lambda === undefined) lambda = LAMBDA;
    var P = nParams(def), A = [], grad = new Array(P).fill(0), i;
    for (i = 0; i < P; i++) A.push(new Array(P).fill(0));
    var logLik = 0, hits = 0, chosenProbs = [];
    def.design.forEach(function (set, s) {
      var xs = set.map(function (alt) { return buildX(def, alt); });
      var u = xs.map(function (x) { return x.reduce(function (sum, xi, k) { return sum + xi * beta[k]; }, 0); });
      var mx = Math.max.apply(null, u);
      var e = u.map(function (v) { return Math.exp(v - mx); });
      var z = e.reduce(function (a, b) { return a + b; }, 0);
      var pr = e.map(function (v) { return v / z; });
      var c = choices[s];
      chosenProbs.push(pr[c]); logLik += Math.log(pr[c]);
      if (pr.indexOf(Math.max.apply(null, pr)) === c) hits++;
      var mu = new Array(P).fill(0), k, l, j;
      for (k = 0; k < P; k++) for (j = 0; j < 3; j++) mu[k] += pr[j] * xs[j][k];
      for (k = 0; k < P; k++) {
        grad[k] += xs[c][k] - mu[k];
        for (l = 0; l < P; l++) {
          var val = 0; for (j = 0; j < 3; j++) val += pr[j] * xs[j][k] * xs[j][l];
          A[k][l] += val - mu[k] * mu[l];
        }
      }
    });
    for (i = 0; i < P; i++) { grad[i] -= lambda * beta[i]; A[i][i] += lambda; }
    var se = [];
    for (i = 0; i < P; i++) {
      var ev = new Array(P).fill(0); ev[i] = 1;
      se.push(Math.sqrt(Math.max(solveLinear(A, ev)[i], 0)));
    }
    var n = def.design.length, nullLL = n * Math.log(1 / 3);
    return { logLik: logLik, nullLogLik: nullLL, mcFadden: 1 - logLik / nullLL, hitRate: hits / n,
             chosenProbs: chosenProbs, maxAbsGrad: Math.max.apply(null, grad.map(Math.abs)), betaSE: se };
  }

  // beta → 属性ごとの水準別効用（数値属性も「実際の水準位置」での効用）
  function levelUtilities(def, beta) {
    var lu = {}, coef = {}, off = 0;
    def.attrs.forEach(function (a) {
      if (def.coding[a] === 'linear') {
        var slope = beta[off], quad = beta[off + 1];
        lu[a] = [0, 1, 2].map(function (i) { var x = numericX(def, a, i); return slope * x + quad * x * x; });
        coef[a] = { slope: slope, quad: quad };
        off += 2;
      } else if (def.nlev[a] === 3) {
        var b1 = beta[off], b2 = beta[off + 1];
        lu[a] = [b1, b2, -(b1 + b2)];
        off += 2;
      } else {
        var c1 = beta[off];
        lu[a] = [c1, -c1];
        off += 1;
      }
    });
    return { lu: lu, coef: coef };
  }

  // 重視度(range)・構成比(%)。降順、同点は attrs の並び順（先頭ほど優先）
  function importance(def, lu) {
    var rows = def.attrs.map(function (a, idx) {
      var u = lu[a];
      return { attr: a, label: def.attrLabels[a], idx: idx, range: Math.max.apply(null, u) - Math.min.apply(null, u), utils: u };
    });
    var total = rows.reduce(function (s, r) { return s + r.range; }, 0) || 1;
    rows.forEach(function (r) { r.pct = r.range / total * 100; });
    rows.sort(function (x, y) { return (y.range - x.range) || (x.idx - y.idx); });
    return rows;
  }

  // 数値属性の区分線形補間（水準範囲外は端で頭打ち）。value が null なら3水準の平均（中立）
  function interpNumeric(def, lu, attr, value) {
    var u = lu[attr];
    if (value === null || value === undefined || isNaN(value)) return (u[0] + u[1] + u[2]) / 3;
    var lv = def.num[attr].values;
    if (value <= lv[0]) return u[0];
    if (value >= lv[2]) return u[2];
    var k = value < lv[1] ? 0 : 1;
    var t = (value - lv[k]) / (lv[k + 1] - lv[k]);
    return u[k] * (1 - t) + u[k + 1] * t;
  }

  // 属性1つ分の部分効用。v = 商品の水準データ（数値=実測値、カテゴリ=水準index、-1=水準外→0）
  function partialUtility(def, lu, attr, value) {
    if (def.coding[attr] === 'linear') return interpNumeric(def, lu, attr, value);
    if (value === null || value === undefined || value < 0) return 0;   // 負の値＝水準外（効用0）
    return lu[attr][value];
  }

  function productUtility(def, lu, v) {
    var s = 0;
    def.attrs.forEach(function (a) { s += partialUtility(def, lu, a, v[a]); });
    return s;
  }

  // 数値属性の「最も近い水準」のindex（同じ値かどうかの判定用）。値なしは -1
  function nearestLevel(def, attr, value) {
    if (value === null || value === undefined || isNaN(value)) return -1;
    var lv = def.num[attr].values;
    var x = Math.min(Math.max(value, lv[0]), lv[2]);
    var k = x < lv[1] ? 0 : 1;
    var t = (x - lv[k]) / (lv[k + 1] - lv[k]);
    return t > 0.5 ? k + 1 : k;
  }
  function classOf(def, attr, value) {
    if (def.coding[attr] === 'linear') return nearestLevel(def, attr, value);
    return (value === null || value === undefined) ? -1 : value;
  }

  // 回答(A/B/C→0/1/2)から推定して、保存・送信用の結果オブジェクトを作る
  function analyze(def, choiceIdx, lambda) {
    var est = estimateFull(def, choiceIdx, lambda);
    var beta = est.beta;
    var lc = levelUtilities(def, beta);
    var rank = importance(def, lc.lu);
    var fit = computeFit(def, choiceIdx, beta, lambda);
    return { beta: beta, lu: lc.lu, coef: lc.coef, ranking: rank, top1: rank[0].attr, top2: rank[1].attr,
             est: { iterations: est.iterations, converged: est.converged, lastDelta: est.lastDelta }, fit: fit };
  }

  var api = {
    LAMBDA: LAMBDA, numericX: numericX, buildX: buildX, nParams: nParams, estimateMNL: estimateMNL, estimateFull: estimateFull,
    paramNames: paramNames, designHash: designHash, computeFit: computeFit,
    levelUtilities: levelUtilities, importance: importance, interpNumeric: interpNumeric,
    partialUtility: partialUtility, productUtility: productUtility, nearestLevel: nearestLevel,
    classOf: classOf, analyze: analyze
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ConjointEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
