import { EXERCISE, STYLE_METADATA } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml } from './dom.js';
// import { UI } from './index.js'; // 削除: UIへの依存を排除
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

// 内部で保持するハンドラ
let _fetchLogsHandler = null;

// ハンドラ設定用関数（UI/index.jsから呼ぶ）
export const setFetchLogsHandler = (fn) => {
    _fetchLogsHandler = fn;
};

// ログリスト管理のメイン関数
export async function updateLogListView(isAppend = false) {
    const listContainer = document.getElementById('log-list');
    if (!listContainer) return;

    // 初回読み込み（リセット）の場合
    if (!isAppend) {
        StateManager.setLogLimit(50);
        listContainer.innerHTML = '';
        StateManager.setLogLoading(false);
    }

    if (StateManager.isLoadingLogs) return;
    StateManager.setLogLoading(true);

    try {
        if (!_fetchLogsHandler) {
            console.warn("fetchLogsHandler is not set. Skipping data load.");
            return;
        }

        const currentLimit = StateManager.logLimit;
        const offset = isAppend ? currentLimit - 50 : 0; 
        const limit = 50;
        
        // ハンドラ経由で取得
        const { logs, totalCount } = await _fetchLogsHandler(offset, limit);

        renderLogList(logs, isAppend);
        manageInfiniteScrollSentinel(totalCount > currentLimit);

    } catch (e) {
        console.error("Log load error:", e);
    } finally {
        StateManager.setLogLoading(false);
    }
}

// 監視要素(Sentinel)の管理
export function manageInfiniteScrollSentinel(hasMore) {
    const listContainer = document.getElementById('log-list');
    let sentinel = document.getElementById('log-list-sentinel');

    if (sentinel) sentinel.remove();

    if (hasMore) {
        sentinel = document.createElement('div');
        sentinel.id = 'log-list-sentinel';
        sentinel.className = "py-8 text-center text-xs text-gray-400 font-bold animate-pulse";
        sentinel.textContent = "Loading more...";
        listContainer.appendChild(sentinel);

        if (window.logObserver) window.logObserver.disconnect();
        
        window.logObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                StateManager.incrementLogLimit(50);
                updateLogListView(true); // 追記モードで呼ぶ
            }
        }, { rootMargin: '200px' });

        window.logObserver.observe(sentinel);
    } else {
        if (listContainer.children.length > 0) {
            const endMsg = document.createElement('div');
            endMsg.className = "py-8 text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest";
            endMsg.textContent = "- NO MORE LOGS -";
            listContainer.appendChild(endMsg);
        }
    }
}

// ログリスト描画
export function renderLogList(logs, isAppend) {
    const list = DOM.elements['log-list'] || document.getElementById('log-list');
    if (!list) return;

    if (!isAppend && logs.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10 px-4">
                <div class="text-6xl mb-4 opacity-80">🍻</div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-2">まだ記録がありません</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                    飲んだお酒を記録すると、<br>
                    借金（運動ノルマ）が発生します。<br>
                    まずは最初の一杯を記録してみましょう！
                </p>
                <button data-action="trigger-beer-modal" class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-bold py-3 px-6 rounded-xl text-sm border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition">
                    👉 飲酒を記録する
                </button>
            </div>
        `;
        return;
    }

    const baseEx = Store.getBaseExercise();
    const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
    
    const labelEl = DOM.elements['history-base-label'] || document.getElementById('history-base-label');
    if(labelEl) labelEl.textContent = `(${baseExData.icon} ${baseExData.label} 換算)`;

    const userProfile = Store.getProfile();

    const htmlItems = logs.map(log => {
        const kcal = log.kcal !== undefined ? log.kcal : (log.minutes * Calc.burnRate(6.0, userProfile));
        const isDebt = kcal < 0;
        
        const displayMinutes = Calc.convertKcalToMinutes(Math.abs(kcal), baseEx, userProfile);
        const typeText = isDebt ? '借金' : '返済';
        const signClass = isDebt ? 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300' : 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-300';
        
        let iconChar = isDebt ? '🍺' : '🏃‍♀️';
        if (isDebt && log.style && STYLE_METADATA[log.style]) {
            iconChar = STYLE_METADATA[log.style].icon;
        } else if (!isDebt) {
             const exKey = log.exerciseKey;
             if (exKey && EXERCISE[exKey]) {
                 iconChar = EXERCISE[exKey].icon;
             } else if (log.name) {
                 const exEntry = Object.values(EXERCISE).find(e => log.name.includes(e.label));
                 if(exEntry) iconChar = exEntry.icon;
             }
        }

        const date = dayjs(log.timestamp).format('MM/DD HH:mm');
        
        const safeName = escapeHtml(log.name);
        const safeBrewery = escapeHtml(log.brewery);
        const safeBrand = escapeHtml(log.brand);
        const safeMemo = escapeHtml(log.memo);

        let detailHtml = '';
        if (log.brewery || log.brand) {
            detailHtml += `<p class="text-xs mt-0.5"><span class="font-bold text-gray-600 dark:text-gray-400">${safeBrewery||''}</span> <span class="text-gray-600 dark:text-gray-400">${safeBrand||''}</span></p>`;
        }
        
        if (isDebt && (log.rating > 0 || log.memo)) {
            const stars = '★'.repeat(log.rating) + '☆'.repeat(5 - log.rating);
            const ratingDisplay = log.rating > 0 ? `<span class="text-yellow-500 text-[10px] mr-2">${stars}</span>` : '';
            const memoDisplay = log.memo ? `<span class="text-[10px] text-gray-400 dark:text-gray-500">"${safeMemo}"</span>` : '';
            detailHtml += `<div class="mt-1 flex flex-wrap items-center bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">${ratingDisplay}${memoDisplay}</div>`;
        } else if (!isDebt && log.memo) {
             detailHtml += `<div class="mt-1 flex flex-wrap items-center bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1"><span class="text-[10px] text-orange-500 dark:text-orange-400 font-bold">${safeMemo}</span></div>`;
        }

        const checkHidden = StateManager.isEditMode ? '' : 'hidden';
        const checkboxHtml = `<div class="edit-checkbox-area ${checkHidden} mr-3 flex-shrink-0"><input type="checkbox" class="log-checkbox w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 bg-gray-100 dark:bg-gray-700 dark:border-gray-600" value="${log.id}"></div>`;
        const displaySign = isDebt ? '-' : '+';

        return `<div class="log-item-row flex justify-between items-center p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 group transition-colors cursor-pointer" data-id="${log.id}">
                    <div class="flex items-center flex-grow min-w-0 pr-2">
                        ${checkboxHtml}
                        <div class="mr-3 text-2xl flex-shrink-0">${iconChar}</div> <div class="min-w-0">
                            <p class="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">${safeName}</p>
                            ${detailHtml} <p class="text-[10px] text-gray-400 mt-0.5">${date}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${signClass} whitespace-nowrap">${typeText} ${displaySign}${displayMinutes}分</span>
                        <button data-id="${log.id}" class="delete-log-btn text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 p-1 font-bold px-2">×</button>
                    </div>
                </div>`;
    });

    if (isAppend) {
        list.insertAdjacentHTML('beforeend', htmlItems.join(''));
    } else {
        list.innerHTML = htmlItems.join('');
    }
}

export const toggleEditMode = () => {
    const isEdit = StateManager.toggleEditMode();
    
    const btn = document.getElementById('btn-toggle-edit-mode');
    if (btn) {
        btn.textContent = isEdit ? '完了' : '編集';
        btn.className = isEdit 
            ? "text-xs font-bold text-white bg-indigo-500 px-3 py-1.5 rounded-lg transition"
            : "text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-gray-700 px-3 py-1.5 rounded-lg transition hover:bg-indigo-100 dark:hover:bg-gray-600";
    }

    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
        if (isEdit) selectAllBtn.classList.remove('hidden');
        else {
            selectAllBtn.classList.add('hidden');
            selectAllBtn.textContent = '全選択'; 
        }
    }

    const bar = document.getElementById('bulk-action-bar');
    if (bar) {
        if (isEdit) bar.classList.remove('hidden');
        else bar.classList.add('hidden');
    }

    const checkboxes = document.querySelectorAll('.edit-checkbox-area');
    checkboxes.forEach(el => {
        if (isEdit) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    const spacer = document.getElementById('edit-spacer');
    if (spacer) {
        if (isEdit) { spacer.classList.remove('hidden'); spacer.classList.add('block'); }
        else { spacer.classList.add('hidden'); spacer.classList.remove('block'); }
    }

    if (!isEdit) {
        const inputs = document.querySelectorAll('.log-checkbox');
        inputs.forEach(i => i.checked = false);
        updateBulkCount(0);
    }
};

export const toggleSelectAll = () => {
    const btn = document.getElementById('btn-select-all');
    const inputs = document.querySelectorAll('.log-checkbox');
    const isAllSelected = btn.textContent === '全解除';

    if (isAllSelected) {
        inputs.forEach(i => i.checked = false);
        btn.textContent = '全選択';
        updateBulkCount(0);
    } else {
        inputs.forEach(i => i.checked = true);
        btn.textContent = '全解除';
        updateBulkCount(inputs.length);
    }
};

export const updateBulkCount = (count) => {
    const el = document.getElementById('bulk-selected-count');
    if (el) el.textContent = count;
    
    const btn = document.getElementById('btn-bulk-delete');
    if (btn) {
        if (count > 0) btn.removeAttribute('disabled');
        else btn.setAttribute('disabled', 'true');
        btn.style.opacity = count > 0 ? '1' : '0.5';
    }
};