import { APP, EXERCISE } from '../constants.js';
import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM, escapeHtml } from './dom.js';

export function renderBeerTank(currentBalanceKcal) {
    const profile = Store.getProfile();
    const settings = {
        modes: Store.getModes(),
        baseExercise: Store.getBaseExercise()
    };

    const { 
        canCount, 
        displayMinutes, 
        baseExData, 
        unitKcal, 
        targetStyle,
        liquidColor,
        isHazy 
    } = Calc.getTankDisplayData(currentBalanceKcal, StateManager.beerMode, settings, profile);

    const liquid = DOM.elements['tank-liquid'];
    const emptyIcon = DOM.elements['tank-empty-icon'];
    const cansText = DOM.elements['tank-cans'];
    const minText = DOM.elements['tank-minutes'];
    const msgContainer = DOM.elements['tank-message'];
    
    if (!liquid || !emptyIcon || !cansText || !minText || !msgContainer) return;
    
    // メッセージ表示用のpタグを取得（なければ作成）
    let msgText = msgContainer.querySelector('p');
    if (!msgText) {
        msgText = document.createElement('p');
        msgContainer.appendChild(msgText);
    }
    
    // ★追加: 提案表示エリアを取得（なければ作成）
    let suggestionEl = document.getElementById('tank-suggestion');
    if (!suggestionEl) {
        suggestionEl = document.createElement('div');
        suggestionEl.id = 'tank-suggestion';
        suggestionEl.className = "mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hidden";
        msgContainer.appendChild(suggestionEl);
    }

    requestAnimationFrame(() => {
        liquid.style.background = liquidColor;
        liquid.style.filter = isHazy ? 'blur(1px) brightness(1.1)' : 'none';

        if (currentBalanceKcal > 0) {
            // --- 貯金あり ---
            emptyIcon.style.opacity = '0';
            let h = (canCount / APP.TANK_MAX_CANS) * 100;
            liquid.style.height = `${Math.max(5, Math.min(100, h))}%`;
            cansText.textContent = canCount.toFixed(1);
            
            const safeIcon = escapeHtml(baseExData.icon);
            minText.innerHTML = `+${Math.round(displayMinutes)} min <span class="text-[10px] font-normal text-gray-400">(${safeIcon})</span>`;
            minText.className = 'text-sm font-bold text-gray-600 dark:text-gray-300'; // 色を通常に戻す

            // 達成感のあるメッセージ
            if (canCount < 0.5) { 
                msgText.textContent = 'まずは0.5本分貯めよう！😐'; 
                msgText.className = 'text-sm font-bold text-gray-500 dark:text-gray-400'; 
            } else if (canCount < 1.0) { 
                msgText.textContent = 'あと少しで1本飲めるよ！🤔'; 
                msgText.className = 'text-sm font-bold text-orange-500 dark:text-orange-400'; 
            } else if (canCount < 2.0) { 
                msgText.textContent = `1本飲めるよ！(${escapeHtml(targetStyle)})🍺`; 
                msgText.className = 'text-sm font-bold text-green-600 dark:text-green-400'; 
            } else { 
                msgText.textContent = '余裕の貯金！最高だね！✨'; 
                msgText.className = 'text-sm font-bold text-green-800 dark:text-green-300'; 
            }
            
            // 借金なし時は提案非表示
            suggestionEl.classList.add('hidden');

        } else {
            // --- 借金あり (枯渇中) ---
            liquid.style.height = '0%';
            emptyIcon.style.opacity = '1';
            cansText.textContent = "0.0";
            
            const safeIcon = escapeHtml(baseExData.icon);
            // 赤字で強調
            minText.innerHTML = `${Math.round(Math.abs(displayMinutes))} min <span class="text-[10px] font-normal text-red-300">(${safeIcon})</span>`;
            minText.className = 'text-sm font-bold text-red-500 dark:text-red-400';
            
            const debtCansVal = Math.abs(canCount);
            if (debtCansVal > 1.5) {
                const oneCanMin = Calc.convertKcalToMinutes(unitKcal, Store.getBaseExercise(), profile);
                msgText.textContent = `借金山積み...😱 まずは1杯分 (${oneCanMin}分) だけ返そう！`;
                msgText.className = 'text-sm font-bold text-orange-500 dark:text-orange-400 animate-pulse';
            } else {
                msgText.textContent = `枯渇中... あと${debtCansVal.toFixed(1)}本分動こう😱`;
                msgText.className = 'text-sm font-bold text-red-500 dark:text-red-400 animate-pulse';
            }

            // ★罪滅ぼし提案を表示
            const suggestion = Calc.getRedemptionSuggestion(currentBalanceKcal, profile);
            if (suggestion) {
                suggestionEl.classList.remove('hidden');
                suggestionEl.innerHTML = `
                    <span class="block mb-1 font-bold opacity-70">💡 ヒント: これで完済！</span>
                    <span class="flex items-center justify-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold">
                        ${suggestion.icon} ${suggestion.label}なら <span class="text-lg underline">${suggestion.mins}</span> 分
                    </span>
                `;
            }
        }
    });
}