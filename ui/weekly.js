import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderWeeklyAndHeatUp(logs, checks) {
    const profile = Store.getProfile();
    const streak = Calc.getCurrentStreak(logs, checks, profile);
    const multiplier = Calc.getStreakMultiplier(streak);
    
    const streakEl = DOM.elements['streak-count'] || document.getElementById('streak-count');
    if(streakEl) streakEl.textContent = streak;
    
    const badge = DOM.elements['streak-badge'] || document.getElementById('streak-badge');
    if (badge) {
        if (multiplier > 1.0) {
            badge.textContent = `🔥 x${multiplier.toFixed(1)} Bonus!`;
            badge.className = "mt-1 px-2 py-0.5 bg-orange-500 rounded-full text-[10px] font-bold text-white shadow-sm animate-pulse";
        } else {
            badge.textContent = "x1.0 (Normal)";
            badge.className = "mt-1 px-2 py-0.5 bg-white dark:bg-gray-700 rounded-full text-[10px] font-bold text-gray-400 shadow-sm border border-orange-100 dark:border-gray-600";
        }
    }

    const container = DOM.elements['weekly-stamps'] || document.getElementById('weekly-stamps');
    if (!container) return; // ガード節
    
    const fragment = document.createDocumentFragment();
    const today = dayjs();
    let dryCountInWeek = 0; 

    for (let i = 6; i >= 0; i--) {
        const d = today.subtract(i, 'day');
        const status = Calc.getDayStatus(d, logs, checks, profile);
        const isToday = i === 0;

        let elClass = "w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-sm transition-all cursor-pointer hover:opacity-80 active:scale-95 ";
        let content = "";

        if (isToday) {
            elClass += "border-2 border-indigo-500 bg-white dark:bg-gray-700 text-indigo-500 dark:text-indigo-300 font-bold relative transform scale-110";
            content = "今";
        } 
        else if (status === 'rest' || status === 'rest_exercise') {
            elClass += "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 border border-green-200 dark:border-green-800";
            content = "🍵";
            dryCountInWeek++;
        } 
        else if (status === 'drink_exercise_success') {
            elClass += "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
            content = "🏃";
        }
        else if (status === 'drink' || status === 'drink_exercise') {
            elClass += "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800";
            content = "🍺";
        } 
        else {
            elClass += "bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500 border border-gray-200 dark:border-gray-600";
            content = "-";
        }

        const div = document.createElement('div');
        div.className = elClass;
        div.textContent = content;
        div.title = d.format('MM/DD'); 
        div.dataset.date = d.format('YYYY-MM-DD');
        
        fragment.appendChild(div);
    }

    container.innerHTML = '';
    container.appendChild(fragment);

    const msgEl = DOM.elements['weekly-status-text'] || document.getElementById('weekly-status-text');
    if (msgEl) {
        if (dryCountInWeek >= 4) msgEl.textContent = "Excellent! 🌟";
        else if (dryCountInWeek >= 2) msgEl.textContent = "Good pace 👍";
        else msgEl.textContent = "Let's rest... 🍵";
    }
}

// ヒートマップ描画 (refreshUIから呼ばれる)
export function renderHeatmap(checks, logs) {
    const grid = document.getElementById('heatmap-grid');
    const label = document.getElementById('heatmap-period-label');
    
    // ページネーションボタン制御
    const prevBtn = document.getElementById('heatmap-prev');
    const nextBtn = document.getElementById('heatmap-next');
    const offset = StateManager.heatmapOffset;

    if (nextBtn) {
        if (offset <= 0) {
            nextBtn.setAttribute('disabled', 'true');
            nextBtn.classList.add('opacity-30', 'cursor-not-allowed');
        } else {
            nextBtn.removeAttribute('disabled');
            nextBtn.classList.remove('opacity-30', 'cursor-not-allowed');
        }
    }

    if (!grid) return;

    // ★追加: profile取得
    const profile = Store.getProfile();

    const offsetMonth = StateManager.heatmapOffset; 
    const baseDate = dayjs().subtract(offsetMonth, 'month'); // 過去へ遡る
    const startOfMonth = baseDate.startOf('month');
    const daysInMonth = baseDate.daysInMonth();
    
    if (label) label.textContent = baseDate.format('YYYY年 M月');

    const weeks = ['日','月','火','水','木','金','土'];
    let html = '';
    weeks.forEach(w => {
        html += `<div class="text-center text-[10px] text-gray-400 font-bold py-1">${w}</div>`;
    });

    const startDay = startOfMonth.day();
    for (let i = 0; i < startDay; i++) {
        html += `<div></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const currentDay = baseDate.date(d);
        const dateStr = currentDay.format('YYYY-MM-DD');
        const isToday = currentDay.isSame(dayjs(), 'day');
        
        // ステータス取得
        // ★修正: profileを渡す
        const status = Calc.getDayStatus(currentDay, logs, checks, profile);

        // デフォルトスタイル
        let bgClass = 'bg-gray-100 dark:bg-gray-700';
        let textClass = 'text-gray-400 dark:text-gray-500';
        let icon = '';

        // ステータス別スタイル適用 (index.htmlの凡例に準拠)
        switch (status) {
            case 'rest_exercise': // 休肝+運動 (Emerald)
                bgClass = 'bg-emerald-500 border border-emerald-600 shadow-sm';
                textClass = 'text-white font-bold';
                icon = '🏃‍♀️'; // または 🍵+🏃‍♀️
                break;
            case 'rest': // 休肝日 (Green)
                bgClass = 'bg-green-400 border border-green-500 shadow-sm';
                textClass = 'text-white font-bold';
                icon = '🍵';
                break;
            // 【ここを追加】完済した場合も、青色（drink_exercise）と同じ見た目でOKだが、
            // ボーダーをゴールドにするなど「偉い！」感を出すことも可能
            case 'drink_exercise_success':
                bgClass = 'bg-blue-500 border-2 border-yellow-400 shadow-md ring-2 ring-yellow-200 dark:ring-yellow-900'; // 完済は枠線を強調！
                textClass = 'text-white font-bold';
                icon = '🏅'; // アイコンも燃やす
                break;
            case 'drink_exercise': // 飲酒+運動 (Blue)
                bgClass = 'bg-blue-400 border border-blue-500 shadow-sm';
                textClass = 'text-white font-bold';
                icon = '💦';
                break;
            case 'drink': // 飲酒のみ (Red)
                bgClass = 'bg-red-400 border border-red-500 shadow-sm';
                textClass = 'text-white font-bold';
                icon = '🍺';
                break;
            case 'exercise': // 運動のみ (Cyan)
                bgClass = 'bg-cyan-400 border border-cyan-500 shadow-sm';
                textClass = 'text-white font-bold';
                icon = '👟';
                break;
        }
        
        if (isToday) {
            bgClass += ' ring-2 ring-indigo-500 dark:ring-indigo-400 z-10';
        }

        html += `
            <div class="heatmap-cell aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition hover:scale-105 active:scale-95 ${bgClass}" data-date="${dateStr}">
                <span class="text-[10px] ${textClass}">${d}</span>
                ${icon ? `<span class="text-[10px] leading-none mt-0.5">${icon}</span>` : ''}
            </div>
        `;
    }

    grid.innerHTML = html;
}