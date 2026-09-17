/* =========================================================================
   round2_levels.js
   -------------------------------------------------------------------------
   サイト2（コンジョイント分析）で算出した「重要視2項目・水準別効用値」を使い、
   サイト4のラウンド2で提示する実商品（products_round2.js）が、コンジョイントの
   3水準（または2水準）のどれに相当するかを判定するための対応表・関数群。

   この結果をもとに、site4/index.html 側で
     スコア = 効用[item1の水準] + 効用[item2の水準]
   を候補ごとに計算し、スコア最大の財を「次点に好ましい財」（ラウンド2の新アンカー）
   として選ぶ。

   水準に対応しない値（対応表に無いカテゴリ値など）は null を返し、
   呼び出し側でその属性の寄与を0として扱う（=もう一方の重要属性だけで判定する）。
   ========================================================================= */
(function (global) {

  // ---- ユーティリティ ----------------------------------------------------

  // 文字列から最初に出てくる数値（小数可）を取り出す。無ければ null。
  function firstNumber(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return raw;
    var m = String(raw).match(/[\d]+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  // 数値を、参照水準配列 ref の中で最も近いものの index に丸める（最近傍）。
  function nearestLevel(value, ref) {
    if (value == null) return null;
    var bestIdx = 0, bestDiff = Infinity;
    for (var i = 0; i < ref.length; i++) {
      var diff = Math.abs(value - ref[i]);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    return bestIdx;
  }

  // カテゴリ値を、[{test:(raw)=>bool, level:n}, ...] の定義順に照合し、
  // 最初に一致した level を返す。どれにも一致しなければ null。
  function matchCategory(raw, rules) {
    if (raw == null) return null;
    var s = String(raw);
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].test(s)) return rules[i].level;
    }
    return null;
  }

  function contains(sub) {
    return function (s) { return s.indexOf(sub) !== -1; };
  }

  // ---- 財ごとの属性定義 ---------------------------------------------------
  // キーは products.js / products_round2.js の attrs のキー名（サイト4の item1/item2 と同じ）。
  // type: 'numeric'   -> parse: 生の値から数値を取り出す関数、ref: 3(or2)水準の参照値配列
  // type: 'category'  -> rules: matchCategory用ルール配列（LEVEL_LABELSの並び順=水準0,1,2...）

  var DEFS = {

    wine: {
      price: { type: 'numeric', parse: firstNumber, ref: [2000, 5000, 10000] },
      origin: {
        type: 'category', rules: [
          { test: contains('ボルドー'), level: 0 },
          { test: contains('ブルゴーニュ'), level: 1 },
          { test: contains('ナパ'), level: 2 }, // 「ナパ・ヴァレー」を含むもの
          // 「新世界」グループとしてナパ・ヴァレー水準に寄せる
          { test: contains('カリフォルニア'), level: 2 },
          { test: contains('オーストラリア'), level: 2 }
          // ピエモンテ・トスカーナ（伊）、ロワール（仏）はどの水準の性格とも
          // 異なるため、意図的にグルーピングせずNULL（効用0）のままとする
        ]
      },
      abv: { type: 'numeric', parse: firstNumber, ref: [11, 14, 17] },
      color: {
        type: 'category', rules: [
          { test: contains('赤'), level: 0 },
          { test: contains('白'), level: 1 }
        ]
      },
      taste: {
        type: 'category', rules: [
          { test: contains('辛口'), level: 0 },
          { test: contains('甘口'), level: 1 }
        ]
      }
    },

    rice: {
      price: { type: 'numeric', parse: firstNumber, ref: [2500, 4000, 5500] },
      origin: {
        type: 'category', rules: [
          // 中部地方（新潟県産グループ）
          { test: contains('新潟'), level: 0 },
          { test: contains('富山'), level: 0 },
          { test: contains('石川'), level: 0 },
          { test: contains('福井'), level: 0 },
          { test: contains('山梨'), level: 0 },
          { test: contains('長野'), level: 0 },
          { test: contains('岐阜'), level: 0 },
          { test: contains('静岡'), level: 0 },
          { test: contains('愛知'), level: 0 },
          // 北海道・東北地方（北海道産グループ）
          { test: contains('北海道'), level: 1 },
          { test: contains('青森'), level: 1 },
          { test: contains('岩手'), level: 1 },
          { test: contains('宮城'), level: 1 },
          { test: contains('秋田'), level: 1 },
          { test: contains('山形'), level: 1 },
          { test: contains('福島'), level: 1 },
          // 近畿・中国・四国・九州・沖縄地方（熊本県産グループ）
          { test: contains('三重'), level: 2 },
          { test: contains('滋賀'), level: 2 },
          { test: contains('京都'), level: 2 },
          { test: contains('大阪'), level: 2 },
          { test: contains('兵庫'), level: 2 },
          { test: contains('奈良'), level: 2 },
          { test: contains('和歌山'), level: 2 },
          { test: contains('鳥取'), level: 2 },
          { test: contains('島根'), level: 2 },
          { test: contains('岡山'), level: 2 },
          { test: contains('広島'), level: 2 },
          { test: contains('山口'), level: 2 },
          { test: contains('徳島'), level: 2 },
          { test: contains('香川'), level: 2 },
          { test: contains('愛媛'), level: 2 },
          { test: contains('高知'), level: 2 },
          { test: contains('福岡'), level: 2 },
          { test: contains('佐賀'), level: 2 },
          { test: contains('長崎'), level: 2 },
          { test: contains('熊本'), level: 2 },
          { test: contains('大分'), level: 2 },
          { test: contains('宮崎'), level: 2 },
          { test: contains('鹿児島'), level: 2 },
          { test: contains('沖縄'), level: 2 }
          // ※関東地方（茨城・栃木・群馬・埼玉・千葉・東京・神奈川）は現行データに
          //   登場しないため未定義。登場した場合はNULL（効用0）扱いとなる。
        ]
      },
      volume: { type: 'numeric', parse: firstNumber, ref: [2, 5, 10] }, // kg換算前提（"5kg"→5）
      harvest: {
        type: 'category', rules: [
          // 「古古米」は「古米」を含むため、先に判定する
          { test: contains('古古米'), level: 2 },
          { test: contains('新米'), level: 0 },
          { test: contains('古米'), level: 1 }
        ]
      },
      polish: {
        type: 'category', rules: [
          { test: contains('白米'), level: 0 },
          { test: contains('玄米'), level: 1 },
          { test: contains('無洗米'), level: 2 }
        ]
      }
    },

    yogurt: {
      price: { type: 'numeric', parse: firstNumber, ref: [100, 200, 300] },
      volume: { type: 'numeric', parse: firstNumber, ref: [100, 200, 400] }, // g換算前提
      expiry: { type: 'numeric', parse: firstNumber, ref: [14, 17, 20] },    // 日数
      nutrition: {
        type: 'category', rules: [
          // 「たんぱく質」「脂質」「炭水化物」の3項目すべて記載 → 水準2（フル表示）
          { test: function (s) { return s.indexOf('たんぱく質') !== -1 && s.indexOf('脂質') !== -1 && s.indexOf('炭水化物') !== -1; }, level: 2 },
          // たんぱく質のみの記載 → 水準1
          { test: contains('たんぱく質'), level: 1 },
          // 何も記載が無い → 水準0（実商品データでは基本的に発生しない想定）
          { test: function () { return true; }, level: 0 }
        ]
      },
      calorie: { type: 'numeric', parse: firstNumber, ref: [60, 90, 120] } // kcal数値のみで判定（表示基準の違いは無視）
    },

    chocolate: {
      price: { type: 'numeric', parse: firstNumber, ref: [100, 200, 300] },
      cacao_percent: { type: 'numeric', parse: firstNumber, ref: [30, 50, 70] },
      trait: {
        type: 'category', rules: [
          { test: contains('集中力'), level: 0 },
          { test: contains('睡眠'), level: 1 },
          { test: contains('効果なし'), level: 2 }
        ]
      },
      calorie: { type: 'numeric', parse: firstNumber, ref: [150, 250, 350] }, // kcal数値のみで判定
      fairtrade: {
        type: 'category', rules: [
          { test: contains('無'), level: 0 },
          { test: contains('有'), level: 1 }
        ]
      }
    }
  };

  // ---- 各水準の代表値（「合理的裁量財」を作る際の上書き値として使う） --------
  // コンジョイント（site2）で提示している水準の文言・数値をそのまま採用する。
  // 数値属性は DEFS[good][key].ref をそのまま使えるので、ここではカテゴリ属性のみ定義する。
  var LEVEL_VALUES = {
    wine: {
      origin: ["ボルドー", "ブルゴーニュ", "ナパ・ヴァレー"],
      color:  ["赤", "白"],
      taste:  ["辛口", "甘口"]
    },
    rice: {
      origin:   ["新潟県産", "北海道産", "熊本県産"],
      harvest:  ["新米", "古米", "古古米"],
      polish:   ["白米", "玄米", "無洗米"]
    },
    yogurt: {
      nutrition: ["栄養成分表示なし", "たんぱく質のみ表示", "たんぱく質／脂質／炭水化物表示"]
    },
    chocolate: {
      trait:     ["集中力が上がる", "睡眠を助ける", "効果なし"],
      fairtrade: ["無", "有"]
    }
  };

  // good, key, level(0始まり) から、その水準を表す「上書き用の代表値」を返す（カテゴリ属性用）。
  function representativeValue(good, key, level) {
    var def = DEFS[good] && DEFS[good][key];
    if (!def) return null;
    if (def.type === 'numeric') {
      return (def.ref && def.ref[level] != null) ? def.ref[level] : null;
    }
    var cat = LEVEL_VALUES[good] && LEVEL_VALUES[good][key];
    return (cat && cat[level] != null) ? cat[level] : null;
  }

  // utils配列（水準別効用値）から、最も効用が高い水準indexとその効用値を返す。
  function bestLevelOf(utils) {
    if (!utils || !utils.length) return { level: null, utility: -Infinity };
    var bestIdx = 0, bestVal = -Infinity;
    for (var i = 0; i < utils.length; i++) {
      if (utils[i] > bestVal) { bestVal = utils[i]; bestIdx = i; }
    }
    return { level: bestIdx, utility: bestVal };
  }

  // 数値属性について、水準の並びの中で「一番良い水準」が端(最初/最後)にあるかどうかで
  // 「小さいほど良い(asc)」「大きいほど良い(desc)」を判定する。真ん中の水準がベストな場合は
  // 方向を決められないので null（この場合は水準の代表値をそのまま使うしかない）。
  function directionOf(ref, bestLevelIdx) {
    if (bestLevelIdx === 0) return 'asc';
    if (bestLevelIdx === ref.length - 1) return 'desc';
    return null;
  }

  // 数値属性の「合理的裁量財」用の上書き値を決める。
  // 単純に水準の代表値を使うのではなく、基準財の実際の値と水準の代表値を比べて
  // 被験者にとってより有利な方を基準に、そこからさらに20%踏み込んだ値にする。
  // これにより「基準財が既に水準の代表値より良い実際の値を持っている」場合でも、
  // 必ず基準財の実際の値より良い数値になることを保証する。
  function numericOverrideValue(good, key, bestLevelIdx, baseRawValue) {
    var def = DEFS[good][key];
    var ref = def.ref;
    var refBest = ref[bestLevelIdx];
    var baseNum = (baseRawValue != null) ? def.parse(baseRawValue) : null;
    var dir = directionOf(ref, bestLevelIdx);
    if (dir === 'asc') { // 小さいほど良い
      var floor = (baseNum != null) ? Math.min(refBest, baseNum) : refBest;
      return floor * 0.8;
    }
    if (dir === 'desc') { // 大きいほど良い
      var ceil = (baseNum != null) ? Math.max(refBest, baseNum) : refBest;
      return ceil * 1.2;
    }
    return refBest; // 真ん中の水準がベスト：方向が決められないので代表値のまま
  }

  // ---- メイン関数 ----------------------------------------------------------

  // good: 'wine' 等, key: attrsのキー名（例:'price'）, rawValue: product.attrs[key]
  // 戻り値: 水準index（0始まり）または null（対応なし）
  function getLevelIndex(good, key, rawValue) {
    var def = DEFS[good] && DEFS[good][key];
    if (!def) return null;
    if (def.type === 'numeric') {
      var num = def.parse(rawValue);
      return nearestLevel(num, def.ref);
    }
    if (def.type === 'category') {
      return matchCategory(rawValue, def.rules);
    }
    return null;
  }

  // product: {attrs:{...}} , key: 属性キー, utils: 水準別効用値の配列
  // 対応する水準が無ければ0を返す（その属性はスコアに影響しない）
  function utilFor(good, product, key, utils) {
    if (!utils || !key) return 0;
    var lvl = getLevelIndex(good, key, product.attrs ? product.attrs[key] : undefined);
    if (lvl == null || utils[lvl] == null) return 0;
    return utils[lvl];
  }

  // 「基準財より合理的に必ず好ましいはずの財（合理的裁量財）」を組み立てるための
  // 理論上の最良スコア・水準・上書き値をまとめて返す。
  // baseItem を渡すことで、数値属性は「基準財の実際の値」も踏まえて上書き値を決める。
  function idealProfile(good, item1, item2, u1, u2, baseItem) {
    var b1 = bestLevelOf(u1);
    var b2 = bestLevelOf(u2);
    var def1 = DEFS[good][item1];
    var def2 = DEFS[good][item2];
    var item1Value = null, item2Value = null;
    if (b1.level != null) {
      item1Value = (def1 && def1.type === 'numeric')
        ? numericOverrideValue(good, item1, b1.level, baseItem ? baseItem.attrs[item1] : null)
        : representativeValue(good, item1, b1.level);
    }
    if (b2.level != null) {
      item2Value = (def2 && def2.type === 'numeric')
        ? numericOverrideValue(good, item2, b2.level, baseItem ? baseItem.attrs[item2] : null)
        : representativeValue(good, item2, b2.level);
    }
    return {
      idealScore: (b1.utility === -Infinity ? 0 : b1.utility) + (b2.utility === -Infinity ? 0 : b2.utility),
      item1Level: b1.level,
      item2Level: b2.level,
      item1Value: item1Value,
      item2Value: item2Value
    };
  }

  // 属性1つについて、水準の効用に「ごく小さな実値による補正」を加えたスコアを返す。
  // 同じ水準内であっても、実際の値がより良い方向であれば、ほんの僅かにスコアが高くなる。
  // これにより「同じ水準に丸められるので見かけ上は同点」という問題を避け、
  // 実際の数値で見て基準財より優れているかどうかを正しく判定できるようにする。
  function attrScoreWithTiebreak(good, key, u, rawValue) {
    var lvl = getLevelIndex(good, key, rawValue);
    var util = (lvl != null && u[lvl] != null) ? u[lvl] : 0;
    var def = DEFS[good][key];
    if (def && def.type === 'numeric') {
      var best = bestLevelOf(u);
      var dir = directionOf(def.ref, best.level);
      var num = def.parse(rawValue);
      if (num != null && dir === 'asc') util += -num * 1e-6;
      if (num != null && dir === 'desc') util += num * 1e-6;
    }
    return util;
  }

  function totalScoreWithTiebreak(good, item1, item2, u1, u2, rawItem1Value, rawItem2Value) {
    return attrScoreWithTiebreak(good, item1, u1, rawItem1Value) +
           attrScoreWithTiebreak(good, item2, u2, rawItem2Value);
  }

  // utils配列の中で、最も効用が低い水準indexを返す（弱める上書き先を決めるのに使う）
  function worstLevelOf(utils) {
    if (!utils || !utils.length) return null;
    var worstIdx = 0, worstVal = Infinity;
    for (var i = 0; i < utils.length; i++) {
      if (utils[i] < worstVal) { worstVal = utils[i]; worstIdx = i; }
    }
    return worstIdx;
  }

  // ある財の item1/item2 のどちらかを「基準財より明確に劣る値」に上書きし、
  // 基準財に対する優位性を確実に消すための上書き値を1つ返す（キーと値のペア）。
  // 数値属性なら基準財の実値より一歩悪い値、カテゴリ属性なら最も効用の低い水準の代表値にする。
  function weakenOneAttr(good, key, u, baseItem) {
    var def = DEFS[good][key];
    if (!def) return null;
    if (def.type === 'numeric') {
      var best = bestLevelOf(u);
      var dir = directionOf(def.ref, best.level);
      var baseNum = def.parse(baseItem.attrs[key]);
      // 数値属性は、弱めた財どうしが同じ値に揃ってしまわないよう、
      // 「基準財より確実に悪い」範囲(8%〜25%)の中でランダムに幅を持たせる。
      var margin = 0.08 + Math.random() * 0.17; // 0.08〜0.25
      if (baseNum != null && dir === 'asc') return baseNum * (1 + margin);  // 小さいほど良い→基準財より大きくする
      if (baseNum != null && dir === 'desc') return baseNum * (1 - margin); // 大きいほど良い→基準財より小さくする
      var w = worstLevelOf(u);
      return w != null ? representativeValue(good, key, w) : baseNum;
    }
    // カテゴリ属性（産地など）は水準の代表値しか選べないため、最も効用の低い水準に統一する
    var w2 = worstLevelOf(u);
    return w2 != null ? representativeValue(good, key, w2) : null;
  }

  // 「基準財より合理的に必ず好ましいはずの財（合理的裁量財）」を求める。
  //
  // good: 財名, item1/item2: 重要視2項目（product属性キー）, u1/u2: 各水準の効用値配列,
  // baseItem: 基準財, pool: その回で使う商品プール全体（round1Pool または products_round2.js の20財）,
  // presented: 実際に画面に提示する候補配列（この中の1枠を差し替える。総数は変えない）,
  // protectedIds: 差し替え対象から除外したいID（アンカーや似せ候補など、他の仕組みと衝突させたくない場合に指定）
  //
  // 戻り値：
  //   null                      → 基準財の方が理論値より明確に優れている(通常発生しない)ので何もしない
  //   { id, name, overridden, replace, replaceIndex, overrides?, weakened }
  //     overridden: true なら、presented[replaceIndex] の item1/item2 の表示値を
  //                 overrides の値に書き換えることで「合理的裁量財」を作り出す
  //     replace: true なら、presented[replaceIndex] を replaceWith（プール内の実財）に
  //              まるごと差し替える
  //     replace/overridden いずれも false なら、presented内に既に該当財があるので何もしなくてよい
  //     weakened: {財ID: {属性キー: 上書き値}} - 基準財より優れてしまっている他の候補財を
  //               弱めるための上書き。「必ず1つだけ」を守るために使う。
  function findMandatoryItem(good, item1, item2, u1, u2, baseItem, pool, presented, protectedIds) {
    var ideal = idealProfile(good, item1, item2, u1, u2, baseItem);

    function totalScore(p) {
      return totalScoreWithTiebreak(good, item1, item2, u1, u2, p.attrs[item1], p.attrs[item2]);
    }
    var baseScore = totalScore(baseItem);
    // 理想の上書き値そのものを使って理論上の最良スコアを計算する
    // （数値属性は基準財の実値も踏まえて押し込んだ値になっているため、
    //   基準財と同水準でも必ずbaseScoreを上回る）
    var idealScore = attrScoreWithTiebreak(good, item1, u1, ideal.item1Value) +
                      attrScoreWithTiebreak(good, item2, u2, ideal.item2Value);
    if (idealScore < baseScore - 1e-9) return null; // 通常発生しない安全ガード

    // 基準財より明確に優れた財を理論上作れる場合のみ「必ず1つだけ」ルールを適用する
    // （両属性ともカテゴリで基準財が既に最良＝同点しか作れない場合は、複数の同点を許容する）
    var strictlyBetterExists = idealScore > baseScore + 1e-9;

    function beatsBase(p) { return totalScore(p) > baseScore + 1e-9; }
    function tiesOrBeatsBase(p) { return totalScore(p) >= baseScore - 1e-9; }
    function qualifies(p) { return strictlyBetterExists ? beatsBase(p) : tiesOrBeatsBase(p); }

    var protectedSet = {};
    (protectedIds || []).forEach(function (id) { protectedSet[String(id)] = true; });

    // 似せる財(commonSet等)やこれから選ぶ合理的裁量財以外で、既に基準財を上回って
    // しまっている候補を洗い出し、弱める上書きを1属性だけ加えて優位性を消す。
    function weakenDuplicates(mandatoryIdStr, currentPresented) {
      var weakened = {};
      if (!strictlyBetterExists) return weakened;
      currentPresented.forEach(function (p) {
        if (protectedSet[String(p.id)]) return;
        if (String(p.id) === mandatoryIdStr) return;
        if (!beatsBase(p)) return;
        var def1 = DEFS[good][item1];
        var key = (def1 && def1.type === 'numeric') ? item1 : item2;
        var val = weakenOneAttr(good, key, (key === item1 ? u1 : u2), baseItem);
        var ov = {};
        ov[key] = val;
        weakened[p.id] = ov;
      });
      return weakened;
    }

    // 差し替え可能な枠（保護されていない枠）を選ぶ
    var replaceableIdx = [];
    presented.forEach(function (p, idx) { if (!protectedSet[String(p.id)]) replaceableIdx.push(idx); });
    if (!replaceableIdx.length) {
      presented.forEach(function (p, idx) { replaceableIdx.push(idx); }); // 全滅時のフォールバック
    }
    var replaceIndex = replaceableIdx[Math.floor(Math.random() * replaceableIdx.length)];

    // 実在財で条件を満たせるものがあっても使わず、必ず候補1枠の値を理論上の理想値
    // （＋数値は基準財の実値を踏まえてさらに踏み込んだ値）に書き換えて作り出す
    //    さらに踏み込んだ値）に書き換えて作り出す
    var carrier = presented[replaceIndex];
    var overrides = {};
    if (ideal.item1Value != null) overrides[item1] = ideal.item1Value;
    if (ideal.item2Value != null) overrides[item2] = ideal.item2Value;
    return {
      id: carrier.id, name: carrier.name, overridden: true, replace: false,
      replaceIndex: replaceIndex, overrides: overrides,
      weakened: weakenDuplicates(String(carrier.id), presented)
    };
  }

  global.Round2Levels = {
    getLevelIndex: getLevelIndex,
    utilFor: utilFor,
    idealProfile: idealProfile,
    findMandatoryItem: findMandatoryItem
  };

})(window);
