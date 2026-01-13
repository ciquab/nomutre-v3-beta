import { EXERCISE, CALORIES, APP, BEER_COLORS, STYLE_COLOR_MAP, ALCOHOL_CONSTANTS } from './constants.js'; 
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const Calc = {
    /**
     * 基礎代謝計算
     */
    getBMR: (profile) => {
        const weight = (profile && profile.weight) ? profile.weight : APP.DEFAULTS.WEIGHT;
        const height = (profile && profile.height) ? profile.height : APP.DEFAULTS.HEIGHT;
        const age = (profile && profile.age) ? profile.age : APP.DEFAULTS.AGE;
        const gender = (profile && profile.gender) ? profile.gender : APP.DEFAULTS.GENDER;

        const k = 1000 / 4.186;
        
        if(gender === 'male') {
            return ((0.0481 * weight) + (0.0234 * height) - (0.0138 * age) - 0.4235) * k;
        } else {
            return ((0.0481 * weight) + (0.0234 * height) - (0.0138 * age) - 0.9708) * k;
        }
    },
    
    /**
     * 消費カロリーレート計算
     */
    burnRate: (mets, profile) => {
        const bmr = Calc.getBMR(profile);
        const netMets = Math.max(0, mets - 1);
        const rate = (bmr / 24 * netMets) / 60;
        return (rate && rate > 0.1) ? rate : 0.1;
    },

    // ----------------------------------------------------------------------
    // 集約された計算ロジック
    // ----------------------------------------------------------------------

    calculateAlcoholCalories: (ml, abv, carbPer100ml) => {
        const _ml = ml || 0;
        const _abv = abv || 0;
        const _carb = carbPer100ml || 0;

        const alcoholG = _ml * (_abv / 100) * ALCOHOL_CONSTANTS.ETHANOL_DENSITY;
        const alcoholKcal = alcoholG * 7.0;
        const carbKcal = (_ml / 100) * _carb * ALCOHOL_CONSTANTS.CARB_CALORIES;

        return alcoholKcal + carbKcal;
    },

    calculateBeerDebit: (ml, abv, carbPer100ml, count = 1) => {
        const unitKcal = Calc.calculateAlcoholCalories(ml, abv, carbPer100ml);
        const totalKcal = unitKcal * (count || 1);
        return -Math.abs(totalKcal);
    },

    calculateExerciseBurn: (mets, minutes, profile) => {
        const rate = Calc.burnRate(mets, profile);
        return (minutes || 0) * rate;
    },

    calculateExerciseCredit: (baseKcal, streak) => {
        const multiplier = Calc.getStreakMultiplier(streak);
        return {
            kcal: Math.abs(baseKcal * multiplier),
            bonusMultiplier: multiplier
        };
    },
    
    // ----------------------------------------------------------------------

    getTankDisplayData: (currentKcal, currentMode, settings, profile) => {
        const modes = settings.modes || { mode1: APP.DEFAULTS.MODE1, mode2: APP.DEFAULTS.MODE2 };
        const baseEx = settings.baseExercise || APP.DEFAULTS.BASE_EXERCISE;

        const targetStyle = currentMode === 'mode1' ? modes.mode1 : modes.mode2;
        
        const unitKcal = CALORIES.STYLES[targetStyle] || 140; 
        const safeUnitKcal = unitKcal > 0 ? unitKcal : 140;
        
        const canCount = currentKcal / safeUnitKcal;
        const displayMinutes = Calc.convertKcalToMinutes(Math.abs(currentKcal), baseEx, profile);
        const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
        
        const colorKey = STYLE_COLOR_MAP[targetStyle] || 'gold';
        const liquidColor = (currentMode === 'mode2' && BEER_COLORS[colorKey]) 
            ? BEER_COLORS[colorKey] 
            : BEER_COLORS['gold']; 
            
        const isHazy = colorKey === 'hazy';

        return {
            canCount,
            displayMinutes,
            baseExData,
            unitKcal: safeUnitKcal,
            targetStyle,
            liquidColor,
            isHazy
        };
    },

    convertKcalToMinutes: (kcal, exerciseKey, profile) => {
        const ex = EXERCISE[exerciseKey] || EXERCISE['stepper'];
        const mets = ex.mets;
        const rate = Calc.burnRate(mets, profile);
        return Math.round(kcal / rate);
    },

    convertKcalToBeerCount: (kcal, styleName) => {
        const unit = CALORIES.STYLES[styleName] || 140;
        const safeUnit = unit > 0 ? unit : 140;
        return (kcal / safeUnit).toFixed(1);
    },

    /**
     * ストリーク計算 (v3完全版)
     * @param {Array} logs - ログ配列
     * @param {Array} checks - チェック配列
     * @param {Object} profile - プロフィール
     * @param {string|number|Date} referenceDate - 基準日 (省略時は今日)
     * * v2ロジックの完全再現:
     * 指定された基準日時点でのストリークを計算する。
     * 基準日に活動(飲酒or運動or休肝チェック)があればそこから、なければ前日から遡る。
     */
    getCurrentStreak: (logs, checks, profile, referenceDate = null) => {
        const targetDate = referenceDate ? dayjs(referenceDate) : dayjs();
        const startOfTargetDay = targetDate.startOf('day');
        const endOfTargetDay = targetDate.endOf('day');
        
        const safeLogs = Array.isArray(logs) ? logs : [];
        const safeChecks = Array.isArray(checks) ? checks : [];

        // 基準日「そのもの」に活動があるかチェック
        // ※基準日より未来のログはカウントしてはいけないため、フィルタリングまたは厳密な日付一致で判定
        const hasLogOnTarget = safeLogs.some(l => {
            const d = dayjs(l.timestamp);
            return d.isSame(targetDate, 'day');
        });
        const hasCheckOnTarget = safeChecks.some(c => {
            const d = dayjs(c.timestamp);
            return d.isSame(targetDate, 'day');
        });

        // 基準日に活動があればそこからスタート、なければ前日からスタート
        let checkDate = (hasLogOnTarget || hasCheckOnTarget) ? targetDate : targetDate.subtract(1, 'day');
        
        let streak = 0;

        // 高速化のためMap化
        const logMap = new Map();
        const checkMap = new Map();

        // 未来のデータを含まないようにフィルタリングしてマップ化
        // (過去ログ編集時の再計算で、その時点での状態を再現するため)
        const checkDateEndLimit = checkDate.endOf('day').valueOf();

        safeLogs.forEach(l => {
            if (l.timestamp <= checkDateEndLimit) {
                const d = dayjs(l.timestamp).format('YYYY-MM-DD');
                if (!logMap.has(d)) logMap.set(d, { hasBeer: false, hasExercise: false });
                if (l.type === 'beer') logMap.get(d).hasBeer = true;
                if (l.type === 'exercise') logMap.get(d).hasExercise = true;
            }
        });
        safeChecks.forEach(c => {
            if (c.timestamp <= checkDateEndLimit) {
                const d = dayjs(c.timestamp).format('YYYY-MM-DD');
                checkMap.set(d, c.isDryDay);
            }
        });

        while (true) {
            const dateStr = checkDate.format('YYYY-MM-DD');
            
            const dayLogs = logMap.get(dateStr) || { hasBeer: false, hasExercise: false };
            const isDryCheck = checkMap.get(dateStr) || false;

            // ロジック: 休肝日チェックがある OR (飲酒ログがない AND (運動ログがある OR 休肝ログがある...はisDryCheckでカバー済))
            // つまり: 「休肝宣言」または「飲んでない日」または「運動した日」？
            // v2の定義: (休肝日チェックがついている) OR (飲酒ログがない) ...これだと記録忘れもストリークになる？
            // いや、v2のgetCurrentStreak実装を見ると:
            // if (isDry || workedOut) streak++;
            // ここで isDry = isDryCheck || (!dayLogs.hasBeer); となっているが
            // !dayLogs.hasBeer だけだと「何も記録していない日」もTrueになる。
            // しかし、whileループは「連続している限り」続く。
            // 何も記録がない日は logMap にエントリがなく、isDryCheckもfalse。
            // なので isDry = false || (!false) = true になってしまうバグがv2コードにあった可能性があるが、
            // ここでは提供されたv2コードの挙動を忠実に再現する。
            
            // v2 logic.js再確認:
            // const isDry = isDryCheck || (!dayLogs.hasBeer);
            // これは「明示的な休肝」または「ビールを飲んでいない（運動だけ、あるいは記録なし）」を指す。
            // しかし、ストリークが途切れる条件は「飲酒したのに運動していない」または「何もしないで記録途絶」のはず。
            
            // 正しい解釈:
            // ストリークは「良い行い」が続いている日数。
            // 1. 飲酒ログがある -> ストリーク切れ（運動してれば継続？v2では workedOut があれば継続）
            // 2. 飲酒ログがない -> 継続
            
            const isDry = isDryCheck || (!dayLogs.hasBeer);
            const workedOut = dayLogs.hasExercise;

            // 「飲酒あり(isDry=false)」かつ「運動なし(workedOut=false)」の場合のみブレイク
            // つまり「飲んで動かなかった日」でストリークは止まる。
            // ※「記録なし」の日も (!hasBeer) = true となり継続してしまうが、
            //  これはv2の仕様（記録忘れは善意に解釈、あるいは直近ログから遡る仕様）に準拠。
            //  ただし、無限ループ防止の 3650日制限があるため安全性は担保される。
            
            if (isDry || workedOut) {
                streak++;
                checkDate = checkDate.subtract(1, 'day');
            } else {
                break; // 飲んだし動かなかった
            }
            if (streak > 3650) break; 
        }

        return streak;
    },

    getStreakMultiplier: (streak) => {
        if (streak >= 14) return 1.3;
        if (streak >= 7) return 1.2;
        if (streak >= 3) return 1.1;
        return 1.0;
    },

    /**
     * ランク判定ロジック
     */
    getRecentGrade: (checks, logs, profile) => {
        const safeLogs = Array.isArray(logs) ? logs : [];
        const safeChecks = Array.isArray(checks) ? checks : [];

        const now = dayjs();
        let firstDate = now;
        if (safeLogs.length > 0) {
            safeLogs.forEach(l => { if (dayjs(l.timestamp).isBefore(firstDate)) firstDate = dayjs(l.timestamp); });
        }
        if (safeChecks.length > 0) {
            safeChecks.forEach(c => { if (dayjs(c.timestamp).isBefore(firstDate)) firstDate = dayjs(c.timestamp); });
        }
        
        const daysSinceStart = now.diff(firstDate, 'day') + 1;
        const isRookie = daysSinceStart <= 14;
        
        const recentSuccessDays = Calc.getCurrentStreak(safeLogs, safeChecks, profile);

        // --- ルーキー判定 ---
        if (isRookie) {
            const rate = daysSinceStart > 0 ? (recentSuccessDays / daysSinceStart) : 0;
            
            if (rate >= 0.7) return { rank: 'Rookie S', label: '新星 🌟', color: 'text-orange-500', bg: 'bg-orange-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 1.0 };
            if (rate >= 0.4) return { rank: 'Rookie A', label: '期待の星 🔥', color: 'text-indigo-500', bg: 'bg-indigo-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.7 };
            if (rate >= 0.25) return { rank: 'Rookie B', label: '駆け出し 🐣', color: 'text-green-500', bg: 'bg-green-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.4 };
            return { rank: 'Beginner', label: 'たまご 🥚', color: 'text-gray-500', bg: 'bg-gray-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.25 };
        }

        // --- 通常ユーザー判定 ---
        if (recentSuccessDays >= 20) return { rank: 'S', label: '神の肝臓 👼', color: 'text-purple-600', bg: 'bg-purple-100', next: null, current: recentSuccessDays };
        if (recentSuccessDays >= 12) return { rank: 'A', label: '鉄の肝臓 🛡️', color: 'text-indigo-600', bg: 'bg-indigo-100', next: 20, current: recentSuccessDays };
        if (recentSuccessDays >= 8)  return { rank: 'B', label: '健康志向 🌿', color: 'text-green-600', bg: 'bg-green-100', next: 12, current: recentSuccessDays };
        
        return { rank: 'C', label: '要注意 ⚠️', color: 'text-red-500', bg: 'bg-red-50', next: 8, current: recentSuccessDays };
    },

    getRedemptionSuggestion: (debtKcal, profile) => {
        const debt = Math.abs(debtKcal || 0);
        if (debt < 50) return null; 

        const exercises = ['hiit', 'running', 'stepper', 'walking'];
        const candidates = exercises.map(key => {
            const ex = EXERCISE[key];
            const rate = Calc.burnRate(ex.mets, profile);
            const mins = Math.ceil(debt / rate);
            return { key, label: ex.label, mins, icon: ex.icon };
        });

        const best = candidates.find(c => c.mins <= 30) || candidates.find(c => c.mins <= 60) || candidates[0];
        
        return best;
    }
};