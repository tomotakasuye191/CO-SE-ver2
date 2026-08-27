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
      effect: {
        type: 'category', rules: [
          { test: contains('集中力'), level: 0 },
          { test: contains('睡眠'), level: 1 },
          { test: contains('特にない'), level: 2 }
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

  global.Round2Levels = {
    getLevelIndex: getLevelIndex,
    utilFor: utilFor
  };

})(window);
