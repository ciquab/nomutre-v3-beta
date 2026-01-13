import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { Store, ExternalApp, db } from './store.js'; // dbはマイグレーション用に一時的に必要
import { Calc } from './logic.js';
import { UI, StateManager, updateBeerSelectOptions, refreshUI, toggleModal } from './ui/index.js';
import { Service } from './service.js';
import { Timer, setTimerSaveHandler } from './timer.js';
import { DataManager } from './dataManager.js';
import { initErrorHandler } from './errorHandler.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* ==========================================================================
   Initialization
   ========================================================================== */

// グローバルエラーハンドリングの初期化
initErrorHandler();

// 編集中のIDを保持する状態変数
let editingLogId = null;
let editingCheckId = null;

/* ==========================================================================
   Event Handlers (UI -> Service/Logic)
   ========================================================================== */

/**
 * 設定保存
 */
const handleSaveSettings = () => {
    const getVal = (id) => document.getElementById(id).value;
    const w = parseFloat(getVal('weight-input'));
    const h = parseFloat(getVal('height-input'));
    const a = parseInt(getVal('age-input'));
    
    if (w > 0 && h > 0 && a > 0) {
        if (w > 300 || h > 300 || a > 150) {
            return UI.showMessage('入力値を確認してください', 'error');
        }

        const keys = APP.STORAGE_KEYS;
        localStorage.setItem(keys.WEIGHT, w);
        localStorage.setItem(keys.HEIGHT, h);
        localStorage.setItem(keys.AGE, a);
        localStorage.setItem(keys.GENDER, getVal('gender-input'));
        localStorage.setItem(keys.MODE1, getVal('setting-mode-1'));
        localStorage.setItem(keys.MODE2, getVal('setting-mode-2'));
        localStorage.setItem(keys.BASE_EXERCISE, getVal('setting-base-exercise'));
        localStorage.setItem(keys.THEME, getVal('theme-input'));
        localStorage.setItem(keys.DEFAULT_RECORD_EXERCISE, getVal('setting-default-record-exercise'));
        
        toggleModal('settings-modal', false);
        
        // UIへ反映
        UI.updateModeSelector();
        updateBeerSelectOptions();
        const recordSelect = document.getElementById('exercise-select');
        if (recordSelect) recordSelect.value = getVal('setting-default-record-exercise');
        
        UI.applyTheme(getVal('theme-input'));
        refreshUI();
        UI.showMessage('設定を保存しました', 'success');
    } else {
        UI.showMessage('すべての項目を正しく入力してください', 'error');
    }
};

/**
 * 飲酒ログ保存 (モーダルより)
 */
const handleBeerSubmit = async (e) => {
    e.preventDefault();
    const inputData = UI.getBeerFormData();
    
    if (!inputData.isValid) {
        return UI.showMessage('入力値を確認してください', 'error');
    }

    // Service層へ委譲
    await Service.saveBeerLog(inputData, editingLogId);

    editingLogId = null;
    toggleModal('beer-modal', false);
    UI.resetBeerForm();

    // Untappd連携
    if (inputData.useUntappd) {
        let term = inputData.brand;
        if (inputData.brewery) term = `${inputData.brewery} ${inputData.brand}`;
        if (!term) term = inputData.style;
        ExternalApp.searchUntappd(term);
    }
};

/**
 * 連続保存 (保存して次へ)
 */
const handleSaveAndNext = async () => {
    const inputData = UI.getBeerFormData();
    if (!inputData.isValid) {
        return UI.showMessage('入力値を確認してください', 'error');
    }

    // Service層へ委譲 (常に新規)
    await Service.saveBeerLog(inputData, null);
    
    // フォームを一部リセットして継続
    UI.resetBeerForm(true); 
};

/**
 * 運動手入力保存
 */
const handleManualExerciseSubmit = async () => {
    const dateVal = document.getElementById('manual-date').value;
    const m = parseFloat(document.getElementById('manual-minutes').value);
    const applyBonus = document.getElementById('manual-apply-bonus').checked;
    const exKey = document.getElementById('exercise-select').value;

    if (!m || m <= 0) return UI.showMessage('正しい時間を入力してください', 'error');

    await Service.saveExerciseLog(exKey, m, dateVal, applyBonus, editingLogId);

    document.getElementById('manual-minutes').value = '';
    toggleModal('manual-exercise-modal', false);
    editingLogId = null;
};

/**
 * デイリーチェック保存
 */
const handleCheckSubmit = async (e) => {
    e.preventDefault();
    const f = document.getElementById('check-form');
    const w = document.getElementById('check-weight').value;
    
    // 体重バリデーション
    let weightVal = null;
    if (w !== '') {
        weightVal = parseFloat(w);
        if (weightVal <= 0) return UI.showMessage('体重は正の数で入力してください', 'error');
    }

    const formData = {
        date: document.getElementById('check-date').value,
        isDryDay: document.getElementById('is-dry-day').checked,
        waistEase: f.elements['waistEase'].checked,
        footLightness: f.elements['footLightness'].checked,
        waterOk: f.elements['waterOk'].checked,
        fiberOk: f.elements['fiberOk'].checked,
        weight: weightVal
    };

    // Serviceへ委譲 (ID管理はService側またはDBクエリで解決)
    await Service.saveDailyCheck(formData);

    toggleModal('check-modal', false);
    document.getElementById('is-dry-day').checked = false;
    document.getElementById('check-weight').value = '';
    document.getElementById('drinking-section').classList.remove('hidden-area');
};

/**
 * SNSシェア (テキスト生成のみUIロジックとして保持)
 */
const handleShare = async () => {
    const { logs, checks } = await Service.getAllDataForUI();
    const profile = Store.getProfile();
    const gradeData = Calc.getRecentGrade(checks, logs, profile);
    const streak = Calc.getCurrentStreak(logs, checks, profile);
    const baseEx = Store.getBaseExercise();
    const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];

    const totalKcal = logs.reduce((sum, l) => {
        const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0, profile));
        return sum + val;
    }, 0);

    const mode1 = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
    const beerCount = Calc.convertKcalToBeerCount(Math.abs(totalKcal), mode1);
    const balanceMinutes = Calc.convertKcalToMinutes(Math.abs(totalKcal), baseEx, profile);

    const statusText = totalKcal >= 0
        ? `貯金: ${mode1}${beerCount}本分を返済！🍺`
        : `借金: ${mode1}${beerCount}本分が残ってます…🍺`;

    const text = `現在: ${gradeData.label} (${gradeData.rank})
| 連続: ${streak}日🔥
| ${statusText}
（${baseExData.label}${balanceMinutes}分換算）
#ノムトレ #飲んだら動く`;

    shareToSocial(text);
};

const handleDetailShare = async () => {
    const modal = document.getElementById('log-detail-modal');
    if (!modal || !modal.dataset.id) return;
    
    // 詳細データはUIからではなくDBから再取得が安全
    const logs = await db.logs.toArray(); // Service経由でも良いが単件取得メソッドがないため
    const log = logs.find(l => l.id === parseInt(modal.dataset.id));
    if (!log) return;

    const profile = Store.getProfile();
    const baseEx = Store.getBaseExercise();
    const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
    let text = '';

    const isDebt = (log.kcal !== undefined ? log.kcal : log.minutes) < 0;

    if (isDebt) {
        const kcalVal = Math.abs(log.kcal !== undefined ? log.kcal : log.minutes * Calc.burnRate(6.0, profile));
        const debtMins = Calc.convertKcalToMinutes(kcalVal, baseEx, profile);
        const beerName = log.brand || log.style || 'ビール';
        text = `🍺 飲みました: ${beerName}\n| 借金発生: ${baseExData.label}換算で${debtMins}分…😱\n#ノムトレ`;
    } else {
        const exKey = log.exerciseKey || 'stepper'; // 簡易フォールバック
        const exData = EXERCISE[exKey] || EXERCISE['stepper'];
        const mode1 = localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1;
        const earnedKcal = log.kcal !== undefined ? log.kcal : 0; // 古いデータは割愛
        const beerCount = Calc.convertKcalToBeerCount(earnedKcal, mode1);
        text = `🏃‍♀️ 運動しました: ${exData.label}\n| 借金返済: ${mode1}${beerCount}本分を返済！🍺\n#ノムトレ`;
    }
    shareToSocial(text);
};

const shareToSocial = async (text) => {
    if (navigator.share) {
        try { await navigator.share({ title: 'ノムトレ', text: text, url: window.location.href }); } 
        catch (err) { console.log('Share canceled'); }
    } else {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`, '_blank');
    }
};

/* ==========================================================================
   Data Migration (Startup only)
   ========================================================================== */
async function migrateData() {
    // 1. LocalStorage -> IndexedDB
    const oldLogs = localStorage.getItem(APP.STORAGE_KEYS.LOGS);
    const oldChecks = localStorage.getItem(APP.STORAGE_KEYS.CHECKS);
    if (oldLogs) {
        try { const logs = JSON.parse(oldLogs); if (logs.length > 0) await db.logs.bulkAdd(logs); } catch (e) {}
        localStorage.removeItem(APP.STORAGE_KEYS.LOGS);
    }
    if (oldChecks) {
        try { const checks = JSON.parse(oldChecks); if (checks.length > 0) await db.checks.bulkAdd(checks); } catch (e) {}
        localStorage.removeItem(APP.STORAGE_KEYS.CHECKS);
    }

    // 2. Schema v1 (minutes) -> v2 (kcal)
    const logs = await db.logs.toArray();
    const needsUpdate = logs.filter(l => l.kcal === undefined && l.minutes !== undefined);
    if (needsUpdate.length > 0) {
        const profile = Store.getProfile();
        const stepperRate = Calc.burnRate(6.0, profile);
        for (const log of needsUpdate) {
            await db.logs.update(log.id, { kcal: log.minutes * stepperRate });
        }
    }
}

/* ==========================================================================
   Event Binding & Bootstrap
   ========================================================================== */

// スワイプ処理
let touchStartX = 0;
const TABS = ['tab-home', 'tab-record', 'tab-history'];
const handleTouchEnd = (e) => {
    const diffX = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diffX) > 60 && Math.abs(e.changedTouches[0].screenY - e.changedTouches[0].screenY) < 50) { // Y軸判定は簡易化
        const currentTabId = document.querySelector('.tab-content.active').id;
        const idx = TABS.indexOf(currentTabId);
        if (diffX < 0 && idx < TABS.length - 1) UI.switchTab(TABS[idx + 1]);
        else if (diffX > 0 && idx > 0) UI.switchTab(TABS[idx - 1]);
    }
};

function bindEvents() {
    // UI Navigation
    document.getElementById('btn-open-help')?.addEventListener('click', UI.openHelp);
    document.getElementById('btn-open-settings')?.addEventListener('click', UI.openSettings);
    ['home', 'record', 'history'].forEach(t => 
        document.getElementById(`nav-tab-${t}`)?.addEventListener('click', () => UI.switchTab(`tab-${t}`))
    );

    const swipeArea = document.getElementById('swipe-area');
    if (swipeArea) {
        swipeArea.addEventListener('touchstart', (e) => touchStartX = e.changedTouches[0].screenX, {passive: true});
        swipeArea.addEventListener('touchend', handleTouchEnd);
    }

    // Modals & Forms
    document.getElementById('home-mode-select')?.addEventListener('change', (e) => UI.setBeerMode(e.target.value));
    
    document.getElementById('liver-rank-card')?.addEventListener('click', async () => {
        const todayStr = dayjs().format('YYYY-MM-DD');
        const checks = await db.checks.toArray(); // Service経由でも良いが、ID特定のため
        const target = checks.find(c => dayjs(c.timestamp).format('YYYY-MM-DD') === todayStr);
        editingCheckId = target ? target.id : null;
        UI.openCheckModal(target);
    });

    document.getElementById('chart-filters')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            StateManager.setChartRange(e.target.dataset.range);
            refreshUI();
        }
    });

    document.getElementById('tab-beer-preset')?.addEventListener('click', () => UI.switchBeerInputTab('preset'));
    document.getElementById('tab-beer-custom')?.addEventListener('click', () => UI.switchBeerInputTab('custom'));
    
    document.querySelectorAll('.btn-quick-amount').forEach(btn => {
        btn.addEventListener('click', function() {
            const el = document.getElementById('custom-amount');
            if(el) el.value = this.dataset.amount;
        });
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            toggleModal(e.target.closest('.modal-bg').id, false);
            editingLogId = null; editingCheckId = null;
        });
    });
    
    document.querySelectorAll('.modal-bg').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                toggleModal(modal.id, false);
                editingLogId = null; editingCheckId = null;
            }
        });
    });

    // Timer & Manual Record
    document.getElementById('start-stepper-btn')?.addEventListener('click', Timer.start);
    document.getElementById('pause-stepper-btn')?.addEventListener('click', Timer.pause);
    document.getElementById('resume-stepper-btn')?.addEventListener('click', Timer.resume);
    document.getElementById('stop-stepper-btn')?.addEventListener('click', Timer.stop);
    
    document.getElementById('manual-record-btn')?.addEventListener('click', () => {
        editingLogId = null;
        UI.openManualInput();
    });

    // Action Buttons
    document.getElementById('btn-open-beer')?.addEventListener('click', () => { editingLogId = null; UI.openBeerModal(null); });
    document.getElementById('btn-open-check')?.addEventListener('click', () => { editingCheckId = null; UI.openCheckModal(null); });
    
    document.getElementById('beer-form')?.addEventListener('submit', handleBeerSubmit);
    document.getElementById('btn-save-next')?.addEventListener('click', (e) => { e.preventDefault(); handleSaveAndNext(); });
    document.getElementById('check-form')?.addEventListener('submit', handleCheckSubmit);
    document.getElementById('btn-submit-manual')?.addEventListener('click', handleManualExerciseSubmit);
    document.getElementById('btn-save-settings')?.addEventListener('click', handleSaveSettings);
    
    document.getElementById('is-dry-day')?.addEventListener('change', function() { UI.toggleDryDay(this); });

    // Sharing & Data Management
    document.getElementById('btn-share-sns')?.addEventListener('click', handleShare);
    document.getElementById('btn-detail-share')?.addEventListener('click', handleDetailShare);
    
    document.getElementById('btn-export-logs')?.addEventListener('click', () => DataManager.exportCSV('logs'));
    document.getElementById('btn-export-checks')?.addEventListener('click', () => DataManager.exportCSV('checks'));
    document.getElementById('btn-copy-data')?.addEventListener('click', DataManager.copyToClipboard);
    document.getElementById('btn-download-json')?.addEventListener('click', DataManager.exportJSON);
    document.getElementById('btn-import-json')?.addEventListener('change', function() { DataManager.importJSON(this); });
    
    document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
        if(confirm('本当に全てのデータを削除して初期化しますか？\nこの操作は取り消せません。')) {
            if(confirm('これまでの記録が全て消えます。よろしいですか？')) {
                await db.logs.clear(); await db.checks.clear();
                Object.values(APP.STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
                alert('初期化しました。'); location.reload();
            }
        }
    });

    // Log List Interactions
    const logList = document.getElementById('log-list');
    logList?.addEventListener('click', async (e) => {
        if (e.target.classList.contains('log-checkbox')) return;
        
        const deleteBtn = e.target.closest('.delete-log-btn');
        if (deleteBtn) {
            e.stopPropagation();
            await Service.deleteLog(deleteBtn.dataset.id);
            return;
        }
        
        const row = e.target.closest('.log-item-row');
        if (row) {
            const log = await db.logs.get(parseInt(row.dataset.id));
            if(log) UI.openLogDetail(log);
        }
    });

    document.getElementById('log-list')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('log-checkbox')) {
            UI.updateBulkCount(document.querySelectorAll('.log-checkbox:checked').length);
        }
    });

    // Log Detail Modal Actions
    document.getElementById('btn-detail-delete')?.addEventListener('click', () => {
        const id = document.getElementById('log-detail-modal').dataset.id;
        if (id) {
            Service.deleteLog(id);
            toggleModal('log-detail-modal', false);
        }
    });

    document.getElementById('btn-detail-edit')?.addEventListener('click', async () => {
        const id = parseInt(document.getElementById('log-detail-modal').dataset.id);
        const log = await db.logs.get(id);
        if (log) {
            editingLogId = id;
            toggleModal('log-detail-modal', false);
            const isDebt = (log.kcal !== undefined ? log.kcal : log.minutes) < 0;
            isDebt ? UI.openBeerModal(log) : UI.openManualInput(log);
        }
    });

    // Edit Mode & Bulk Actions
    document.getElementById('btn-toggle-edit-mode')?.addEventListener('click', UI.toggleEditMode);
    document.getElementById('btn-select-all')?.addEventListener('click', UI.toggleSelectAll);
    document.getElementById('btn-bulk-delete')?.addEventListener('click', async () => {
        const ids = Array.from(document.querySelectorAll('.log-checkbox:checked')).map(cb => parseInt(cb.value));
        if (ids.length > 0) await Service.bulkDeleteLogs(ids);
    });

    // Heatmap Pagination
    document.getElementById('heatmap-prev')?.addEventListener('click', () => { StateManager.incrementHeatmapOffset(); refreshUI(); });
    document.getElementById('heatmap-next')?.addEventListener('click', () => { if(StateManager.heatmapOffset > 0) { StateManager.decrementHeatmapOffset(); refreshUI(); }});

    // Heatmap / Status Click
    document.getElementById('heatmap-grid')?.addEventListener('click', async (e) => {
        const cell = e.target.closest('.heatmap-cell');
        if (cell && cell.dataset.date) {
            const dateStr = cell.dataset.date;
            const checks = await db.checks.toArray();
            const target = checks.find(c => dayjs(c.timestamp).format('YYYY-MM-DD') === dateStr);
            editingCheckId = target ? target.id : null;
            UI.openCheckModal(target, dateStr);
        }
    });

    document.getElementById('check-status')?.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-edit-check') || e.target.closest('#btn-record-check')) {
            const todayStr = dayjs().format('YYYY-MM-DD');
            const checks = await db.checks.toArray();
            const target = checks.find(c => dayjs(c.timestamp).format('YYYY-MM-DD') === todayStr);
            editingCheckId = target ? target.id : null;
            UI.openCheckModal(target);
        }
    });

    // Quick Input
    document.getElementById('quick-input-area')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-beer-btn');
        if (btn) {
            editingLogId = null;
            UI.openBeerModal(null);
            setTimeout(() => {
                document.getElementById('beer-select').value = btn.dataset.style;
                document.getElementById('beer-size').value = btn.dataset.size;
            }, 50);
        }
    });

    // Misc
    document.getElementById('beer-select')?.addEventListener('change', updateBeerSelectOptions); // 実際はmodal.js内updatePresetAbv的な処理が必要だが省略
    document.getElementById('exercise-select')?.addEventListener('change', function() {
        const nameEl = document.getElementById('manual-exercise-name');
        if(nameEl && EXERCISE[this.value]) nameEl.textContent = EXERCISE[this.value].label;
    });

    // Theme Switcher
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem(APP.STORAGE_KEYS.THEME) || 'system') === 'system') {
            UI.applyTheme('system');
            refreshUI();
        }
    });
}

/**
 * Main Bootstrap
 */
document.addEventListener('DOMContentLoaded', async () => {
    UI.initDOM();

    // 依存性の注入 (UI <- Service)
    UI.setFetchLogsHandler(Service.getLogsWithPagination);
    UI.setFetchAllDataHandler(Service.getAllDataForUI);
    
    // Timer保存ハンドラの注入
    setTimerSaveHandler(async (type, minutes) => {
        await Service.saveExerciseLog(type, minutes, UI.getTodayString(), true, null);
    });

    // 初期設定
    UI.applyTheme(localStorage.getItem(APP.STORAGE_KEYS.THEME) || APP.DEFAULTS.THEME);
    bindEvents();
    await migrateData();

    // DOM要素の生成（プルダウン等）
    populateSelects();
    
    // UI初期描画
    const p = Store.getProfile();
    ['weight-input', 'height-input', 'age-input'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = p[id.split('-')[0]]; // 簡易マッピング
    });
    const gEl = document.getElementById('gender-input');
    if(gEl) gEl.value = p.gender;

    UI.updateModeSelector();
    document.getElementById('mode-selector')?.classList.remove('opacity-0');
    UI.setBeerMode('mode1');
    updateBeerSelectOptions();

    // タイマー復元
    if (Timer.restoreState()) {
        UI.switchTab('tab-record');
    } else {
        UI.switchTab('tab-home');
        // 初回ユーザー向け
        if (!localStorage.getItem(APP.STORAGE_KEYS.WEIGHT)) {
            setTimeout(() => {
                UI.openSettings();
                UI.showMessage('👋 ようこそ！まずはプロフィールと\n基準にする運動を設定しましょう！', 'success');
            }, 800);
        } else {
            setTimeout(() => showSwipeCoachMark(), 1000);
        }
    }

    await refreshUI();
});

// Helper: プルダウン生成
function populateSelects() {
    const createOpts = (obj, targetId, useKeyAsVal = false) => {
        const el = document.getElementById(targetId);
        if(!el) return;
        el.innerHTML = '';
        Object.keys(obj).forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = useKeyAsVal ? k : (obj[k].label ? `${obj[k].icon} ${obj[k].label}` : obj[k].label);
            el.appendChild(o);
        });
    };

    createOpts(EXERCISE, 'exercise-select');
    createOpts(EXERCISE, 'setting-base-exercise');
    createOpts(EXERCISE, 'setting-default-record-exercise');
    createOpts(CALORIES.STYLES, 'setting-mode-1', true);
    createOpts(CALORIES.STYLES, 'setting-mode-2', true);
    createOpts(SIZE_DATA, 'beer-size');
    
    // デフォルト値設定
    const defRec = Store.getDefaultRecordExercise();
    const exSel = document.getElementById('exercise-select');
    if(exSel && defRec) exSel.value = defRec;
    
    const bSize = document.getElementById('beer-size');
    if(bSize) bSize.value = '350';
}

const showSwipeCoachMark = () => {
    const KEY = 'nomutore_seen_swipe_hint';
    if (localStorage.getItem(KEY)) return;
    const el = document.getElementById('swipe-coach-mark');
    if (!el) return;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.remove('opacity-0'));
    setTimeout(() => {
        el.classList.add('opacity-0');
        setTimeout(() => {
            el.classList.add('hidden');
            localStorage.setItem(KEY, 'true');
        }, 500);
    }, 3500);
};

// Service Worker Register
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}