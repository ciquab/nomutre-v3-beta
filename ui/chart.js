import { Calc } from '../logic.js';
import { Store } from '../store.js';
import { StateManager } from './state.js';
import { DOM } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export function renderChart(logs, checks) {
    const ctxCanvas = document.getElementById('balanceChart');
    if (!ctxCanvas || typeof Chart === 'undefined') return; // ガード節

    // フィルタボタンの更新（存在チェック付き）
    const filters = DOM.elements['chart-filters'] || document.getElementById('chart-filters');
    if(filters) {
        filters.querySelectorAll('button').forEach(btn => {
            const isActive = btn.dataset.range === StateManager.chartRange;
            btn.className = `px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                isActive ? "active-filter bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm" 
                         : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            }`;
        });
    }

    try {
        const now = dayjs();
        let cutoffDate = StateManager.chartRange === '1w' ? now.subtract(7, 'day').valueOf() :
                         StateManager.chartRange === '1m' ? now.subtract(30, 'day').valueOf() : 0;

        const allLogsSorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
        const allChecksSorted = [...checks].sort((a, b) => a.timestamp - b.timestamp);
        
        const fullHistoryMap = new Map();
        let runningKcalBalance = 0;
        const baseEx = Store.getBaseExercise();
        const userProfile = Store.getProfile();

        allLogsSorted.forEach(l => {
            const d = dayjs(l.timestamp);
            const k = d.format('M/D');
            
            if (!fullHistoryMap.has(k)) fullHistoryMap.set(k, {plusKcal:0, minusKcal:0, balKcal:0, weight:null, ts: l.timestamp});
            const e = fullHistoryMap.get(k);
            
            const kcal = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0, userProfile));
            if (kcal >= 0) e.plusKcal += kcal; else e.minusKcal += kcal;
            
            runningKcalBalance += kcal;
            e.balKcal = runningKcalBalance;
        });

        allChecksSorted.forEach(c => {
            const k = dayjs(c.timestamp).format('M/D');
            if (!fullHistoryMap.has(k)) {
                fullHistoryMap.set(k, {plusKcal:0, minusKcal:0, balKcal: runningKcalBalance, weight:null, ts: c.timestamp});
            }
            if (c.weight) fullHistoryMap.get(k).weight = parseFloat(c.weight);
        });

        let dataArray = Array.from(fullHistoryMap.entries()).map(([label, v]) => ({
            label,
            plus: Calc.convertKcalToMinutes(v.plusKcal, baseEx, userProfile),
            minus: Calc.convertKcalToMinutes(v.minusKcal, baseEx, userProfile),
            bal: Calc.convertKcalToMinutes(v.balKcal, baseEx, userProfile),
            weight: v.weight,
            ts: v.ts
        })).sort((a, b) => a.ts - b.ts);

        if (cutoffDate > 0) dataArray = dataArray.filter(d => d.ts >= cutoffDate);
        if (dataArray.length === 0) dataArray.push({label: now.format('M/D'), plus:0, minus:0, bal:0, weight:null});

        const validWeights = dataArray.map(d => d.weight).filter(w => typeof w === 'number' && !isNaN(w));
        let weightMin = 40, weightMax = 90;
        if (validWeights.length > 0) {
            weightMin = Math.floor(Math.min(...validWeights) - 2);
            weightMax = Math.ceil(Math.max(...validWeights) + 2);
        }

        if (StateManager.chart) StateManager.chart.destroy();
        
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#6b7280';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        const newChart = new Chart(ctxCanvas, {
            data: { 
                labels: dataArray.map(d => d.label), 
                datasets: [ 
                    { 
                        type: 'line', 
                        label: '体重 (kg)', 
                        data: dataArray.map(d => d.weight), 
                        borderColor: '#F59E0B', 
                        borderDash: [5, 5],
                        yAxisID: 'y1',
                        spanGaps: true,
                        order: 0 
                    },
                    { 
                        type: 'line', 
                        label: '累積残高', 
                        data: dataArray.map(d => d.bal), 
                        borderColor: '#4F46E5', 
                        tension: 0.3, 
                        fill: false, 
                        order: 1 
                    }, 
                    { 
                        type: 'bar', 
                        label: '返済', 
                        data: dataArray.map(d => d.plus), 
                        backgroundColor: '#10B981', 
                        stack: '0', 
                        order: 2 
                    }, 
                    { 
                        type: 'bar', 
                        label: '借金', 
                        data: dataArray.map(d => d.minus), 
                        backgroundColor: '#EF4444', 
                        stack: '0', 
                        order: 2 
                    } 
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: { 
                    x: { stacked: true }, 
                    y: { 
                        beginAtZero: true,
                        title: { display: true, text: `収支 (${baseEx}分)`, color: textColor },
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: weightMin,
                        max: weightMax,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '体重 (kg)', color: textColor },
                        ticks: { color: textColor }
                    }
                }, 
                plugins: { 
                    legend: { display: true, position: 'bottom', labels: { color: textColor } } 
                } 
            }
        });
        
        StateManager.setChart(newChart);

    } catch(e) { console.error('Chart Error', e); }
}