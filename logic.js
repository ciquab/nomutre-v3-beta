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
        const safeLogs = Array.isArray(logs) ? logs : [];
        const safeChecks = Array.isArray(checks) ? checks : [];

        // 【修正1】データが全くない場合は即座に0を返す
        if (safeLogs.length === 0 && safeChecks.length === 0) {
            return 0;
        }

        // 【修正2】最古の記録日を探す (これ以前はストリークに含めない)
        let minTs = Number.MAX_SAFE_INTEGER;
        let found = false;

        safeLogs.forEach(l => {
            if (l.timestamp < minTs) { minTs = l.timestamp; found = true; }
        });
        safeChecks.forEach(c => {
            if (c.timestamp < minTs) { minTs = c.timestamp; found = true; }
        });

        // データがある場合、その日を「開始日」とする
        const firstDate = found ? dayjs(minTs).startOf('day') : dayjs();

        const targetDate = referenceDate ? dayjs(referenceDate) : dayjs();
        
        // 基準日「そのもの」に活動があるかチェック
        const hasLogOnTarget = safeLogs.some(l => {
            return dayjs(l.timestamp).isSame(targetDate, 'day');
        });
        const hasCheckOnTarget = safeChecks.some(c => {
            return dayjs(c.timestamp).isSame(targetDate, 'day');
        });

        // 基準日に活動があればそこからスタート、なければ前日からスタート
        let checkDate = (hasLogOnTarget || hasCheckOnTarget) ? targetDate : targetDate.subtract(1, 'day');
        
        let streak = 0;

        // 高速化のためMap化
        const logMap = new Map();
        const checkMap = new Map();
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
            // 【修正3】チェック日が「最古の記録日」より前になったら終了
            if (checkDate.isBefore(firstDate, 'day')) {
                break;
            }

            const dateStr = checkDate.format('YYYY-MM-DD');
            const dayLogs = logMap.get(dateStr) || { hasBeer: false, hasExercise: false };
            const isDryCheck = checkMap.get(dateStr) || false;

            // ★修正ポイント: 
            // 「今日」の場合は、「記録がない＝休肝日」という見なしルールを適用しない。
            // (まだ一日が終わっておらず、記録していないだけかもしれないため)
            const isToday = checkDate.isSame(dayjs(), 'day');
            
            // 過去の日付なら「ビール記録なし」でOK。今日なら「明示的な休肝チェック」が必要。
            const isPassiveDryAllowed = !isToday; 
            
            const isDry = isDryCheck || (isPassiveDryAllowed && !dayLogs.hasBeer);
            const workedOut = dayLogs.hasExercise;

            if (isDry || workedOut) {
                streak++;
                checkDate = checkDate.subtract(1, 'day');
            } else {
                break; // 飲んだ、または今日で記録がない
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
    },

    // ----------------------------------------------------------------
    // 【追加】 不足していたメソッド
    // ----------------------------------------------------------------

    /**
     * 指定日に飲酒ログがあるか (checkStatus.jsで使用)
     */
    hasAlcoholLog: (logs, timestamp) => {
        const target = dayjs(timestamp);
        return logs.some(l => l.type === 'beer' && dayjs(l.timestamp).isSame(target, 'day'));
    },

    /**
     * 日付ごとのステータス判定 (weekly.js/heatmapで使用)
     */
    getDayStatus: (date, logs, checks, profile) => {
        const d = dayjs(date);
        const dayStart = d.startOf('day').valueOf();
        const dayEnd = d.endOf('day').valueOf();

        const dayLogs = logs.filter(l => l.timestamp >= dayStart && l.timestamp <= dayEnd);
        const dayCheck = checks.find(c => c.timestamp >= dayStart && c.timestamp <= dayEnd);

        const hasBeer = dayLogs.some(l => l.type === 'beer');
        const hasExercise = dayLogs.some(l => l.type === 'exercise');
        const isDryDay = dayCheck ? dayCheck.isDryDay : false;

        // 収支計算 (簡易: ログのkcalが正なら運動、負なら飲酒と想定されるが、ここでは単純にkcalを積算)
        // 運動ログのkcalは正、飲酒ログのkcalは負で保存されている前提
        let balance = 0;
        dayLogs.forEach(l => {
            // kcalが未定義の場合は簡易計算で補完
            const val = l.kcal !== undefined ? l.kcal : (l.type === 'exercise' ? (l.minutes * Calc.burnRate(6.0, profile)) : -150);
            balance += val;
        });

        if (isDryDay) return hasExercise ? 'rest_exercise' : 'rest';
        if (hasBeer) {
            if (hasExercise) {
                // 飲んで運動して、収支がプラス（完済）なら success
                return balance >= 0 ? 'drink_exercise_success' : 'drink_exercise';
            }
            return 'drink';
        }
        if (hasExercise) return 'exercise';
        return 'none';
    }
};