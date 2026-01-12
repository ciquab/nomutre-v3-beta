import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { DOM } from './dom.js';

export function renderLiverRank(checks, logs) {
    const profile = Store.getProfile();
    const gradeData = Calc.getRecentGrade(checks, logs, profile);
    
    const card = DOM.elements['liver-rank-card'] || document.getElementById('liver-rank-card');
    const title = DOM.elements['rank-title'] || document.getElementById('rank-title');
    const countEl = DOM.elements['dry-count'] || document.getElementById('dry-count');
    const bar = DOM.elements['rank-progress'] || document.getElementById('rank-progress');
    const msg = DOM.elements['rank-next-msg'] || document.getElementById('rank-next-msg');

    // ガード節
    if(!card || !title || !countEl || !bar || !msg) return;

    card.classList.remove('hidden');

    let colorClass = gradeData.color;
    // ... (スタイルロジックは変更なし) ...
    if(colorClass.includes('text-purple-600')) colorClass += ' dark:text-purple-400';
    if(colorClass.includes('text-indigo-600')) colorClass += ' dark:text-indigo-400';
    if(colorClass.includes('text-green-600'))  colorClass += ' dark:text-green-400';
    if(colorClass.includes('text-red-500'))    colorClass += ' dark:text-red-400';
    if(colorClass.includes('text-orange-500')) colorClass += ' dark:text-orange-400';

    title.className = `text-xl font-black mt-1 ${colorClass}`;
    title.textContent = `${gradeData.rank} : ${gradeData.label}`;
    countEl.textContent = gradeData.current;
    
    const darkBgMap = {
        'bg-orange-100': 'dark:bg-orange-900/30 dark:border-orange-800',
        'bg-indigo-100': 'dark:bg-indigo-900/30 dark:border-indigo-800',
        'bg-green-100': 'dark:bg-green-900/30 dark:border-green-800',
        'bg-gray-100': 'dark:bg-gray-700 dark:border-gray-600',
        'bg-purple-100': 'dark:bg-purple-900/30 dark:border-purple-800',
        'bg-red-50': 'dark:bg-red-900/20 dark:border-red-800'
    };
    
    const darkClasses = darkBgMap[gradeData.bg] || '';
    card.className = `mx-2 mt-4 mb-2 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden transition-colors ${gradeData.bg} ${darkClasses} group cursor-pointer hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 active:scale-[0.99] transition-all`;

    requestAnimationFrame(() => {
        if (gradeData.next) {
            let percent = 0;
            if (gradeData.isRookie) {
                 percent = (gradeData.rawRate / gradeData.targetRate) * 100;
                 msg.textContent = `ランクアップまであと少し！ (現在 ${Math.round(gradeData.rawRate * 100)}%)`;
            } else {
                const prevTarget = gradeData.rank === 'A' ? 12 : (gradeData.rank === 'B' ? 8 : 0);
                const range = gradeData.next - prevTarget;
                const currentInRank = gradeData.current - prevTarget;
                percent = (currentInRank / range) * 100;
                msg.textContent = `ランクアップまであと ${gradeData.next - gradeData.current} 日`;
            }
            bar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
        } else {
            bar.style.width = '100%';
            msg.textContent = '最高ランク到達！キープしよう！👑';
        }
    });
}