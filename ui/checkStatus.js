import { Calc } from '../logic.js';
import { DOM, escapeHtml } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderCheckStatus(checks, logs) {
    const status = DOM.elements['check-status'] || document.getElementById('check-status');
    if(!status) return; // ガード節

    const today = dayjs();
    const yest = today.subtract(1, 'day');
    let targetCheck = null; let type = 'none';

    if (checks.length > 0) {
        for(let i=checks.length-1; i>=0; i--) {
            const c = checks[i];
            const checkDay = dayjs(c.timestamp);
            if (checkDay.isSame(today, 'day')) { targetCheck = c; type = 'today'; break; }
            if (checkDay.isSame(yest, 'day')) { targetCheck = c; type = 'yesterday'; break; }
        }
    }

    // HTML生成部分は安全（静的コンテンツメイン）だが念のため
    if (type !== 'none') {
        const msg = getCheckMessage(targetCheck, logs);
        const title = type === 'today' ? "Today's Condition" : "Yesterday's Check";
        const style = type === 'today' 
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300" 
            : "bg-white dark:bg-gray-800 border-green-400 border-l-4";
        
        let weightHtml = '';
        if(targetCheck.weight) {
            // weightは数値だが一応
            weightHtml = `<span class="ml-2 text-[10px] bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-300 font-bold">${escapeHtml(targetCheck.weight)}kg</span>`;
        }
        const textColor = type === 'today' ? '' : 'text-gray-800 dark:text-gray-200';

        status.innerHTML = `<div class="p-3 rounded-xl border ${style} flex justify-between items-center shadow-sm transition-colors"><div class="flex items-center gap-3"><span class="text-2xl">${type==='today'?'😎':'✅'}</span><div><p class="text-[10px] opacity-70 font-bold uppercase tracking-wider">${title}</p><p class="text-sm font-bold ${textColor} flex items-center">${msg}${weightHtml}</p></div></div><button id="btn-edit-check" class="bg-white dark:bg-gray-700 bg-opacity-50 hover:bg-opacity-100 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm border border-gray-200 dark:border-gray-600 dark:text-white">編集</button></div>`;
    } else {
        const lastDate = checks.length > 0 ? dayjs(checks[checks.length-1].timestamp).format('MM/DD') : 'なし';
        status.innerHTML = `<div class="p-3 rounded-xl border bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800 flex justify-between items-center shadow-sm transition-colors"><div class="flex items-center gap-3"><span class="text-2xl">👋</span><div><p class="text-[10px] opacity-70 font-bold uppercase tracking-wider">Daily Check</p><p class="text-sm font-bold">昨日の振り返りをしましょう！</p><p class="text-[10px] opacity-60">最終: ${lastDate}</p></div></div><button id="btn-record-check" class="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm border border-yellow-300 dark:border-yellow-700 animate-pulse text-yellow-800 dark:text-yellow-400">記録する</button></div>`;
    }
}

export function getCheckMessage(check, logs) {
    const drank = Calc.hasAlcoholLog(logs, check.timestamp);
    if (drank || !check.isDryDay) {
        let s = 0; if (check.waistEase) s++; if (check.footLightness) s++; if (check.fiberOk) s++; if (check.waterOk) s++;
        if (s === 4) return '代謝絶好調！😆'; if (s >= 1) return `${s}/4 クリア 😐`; return '不調気味... 😰';
    } else { return (check.waistEase && check.footLightness) ? '休肝日＋絶好調！✨' : '休肝日 (体調イマイチ)🍵'; }
}