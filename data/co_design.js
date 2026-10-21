/* =========================================================================
   CO実験の財選定ロジック（site4 用。ブラウザ／Node 両対応）
   ・A    ：スライドごとに別の商品（毎回違う「合理的に最適な財」）。全商品プールの効用 上位4商品を、
            ランダムな順番で提示数5/10/15/20に1つずつ割り当てる（1回目と2回目で同じ提示数なら同じA）。各スライドでは、そのAより
            効用の高い商品は一切出さないので、そのスライド内ではAが必ず最適。1位の商品は 'A0'（基準）
            としてSQ選定・top2の基準に使う。
   ・top2 ：重視度の高い2属性（パッケージと、プール内で全商品が同じ値の属性は除く）
   ・A'   ：他の商品の top2 の値を A と同じ表示に揃えたもの（A を超えず、SQ を上回る）
   ・SQ   ：基準財。被験者ごとに1つ固定。選定ステップ1〜5（下記）
   ========================================================================= */
(function (root) {
  'use strict';
  var E = (typeof require !== 'undefined' && typeof module !== 'undefined' && module.exports) ? require('./conjoint_engine.js') : root.ConjointEngine;

  var SIZES = [5, 10, 15, 20];
  var APRIME_COUNT = { 5: 2, 10: 5, 15: 8, 20: 10 };
  var TARGET = 0.7, BAND = 0.15, EPS = 1e-9;
  var NEAR_MAX = 0.10; // SQ と A の数値トップ2属性の差が、水準範囲(最小〜最大)のこの割合以内なら「近い」
  var RESERVE_N = 3;
  var RESERVE_EXCLUDE = { yogurt: [1, 19, 21], rice: [1], wine: [4, 21], chocolate: [10] };

  function shuffle(arr, rng) {
    var a = arr.slice(), r = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 水準外の産地（コンジョイントの3水準にない産地）：産地の文字列が完全に同じときだけ「同じ」と扱う。
  // 水準外は効用0のまま、文字列ごとに別の負のコード（-1, -2, ...）を割り当てる。
  var OUT_OF_LEVEL_ATTRS = { wine: [['origin', 'origin']], rice: [['origin', 'origin']] };

  // 画面に出す表示をコンジョイントの水準に対応させる
  //  ・ヨーグルトの栄養情報：v.nutri（0=表示なし／1=たんぱく質のみ／2=全部）に合わせて表示を変える
  //  ・ヨーグルトのカロリー：100gあたりに統一（効用の計算値 v.cal と同じ基準）
  function prepareDisplay(good, pool) {
    (OUT_OF_LEVEL_ATTRS[good] || []).forEach(function (pair) {
      var map = {}, n = 0;
      pool.forEach(function (p) {
        if (p.v[pair[0]] !== -1 && !(p.v[pair[0]] < 0)) return;
        var s = String(p.attrs[pair[1]]);
        if (!map.hasOwnProperty(s)) map[s] = -(++n);
        p.v[pair[0]] = map[s];
      });
    });
    if (good === 'yogurt') {
      pool.forEach(function (p) {
        var orig = String(p.attrs.nutrition || '');
        if (p.v.nutri === 0) p.attrs.nutrition = '栄養成分表示なし';
        else if (p.v.nutri === 1) p.attrs.nutrition = orig.split('/')[0];   // 「たんぱく質○g」だけ
        // p.v.nutri === 2 は元の表示（たんぱく質／脂質／炭水化物／食塩相当量）のまま
        if (!/100gあたり/.test(String(p.attrs.calorie))) {
          p.attrs.calorie = (Math.round(p.v.cal * 10) / 10) + 'kcal（100gあたり）';
        }
      });
    }
  }

  // 商品プールを作る。PRODUCTS（1回目用）+ PRODUCTS_ROUND2（2回目用）と、水準データ PRODUCT_LEVELS を結合
  function buildPool(good, products, products2, levels) {
    var lv = {};
    levels.forEach(function (x) { lv[String(x.id)] = x.v; });
    var pool = [];
    function add(list, round) {
      list.forEach(function (p) {
        var attrs = {}; Object.keys(p.attrs).forEach(function (k) { attrs[k === 'effect' ? 'trait' : k] = p.attrs[k]; });
        if (attrs.trait === '特にない') attrs.trait = '効果なし';
        if (good === 'yogurt' && String(p.id) === '11') attrs.volume = '80g×4個';
        var v = lv[String(p.id)];
        if (!v) throw new Error('水準データがありません: ' + good + ' ' + p.id);
        pool.push({ id: p.id, round: round, name: p.name, image: p.image, attrs: attrs, v: v });
      });
    }
    add(products, 1); add(products2, 2);
    prepareDisplay(good, pool);
    return pool;
  }

  function evalPool(def, lu, pool) {
    var u = pool.map(function (p) { return E.productUtility(def, lu, p.v); });
    var mn = Math.min.apply(null, u), mx = Math.max.apply(null, u), span = (mx - mn) || 1;
    var byId = {};
    pool.forEach(function (p, i) { byId[String(p.id)] = { u: u[i], norm: (u[i] - mn) / span }; });
    return { u: u, min: mn, max: mx, span: span, byId: byId };
  }

  function constantAttrs(def, pool) {
    return def.attrs.filter(function (a) {
      var s = {};
      pool.forEach(function (p) { s[E.classOf(def, a, p.v[a])] = 1; });
      return Object.keys(s).length <= 1;
    });
  }

  // top2：重視度順に、package・プール内で定数の属性を除いて上位2つ（返り値は属性キー配列）
  function pickTop2(def, lu, pool) {
    var cons = constantAttrs(def, pool);
    var rows = E.importance(def, lu).filter(function (r) { return r.attr !== 'package' && cons.indexOf(r.attr) === -1; });
    return rows.slice(0, 2).map(function (r) { return r.attr; });
  }

  function pickA(pool, ev) {
    var best = 0;
    for (var i = 1; i < pool.length; i++) if (ev.u[i] > ev.u[best] + EPS) best = i;
    return pool[best];
  }

  function sameClass(def, a, v1, v2) { return E.classOf(def, a, v1[a]) === E.classOf(def, a, v2[a]); }

  // SQの選定（ステップ1〜5）。rng は同点のランダム化用。
  function pickSQ(def, lu, pool, ev, A, top2, rng, ceilU) {
    var r = rng || Math.random;
    var uA = ev.byId[String(A.id)].u;
    var uCap = (ceilU === undefined) ? uA : Math.min(uA, ceilU); // SQ は全スライドのA(上位8)より効用が低いこと
    var rest = def.attrs.filter(function (a) { return top2.indexOf(a) === -1; });
    var cons = constantAttrs(def, pool);
    var modAttrs = (def.modifiable || []).filter(function (a) { return top2.indexOf(a) === -1 && cons.indexOf(a) === -1; });

    function partial(v, a) { return E.partialUtility(def, lu, a, v[a]); }
    function tradeoff(v) { return rest.some(function (a) { return partial(v, a) > partial(A.v, a) + EPS; }); }
    function diffBothStrict(v) { return top2.every(function (a) { return !sameClass(def, a, v, A.v); }); }
    function normOf(u) { return (u - ev.min) / ev.span; }

    var useGap = false;
    function best(items) { // items: {p, v, u, mods, nch}
      var b = null, bd = 1e9;
      items.forEach(function (it) {
        var d = Math.abs(normOf(it.u) - TARGET);
        if (useGap) { // Aとの数値トップ2属性の差が小さい方を最優先（0.05刻みで同等扱い）、同等なら0.7に近い方
          var gi = Math.round(Math.max.apply(null, gapOf(it.p.v)) / 0.05), gb = b ? Math.round(Math.max.apply(null, gapOf(b.p.v)) / 0.05) : 0;
          if (b !== null && gi !== gb) { if (gi < gb) { b = it; bd = d; } return; }
        }
        if (b === null || d < bd - EPS || (Math.abs(d - bd) <= EPS && (it.nch < b.nch || (it.nch === b.nch && r() < 0.5)))) { b = it; bd = d; }
      });
      return b;
    }
    // 数値のトップ2属性が A に近いか（差 ≤ 水準範囲×NEAR_MAX）。数値のトップ2属性がなければ判定しない
    var numTop2 = top2.filter(function (a) { return def.coding[a] === 'linear'; });
    function gapOf(v) {
      return numTop2.map(function (a) { var lv = def.num[a].values; return Math.abs(v[a] - A.v[a]) / (lv[2] - lv[0]); });
    }
    function near(v) { return numTop2.length > 0 && gapOf(v).every(function (g) { return g <= NEAR_MAX + EPS; }); }
    function make(step, it) {
      var normU = normOf(it.u);
      var rank = 1 + ev.u.filter(function (x) { return x > it.u + EPS; }).length;
      // 重要2項目(top2)のうち、A0と同じ水準のもの：一致数(0〜2)と一致した属性（0=両方異なる、2=両方一致）
      var matched = top2.filter(function (a) { return sameClass(def, a, it.p.v, A.v); });
      return { sq: it.p, step: step, near: near(it.p.v), top2Match: matched.length, top2MatchedAttrs: matched, mods: it.mods || {}, u: it.u, norm: normU, rank: rank, poolSize: pool.length,
               gapRaw: uA - it.u, gapNorm: 1 - normU };
    }
    var inBand = function (u) { return Math.abs(normOf(u) - TARGET) <= BAND + EPS; };
    var others = pool.filter(function (p) { return p.id !== A.id && ev.byId[String(p.id)].u < uCap - EPS; });

    // 近い基準財用の「異なる」判定：カテゴリ属性は水準が違う／数値属性は水準が同じでも値そのものが違えばよい
    function diffNear(v) {
      return top2.every(function (a) {
        if (def.coding[a] === 'linear') return Math.abs(v[a] - A.v[a]) > EPS;
        return !sameClass(def, a, v, A.v);
      });
    }
    function stepBoth(onlyNear) {
      var nr = function () { return true; };
      var diffBoth = onlyNear ? diffNear : diffBothStrict;
      // 1) 両方異なる・トレードオフあり・帯内の実在商品
      var s1 = others.filter(function (p) { return diffBoth(p.v) && nr(p.v) && tradeoff(p.v) && inBand(ev.byId[String(p.id)].u); })
        .map(function (p) { return { p: p, u: ev.byId[String(p.id)].u, nch: 0 }; });
      var b1 = best(s1); if (b1) return make(1, b1);
      // 2) 両方異なる実在商品の許可属性を最大2つ変更して帯に収める
      var s2 = [];
      others.filter(function (p) { return diffBoth(p.v) && nr(p.v); }).forEach(function (p) {
        var combos = [];
        modAttrs.forEach(function (a) { combos.push([a]); });
        for (var i = 0; i < modAttrs.length; i++) for (var j = i + 1; j < modAttrs.length; j++) combos.push([modAttrs[i], modAttrs[j]]);
        combos.forEach(function (c) {
          var lists = c.map(function (a) {
            var cur = E.classOf(def, a, p.v[a]), out = [];
            for (var l = 0; l < def.nlev[a]; l++) if (l !== cur) out.push(l);
            return out;
          });
          var enumerate = function (idx, acc) {
            if (idx === c.length) {
              var v2 = {}; Object.keys(p.v).forEach(function (k) { v2[k] = p.v[k]; });
              var mods = {};
              c.forEach(function (a, n) { v2[a] = acc[n]; mods[a] = acc[n]; });
              var u2 = E.productUtility(def, lu, v2);
              if (u2 < uCap - EPS && tradeoff(v2) && inBand(u2)) s2.push({ p: p, u: u2, mods: mods, nch: c.length });
              return;
            }
            lists[idx].forEach(function (l) { enumerate(idx + 1, acc.concat([l])); });
          };
          enumerate(0, []);
        });
      });
      var b2 = best(s2); if (b2) return make(2, b2);
      return null;
    }
    var b;
    // 1)(2) トップ2属性が両方ともA0と水準が異なり、トレードオフがあり、効用が0.7に近い基準財（A0に近づける処理はしない）
    var rb2 = stepBoth(false); if (rb2) return rb2;

    // 3) 共有1：重視度の高い方のtop2属性だけ異なる実在商品で、帯内
    var share1 = others.filter(function (p) { return !sameClass(def, top2[0], p.v, A.v) && sameClass(def, top2[1], p.v, A.v); })
      .map(function (p) { return { p: p, u: ev.byId[String(p.id)].u, nch: 0 }; });
    b = best(share1.filter(function (it) { return inBand(it.u); })); if (b) return make(3, b);

    // 4) 共有1の中で0.7に最も近い（帯の外でも）
    b = best(share1); if (b) return make(4, b);

    // 5) どれもなければ、Aより低い実在商品のうち0.7に最も近いもの
    b = best(others.map(function (p) { return { p: p, u: ev.byId[String(p.id)].u, nch: 0 }; })); if (b) return make(5, b);
    return null;
  }

  // 水準変更の表示用上書き（site4の表示キー → 表示文字列）
  function modsToOverrides(def, mods) {
    var o = {};
    Object.keys(mods || {}).forEach(function (a) {
      var key = def.toSite4[a];
      var lab = (def.dispLabels[a] || def.labels[a])[mods[a]];
      if (key && lab !== undefined) o[key] = lab;
    });
    return o;
  }

  // A'：候補プールから n 個選ぶ。top2 の表示値をAと同じにして、効用がA未満かつSQ超になるものを優先
  function makeAprime(def, lu, A, SQ, sqU, top2, candidates, n, rng) {
    var uA = E.productUtility(def, lu, A.v);
    var rows = candidates.filter(function (p) { return p.id !== A.id && p.id !== SQ.id; }).map(function (p) {
      var v2 = {}; Object.keys(p.v).forEach(function (k) { v2[k] = p.v[k]; });
      top2.forEach(function (a) { v2[a] = A.v[a]; });
      var u2 = E.productUtility(def, lu, v2);
      return { p: p, u: u2, ok: (u2 < uA - EPS && u2 > sqU + EPS), underA: (u2 < uA - EPS) };
    });
    var good = shuffle(rows.filter(function (x) { return x.ok; }), rng);
    var pick = good.slice(0, n);
    if (pick.length < n) { // 不足分：Aを超えない中でSQに近い(効用が高い)ものから補う
      var more = rows.filter(function (x) { return !x.ok && x.underA; }).sort(function (a, b) { return b.u - a.u; });
      pick = pick.concat(more.slice(0, n - pick.length));
    }
    var disp = {};
    top2.forEach(function (a) { var k = def.toSite4[a]; if (k) disp[k] = A.attrs[k]; });
    return pick.map(function (x) { return { id: x.p.id, overrides: disp, u: x.u, ok: x.ok }; });
  }

  // 被験者ごとの初期セットアップ（A0, 各スライドのA, top2, SQ, 予備財）
  var N_SLIDES = SIZES.length;   // Aは提示数(5/10/15/20)ごとに1つ＝上位4商品。1回目と2回目の同じ提示数では同じA
  function setup(good, def, lu, pool, rng) {
    var ev = evalPool(def, lu, pool);
    var A0 = pickA(pool, ev);
    var top2 = pickTop2(def, lu, pool);
    // 効用の高い順に上位4個 = 提示数ごとのA候補（同点はプール内の順）
    var order = pool.map(function (p, i) { return { p: p, u: ev.u[i], i: i }; })
      .sort(function (x, y) { return (y.u - x.u) || (x.i - y.i); });
    var nA = Math.min(N_SLIDES, pool.length - 1);
    var top = order.slice(0, nA);
    var ceilU = top[nA - 1].u;
    var s = pickSQ(def, lu, pool, ev, A0, top2, rng, ceilU);
    var ranked = top.map(function (x, k) {
      return { p: x.p, rank: k + 1, u: x.u, norm: (x.u - ev.min) / ev.span };
    });
    var As = shuffle(ranked, rng); // As[k] = SIZES[k]（5/10/15/20）の提示数のA。ランダムな割り当て
    var aIds = ranked.map(function (x) { return String(x.p.id); });
    var excl = RESERVE_EXCLUDE[good] || [];
    var resCand = pool.filter(function (p) {
      return p.round === 1 && typeof p.id === 'number' && p.id <= 21 && excl.indexOf(p.id) === -1 &&
             aIds.indexOf(String(p.id)) === -1 && p.id !== s.sq.id;
    });
    var reserve = shuffle(resCand, rng).slice(0, RESERVE_N);
    return { ev: ev, A: A0, As: As, aIds: aIds, top2: top2, sq: s, reserve: reserve };
  }

  // 各スライドの構成。提示数 size のA = st.As[SIZES.indexOf(size)]（CO1とCO2で同じ）
  //   round=1: A + 1回目プールからランダム（A'なし）
  //   round=2: A + A' + 2回目プール（+予備財）からランダム
  //   そのAより効用の高い商品・他スライドのA・SQは出さない。足りなければ反対側のプールから借りる
  function composeSlide(def, lu, pool, st, round, size, rng, slideIdx) {
    var ak = st.As[Math.max(0, SIZES.indexOf(size)) % st.As.length];
    var A = ak.p, SQ = st.sq.sq;
    var reserveIds = st.reserve.map(function (p) { return String(p.id); });
    function allowed(p) {
      if (String(p.id) === String(A.id) || String(p.id) === String(SQ.id)) return false;
      if (st.aIds.indexOf(String(p.id)) !== -1) return false;
      return st.ev.byId[String(p.id)].u < ak.u - EPS;
    }
    var avail = pool.filter(function (p) {
      if (!allowed(p)) return false;
      if (round === 1) return p.round === 1 && reserveIds.indexOf(String(p.id)) === -1;
      return p.round === 2 || reserveIds.indexOf(String(p.id)) !== -1;
    });
    var aprime = [];
    var chosen = [];
    if (round === 2) {
      aprime = makeAprime(def, lu, A, SQ, st.sq.u, st.top2, avail, APRIME_COUNT[size], rng);
      var apIds = aprime.map(function (x) { return String(x.id); });
      chosen = aprime.map(function (x) { return avail.filter(function (p) { return String(p.id) === String(x.id); })[0]; });
      avail = avail.filter(function (p) { return apIds.indexOf(String(p.id)) === -1; });
    }
    var need = size - 1 - chosen.length;
    var fill = shuffle(avail, rng).slice(0, need);
    var borrowed = [];
    if (fill.length < need) { // 不足分：反対側のプールから借りる（予備財は1回目に使わない）
      var used = {};
      chosen.concat(fill).forEach(function (p) { used[String(p.id)] = 1; });
      var extra = pool.filter(function (p) {
        if (!allowed(p) || used[String(p.id)]) return false;
        if (round === 1) return p.round === 2;
        return p.round === 1 && reserveIds.indexOf(String(p.id)) === -1;
      });
      borrowed = shuffle(extra, rng).slice(0, need - fill.length);
      fill = fill.concat(borrowed);
    }
    var items = shuffle(chosen.concat(fill).map(function (p) {
      var ap = aprime.filter(function (x) { return String(x.id) === String(p.id); })[0];
      // u：画面に出る商品の推定効用（A'は表示値をAに揃えた後の効用）
      return { p: p, overrides: ap ? ap.overrides : null, isAprime: !!ap, apOk: ap ? ap.ok : null,
               u: ap ? ap.u : st.ev.byId[String(p.id)].u };
    }).concat([{ p: A, overrides: null, isAprime: false, isA: true, u: ak.u }]), rng);
    return { items: items, aprime: aprime, A: A, aInfo: ak, borrowedIds: borrowed.map(function (p) { return String(p.id); }) };
  }

  var api = {
    SIZES: SIZES, APRIME_COUNT: APRIME_COUNT, NEAR_MAX: NEAR_MAX, N_SLIDES: N_SLIDES, TARGET: TARGET, BAND: BAND, shuffle: shuffle,
    buildPool: buildPool, evalPool: evalPool, constantAttrs: constantAttrs, pickTop2: pickTop2, pickA: pickA,
    pickSQ: pickSQ, modsToOverrides: modsToOverrides, makeAprime: makeAprime, setup: setup, composeSlide: composeSlide
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CODesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
