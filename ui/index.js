import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { DOM, toggleModal, showConfetti, showMessage, applyTheme, toggleDryDay } from './dom.js';
import { StateManager } from './state.js';

// 各UIモジュール
import { renderBeerTank } from './beerTank.js';
import { renderLiverRank } from './liverRank.js';
import { renderCheckStatus } from './checkStatus.js';
import { renderWeeklyAndHeatUp, renderHeatmap } from './weekly.js';
import { renderChart } from './chart.js';
import { updateLogListView, toggleEditMode, toggleSelectAll, updateBulkCount, setFetchLogsHandler } from './logList.js';
import { 
    getBeerFormData, resetBeerForm, openBeerModal, switchBeerInputTab, 
    openCheckModal, openManualInput, openSettings, openHelp, openLogDetail,
    updateModeSelector, updateBeerSelectOptions, updateInputSuggestions, renderQuickButtons
} from './modal.js';

import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// UI集約オブジェクト
export const UI = {
    // 外部APIハンドラ
    // LogListモジュールへ委譲
    setFetchLogsHandler: (fn) => { setFetchLogsHandler(fn); },

    _fetchAllDataHandler: null,
    setFetchAllDataHandler: (fn) => { UI._fetchAllDataHandler = fn; },

    getTodayString: () => dayjs().format('YYYY-MM-DD'),

    // DOM/Utility (dom.jsより)
    // initDOM を拡張してイベントリスナー設定を含める
    initDOM: () => {
        DOM.init();
        UI.setupGlobalEventListeners();
    },
    
    // dom.js から移動したイベント設定ロジック
    setupGlobalEventListeners: () => {
        // ログリストのエンプティステート内のボタン
        const logListEl = document.getElementById('log-list');
        if (logListEl) {
            logListEl.addEventListener('click', (e) => {
                const triggerBtn = e.target.closest('[data-action="trigger-beer-modal"]');
                if (triggerBtn) {
                    openBeerModal(null);
                }
            });
        }

        // 週間スタンプのクリックイベント
        const weeklyStampsEl = document.getElementById('weekly-stamps');
        if (weeklyStampsEl) {
            weeklyStampsEl.addEventListener('click', (e) => {
                const cell = e.target.closest('[data-date]');
                if (cell) {
                    openBeerModal(null, cell.dataset.date);
                }
            });
        }
    },

    toggleModal,
    showConfetti,
    showMessage,
    applyTheme,
    toggleDryDay,

    // StateManager (state.jsより)
    StateManager,

    // LogList (logList.jsより)
    updateLogListView, 
    toggleEditMode,
    toggleSelectAll,
    updateBulkCount,

    // Modal/Form (modal.jsより)
    getBeerFormData,
    resetBeerForm,
    openBeerModal,
    switchBeerInputTab,
    openCheckModal,
    openManualInput,
    openSettings,
    openHelp,
    openLogDetail,
    updateModeSelector,
    // updateBeerSelectOptions, // 下でexport
    // renderQuickButtons,

    // Action (Main Logic)
    setBeerMode: (mode) => {
        StateManager.setBeerMode(mode); 
        
        const select = DOM.elements['home-mode-select'];
        const liq = document.getElementById('tank-liquid');
        
        if (select && select.value !== mode) {
            select.value = mode;
        }

        requestAnimationFrame(() => {
            if (mode === 'mode1') {
                if(liq) { liq.classList.remove('mode2'); liq.classList.add('mode1'); }
            } else {
                if(liq) { liq.classList.remove('mode1'); liq.classList.add('mode2'); }
            }
        });
        refreshUI();
    },

    switchTab: (tabId) => {
        if (!tabId) return;
        const targetTab = document.getElementById(tabId);
        const targetNav = document.getElementById(`nav-${tabId}`);
        if (!targetTab || !targetNav) return;
    
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        targetTab.classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(el => { 
            el.classList.remove('text-indigo-600', 'dark:text-indigo-400'); 
            el.classList.add('text-gray-400', 'dark:text-gray-500'); 
        });
        targetNav.classList.remove('text-gray-400', 'dark:text-gray-500');
        targetNav.classList.add('text-indigo-600', 'dark:text-indigo-400');
        
        // 履歴タブを開いた時のみリスト更新
        if (tabId === 'tab-history') {
            updateLogListView(false); // リセットして読み込み
            refreshUI(); 
        }
        
        // スクロール位置リセット
        const resetScroll = () => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        };
        resetScroll();
        requestAnimationFrame(() => requestAnimationFrame(resetScroll));
    }
};

// 画面一括更新
export const refreshUI = async () => {
    // 1. データ取得
    if (!UI._fetchAllDataHandler) {
        console.warn("UI._fetchAllDataHandler is not set.");
        return;
    }
    
    // main.js から注入されたハンドラを実行
    const { logs, checks } = await UI._fetchAllDataHandler();
    
    // プロフィール取得
    const profile = Store.getProfile();

    // 2. カロリー収支計算
    // 互換性考慮: kcalがあれば使用、なければminutes(ステッパー)から換算
    const currentKcalBalance = logs.reduce((sum, l) => {
        const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0, profile));
        return sum + val;
    }, 0);

    // 3. 各コンポーネントの描画
    renderBeerTank(currentKcalBalance);
    renderLiverRank(checks, logs);
    renderCheckStatus(checks, logs);
    renderWeeklyAndHeatUp(logs, checks);
    renderQuickButtons(logs);
    renderChart(logs, checks);
    
    // 4. ログリストのリセット (無限スクロールの頭出し)
    await updateLogListView(false);

    // 5. ヒートマップ描画
    renderHeatmap(checks, logs);

    // 6. 入力サジェスト更新
    updateInputSuggestions(logs);
};

// 個別にexportするもの（main.js等から直接importされているもの）
export { StateManager, updateBeerSelectOptions, toggleModal };