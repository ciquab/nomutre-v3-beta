import { db, Store } from './store.js';
import { Calc } from './logic.js';
import { APP, EXERCISE, STYLE_SPECS, CALORIES, ALCOHOL_CONSTANTS } from './constants.js'; // ALCOHOL_CONSTANTSを追加
import { UI, refreshUI } from './ui/index.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// ローカルヘルパー: アルコールカロリー計算
// logic.jsを変更せずに、constantsのスペックを活かすためにここで計算する
const calculateAlcoholCalories = (ml, abv, carbPer100ml) => {
    // アルコール自体のカロリー: ml * (度数/100) * 比重(0.789) * 7kcal/g
    const alcoholG = ml * (abv / 100) * ALCOHOL_CONSTANTS.ETHANOL_DENSITY;
    const alcoholKcal = alcoholG * 7.0; // アルコールは7kcal/g

    // 糖質のカロリー: (ml / 100) * 糖質量(g/100ml) * 4kcal/g
    const carbKcal = (ml / 100) * carbPer100ml * ALCOHOL_CONSTANTS.CARB_CALORIES;

    return alcoholKcal + carbKcal;
};

export const Service = {
    /**
     * 飲酒ログの追加・更新
     * @param {Object} data - modal.js/getBeerFormData からのデータ
     * @param {number|null} id - 更新時のID (新規ならnull)
     */
    saveBeerLog: async (data, id = null) => {
        const profile = Store.getProfile();
        let name, kcal, abv, carb;
        let sizeLabel = data.size;

        if (data.isCustom) {
            // カスタム入力
            name = data.type === 'dry' ? '蒸留酒 (糖質ゼロ)' : '醸造酒/カクテル';
            abv = data.abv;
            const ml = data.ml;
            
            // 糖質: 蒸留酒は0、醸造酒はビール並(3.0g/100ml)と仮定
            carb = data.type === 'dry' ? 0.0 : 3.0;
            
            // 修正: ローカルの計算関数を使用
            kcal = calculateAlcoholCalories(ml, abv, carb);
            
            // 借金なので負の値にする
            kcal = -Math.abs(kcal);
            
            sizeLabel = `${ml}ml`;
        } else {
            // プリセット選択
            const spec = STYLE_SPECS[data.style] || STYLE_SPECS['Custom'];
            
            // ユーザー指定ABVがあれば優先、なければスペック値
            abv = (data.userAbv !== undefined && !isNaN(data.userAbv)) ? data.userAbv : spec.abv;
            carb = spec.carb;
            
            // プリセットのサイズ (350, 500 etc)
            const sizeMl = parseInt(data.size); 
            
            // 修正: ローカルの計算関数を使用 (1本あたり)
            const unitKcal = calculateAlcoholCalories(sizeMl, abv, carb);
            
            // 本数分
            kcal = -Math.abs(unitKcal * data.count);
            
            name = `${data.style}`;
            // 本数が1以外なら名前に追記
            if (data.count !== 1) name += ` x${data.count}`;
        }

        const logData = {
            timestamp: data.timestamp,
            type: 'beer',
            name: name,
            kcal: kcal, // 負の値 (借金)
            
            // メタデータ
            style: data.isCustom ? 'Custom' : data.style,
            size: data.isCustom ? data.ml : data.size,
            count: data.isCustom ? 1 : data.count,
            abv: abv,
            
            brewery: data.brewery,
            brand: data.brand,
            rating: data.rating,
            memo: data.memo,
            
            // カスタム情報
            isCustom: data.isCustom,
            customType: data.isCustom ? data.type : null,
            rawAmount: data.isCustom ? data.ml : null
        };

        if (id) {
            await db.logs.update(parseInt(id), logData);
            UI.showMessage('📝 記録を更新しました', 'success');
        } else {
            await db.logs.add(logData);
            
            // 演出: カロリーが高い場合は警告、そうでなければ完了
            if (Math.abs(kcal) > 500) {
                UI.showMessage(`🍺 記録完了！ ${Math.round(Math.abs(kcal))}kcalの借金です😱`, 'error');
            } else {
                UI.showMessage('🍺 記録しました！', 'success');
            }
            UI.showConfetti();

            // Untappd連携 (新規時のみ)
            if (data.useUntappd && data.brewery && data.brand) {
                const query = encodeURIComponent(`${data.brewery} ${data.brand}`);
                window.open(`https://untappd.com/search?q=${query}`, '_blank');
            }
        }

        await refreshUI();
    },

    /**
     * 運動ログの追加・更新
     * @param {string} exerciseKey - EXERCISEのキー
     * @param {number} minutes - 運動時間(分)
     * @param {string} dateVal - YYYY-MM-DD
     * @param {boolean} applyBonus - ストリークボーナス適用有無
     * @param {number|null} id - 更新時のID
     */
    saveExerciseLog: async (exerciseKey, minutes, dateVal, applyBonus, id = null) => {
        const profile = Store.getProfile();
        const mets = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].mets : 3.0;
        
        // 修正: logic.jsの burnRate を使用して正しく計算
        const rate = Calc.burnRate(mets, profile);
        let burnKcal = minutes * rate;
        
        let memo = '';
        
        // ボーナス適用計算
        if (applyBonus) {
            const logs = await db.logs.toArray();
            const checks = await db.checks.toArray();
            const streak = Calc.getCurrentStreak(logs, checks, profile);
            const multiplier = Calc.getStreakMultiplier(streak);
            
            if (multiplier > 1.0) {
                burnKcal = burnKcal * multiplier;
                memo = `Streak Bonus x${multiplier.toFixed(1)}`;
            }
        }

        const ts = dayjs(dateVal).startOf('day').add(12, 'hour').valueOf();
        const label = EXERCISE[exerciseKey] ? EXERCISE[exerciseKey].label : '運動';

        const logData = {
            timestamp: ts,
            type: 'exercise',
            name: label,
            kcal: Math.abs(burnKcal), // 正の値 (返済)
            minutes: minutes, // 記録用
            exerciseKey: exerciseKey,
            rawMinutes: minutes,
            memo: memo
        };

        if (id) {
            await db.logs.update(parseInt(id), logData);
            UI.showMessage('📝 運動記録を更新しました', 'success');
        } else {
            await db.logs.add(logData);
            const savedMin = Math.round(minutes);
            UI.showMessage(`🏃‍♀️ ${savedMin}分の運動を記録しました！`, 'success');
            UI.showConfetti();
        }

        await refreshUI();
    },

    /**
     * ログの削除
     */
    deleteLog: async (id) => {
        if (!confirm('この記録を削除しますか？')) return;
        try {
            await db.logs.delete(parseInt(id));
            UI.showMessage('削除しました', 'success');
            await refreshUI();
        } catch (e) {
            console.error(e);
            UI.showMessage('削除に失敗しました', 'error');
        }
    },

    /**
     * ログの一括削除
     */
    bulkDeleteLogs: async (ids) => {
        if (!confirm(`${ids.length}件のデータを削除しますか？`)) return;
        try {
            await db.logs.bulkDelete(ids);
            UI.showMessage(`${ids.length}件削除しました`, 'success');
            await refreshUI();
            UI.toggleSelectAll(); // 選択解除
        } catch (e) {
            console.error(e);
            UI.showMessage('一括削除に失敗しました', 'error');
        }
    },

    /**
     * デイリーチェックの保存
     */
    saveDailyCheck: async (formData) => {
        const ts = dayjs(formData.date).startOf('day').add(12, 'hour').valueOf();
        
        // 既存チェック確認
        const existing = await db.checks.where('timestamp')
            .between(dayjs(ts).startOf('day').valueOf(), dayjs(ts).endOf('day').valueOf())
            .first();

        const data = {
            timestamp: ts,
            isDryDay: formData.isDryDay,
            waistEase: formData.waistEase,
            footLightness: formData.footLightness,
            waterOk: formData.waterOk,
            fiberOk: formData.fiberOk,
            weight: formData.weight
        };

        if (existing) {
            await db.checks.update(existing.id, data);
            UI.showMessage('✅ デイリーチェックを更新しました', 'success');
        } else {
            await db.checks.add(data);
            UI.showMessage('✅ デイリーチェックを記録しました', 'success');
            UI.showConfetti();
        }

        if (formData.weight) {
            localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, formData.weight);
        }

        await refreshUI();
    },

    /**
     * UI表示用の全データ取得
     */
    getAllDataForUI: async () => {
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        return { logs, checks };
    },

    /**
     * ログリスト用データ取得 (ページネーション)
     */
    getLogsWithPagination: async (offset, limit) => {
        const totalCount = await db.logs.count();
        const logs = await db.logs
            .orderBy('timestamp')
            .reverse()
            .offset(offset)
            .limit(limit)
            .toArray();
        return { logs, totalCount };
    }
};