import { APP } from '../constants.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';
// import { UI } from './index.js'; // 削除: 循環参照の原因となるため削除

export const DOM = {
    isInitialized: false,
    elements: {},
    init: () => {
        if (DOM.isInitialized) return;
        
        const ids = [
            'message-box', 'drinking-section', 
            'beer-date', 'beer-select', 'beer-size', 'beer-count',
            'beer-input-preset', 'beer-input-custom',
            'custom-abv', 'custom-amount', 
            'tab-beer-preset', 'tab-beer-custom',
            'check-date', 'check-weight', 
            'manual-exercise-name', 'manual-date', 
            'weight-input', 'height-input', 'age-input', 'gender-input',
            'setting-mode-1', 'setting-mode-2', 'setting-base-exercise', 'theme-input','setting-default-record-exercise',
            'home-mode-select', 
            'tank-liquid', 'tank-empty-icon', 'tank-cans', 'tank-minutes', 'tank-message',
            'log-list', 'history-base-label',
            'liver-rank-card', 'rank-title', 'dry-count', 'rank-progress', 'rank-next-msg',
            'check-status', 'streak-count', 'streak-badge', 'weekly-stamps', 'weekly-status-text',
            'chart-filters', 'quick-input-area', 'beer-select-mode-label',
            'tab-history', 
            'heatmap-grid',
            'log-detail-modal', 'detail-icon', 'detail-title', 'detail-date', 'detail-minutes', 
            'detail-beer-info', 'detail-style', 'detail-size', 'detail-brand', 
            'detail-memo-container', 'detail-rating', 'detail-memo',
            'btn-detail-edit', 'btn-detail-delete', 'btn-detail-copy',
            'beer-submit-btn', 'check-submit-btn',
            'btn-toggle-edit-mode', 'bulk-action-bar', 'btn-bulk-delete', 'bulk-selected-count',
            'btn-select-all', 'log-container',
            'heatmap-prev', 'heatmap-next', 'heatmap-period-label', 'btn-reset-all'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                DOM.elements[id] = el;
            } else {
                console.warn(`[DOM.init] Element with id '${id}' not found. Check HTML structure.`);
            }
        });
    
        injectPresetAbvInput();
        injectHeatmapContainer();
        
        // 削除: ここにあったイベントリスナー設定ロジックは ui/index.js へ移動
        // DOM.js は純粋に要素の初期化のみを担当する

        DOM.isInitialized = true;
    }
};

export const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
};

export const toggleModal = (id, show) => { 
    const el = document.getElementById(id);
    if (el) {
        if (show) {
            el.classList.remove('hidden');
            el.classList.add('flex'); // Flexboxで中央寄せするため
        } else {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }
    }
};

export const showMessage = (msg, type) => {
    const mb = document.getElementById('message-box');
    if (!mb) return;
    
    mb.textContent = msg; 
    mb.className = `fixed top-4 left-1/2 transform -translate-x-1/2 p-3 text-white rounded-lg shadow-lg z-[100] text-center font-bold text-sm w-11/12 max-w-sm transition-all ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
    mb.classList.remove('hidden'); 
    
    setTimeout(() => mb.classList.add('hidden'), 3000);
};

export const showConfetti = () => {
    const duration = 2000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#10B981', '#F59E0B', '#6366F1']
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#10B981', '#F59E0B', '#6366F1']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
};

export const applyTheme = (theme) => {
    const root = document.documentElement;
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (theme === 'dark' || (theme === 'system' && isSystemDark)) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
};

export const toggleDryDay = (cb) => {
    const section = document.getElementById('drinking-section');
    if (section) section.classList.toggle('hidden-area', cb.checked);
};

export const injectPresetAbvInput = () => {
    const sizeSelect = DOM.elements['beer-size'] || document.getElementById('beer-size');
    if (!sizeSelect || document.getElementById('preset-abv-container')) return;

    const container = document.createElement('div');
    container.id = 'preset-abv-container';
    container.className = "mb-4";
    container.innerHTML = `
        <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
            度数 (ABV %) <span class="text-xs font-normal text-gray-500">※変更でカロリー自動補正</span>
        </label>
        <div class="relative">
            <input type="number" id="preset-abv" step="0.1" placeholder="5.0" 
                class="shadow-sm appearance-none border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded w-full py-3 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 transition">
            <span class="absolute right-3 top-3 text-gray-400 font-bold">%</span>
        </div>
    `;

    if(sizeSelect.parentNode && sizeSelect.parentNode.parentNode) {
            sizeSelect.parentNode.parentNode.insertBefore(container, sizeSelect.parentNode.nextSibling); 
            const grid = sizeSelect.closest('.grid');
            if(grid) {
                grid.parentNode.insertBefore(container, grid);
            }
    }
    DOM.elements['preset-abv'] = document.getElementById('preset-abv');
};

export const injectHeatmapContainer = () => {
    const target = document.getElementById('chart-container');
    if (!target || document.getElementById('heatmap-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'heatmap-wrapper';
    wrapper.className = "mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4";
    
    wrapper.innerHTML = `
        <div class="flex justify-between items-center mb-3">
            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider">Continuity</h3>
            <div class="flex items-center gap-2">
                <button id="heatmap-prev" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 active:scale-95 transition">◀</button>
                <span id="heatmap-period-label" class="text-[10px] font-bold text-gray-500">Last 5 Weeks</span>
                <button id="heatmap-next" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 active:scale-95 transition" disabled>▶</button>
            </div>
        </div>
        
        <div id="heatmap-grid" class="grid grid-cols-7 gap-1 mb-3"></div>

        <div class="flex flex-wrap justify-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-emerald-500 mr-1"></span>休肝+運動</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-green-400 mr-1"></span>休肝日</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-blue-400 mr-1"></span>飲酒+運動</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-red-400 mr-1"></span>飲酒のみ</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-cyan-400 mr-1"></span>運動のみ</div>
        </div>
    `;

    target.parentNode.insertBefore(wrapper, target);
    DOM.elements['heatmap-grid'] = document.getElementById('heatmap-grid');
};