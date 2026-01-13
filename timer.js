import { APP, EXERCISE } from './constants.js';
import { StateManager } from './ui/index.js'; // ui/index.js経由でStateを参照
import { UI } from './ui/index.js';

// 保存処理を実行するためのハンドラ（外部から注入）
let _saveExerciseHandler = null;

// ハンドラ設定用関数
export const setTimerSaveHandler = (fn) => {
    _saveExerciseHandler = fn;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// 内部関数: タイマー表示更新
const updateTimeDisplay = () => { 
    const stStr = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    const accStr = localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
    let totalMs = 0;
    
    if (accStr) totalMs += parseInt(accStr, 10);
    if (stStr) totalMs += (Date.now() - parseInt(stStr, 10));

    const mm = Math.floor(totalMs / 60000).toString().padStart(2, '0');
    const ss = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '0');
    
    const display = document.getElementById('timer-display');
    if(display) display.textContent = `${mm}:${ss}`;
};

// 内部関数: ボタン表示更新
const updateButtons = (state) => {
    const startBtn = document.getElementById('start-stepper-btn');
    const manualBtn = document.getElementById('manual-record-btn');
    const pauseBtn = document.getElementById('pause-stepper-btn');
    const resumeBtn = document.getElementById('resume-stepper-btn');
    const stopBtn = document.getElementById('stop-stepper-btn');
    const statusText = document.getElementById('timer-status');
    
    [startBtn, manualBtn, pauseBtn, resumeBtn, stopBtn].forEach(el => el?.classList.add('hidden'));

    if (state === 'running') {
        pauseBtn?.classList.remove('hidden');
        stopBtn?.classList.remove('hidden');
        if(statusText) { 
            statusText.textContent = '計測中...'; 
            statusText.className = 'text-xs text-green-600 font-bold mb-1 animate-pulse'; 
        }
    } else if (state === 'paused') {
        resumeBtn?.classList.remove('hidden');
        stopBtn?.classList.remove('hidden');
        if(statusText) { 
            statusText.textContent = '一時停止中'; 
            statusText.className = 'text-xs text-yellow-500 font-bold mb-1'; 
        }
    } else { 
        startBtn?.classList.remove('hidden');
        manualBtn?.classList.remove('hidden');
        if(statusText) { 
            statusText.textContent = 'READY'; 
            statusText.className = 'text-xs text-gray-400 mt-1 font-medium'; 
        }
    }
};

export const Timer = {
    start: () => {
        if (StateManager.timerId) return;
        localStorage.setItem(APP.STORAGE_KEYS.TIMER_START, Date.now());
        updateButtons('running');
        updateTimeDisplay();
        StateManager.setTimerId(setInterval(updateTimeDisplay, 1000));
    },

    pause: () => {
        if (StateManager.timerId) {
            clearInterval(StateManager.timerId);
            StateManager.setTimerId(null);
        }
        const stStr = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
        if (stStr) {
            const currentSession = Date.now() - parseInt(stStr, 10);
            const prevAcc = parseInt(localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED) || '0', 10);
            localStorage.setItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED, prevAcc + currentSession);
            localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);
        }
        updateButtons('paused');
        updateTimeDisplay();
    },

    resume: () => {
        if (StateManager.timerId) return;
        localStorage.setItem(APP.STORAGE_KEYS.TIMER_START, Date.now());
        updateButtons('running');
        updateTimeDisplay();
        StateManager.setTimerId(setInterval(updateTimeDisplay, 1000));
    },

    stop: async () => {
        Timer.pause();
        const totalMs = parseInt(localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED) || '0', 10);
        const m = Math.round(totalMs / 60000);
        
        localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);
        localStorage.removeItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
        
        updateButtons('initial');
        const display = document.getElementById('timer-display');
        if (display) display.textContent = '00:00';
        
        if (m > 0) {
            if (_saveExerciseHandler) {
                const type = document.getElementById('exercise-select').value;
                await _saveExerciseHandler(type, m);
            } else {
                console.warn("Save handler not set for Timer.");
                UI.showMessage('保存処理が設定されていません', 'error');
            }
        } else {
            UI.showMessage('1分未満のため記録せず', 'error');
        }
    },

    // アプリ起動時の状態復元
    restoreState: () => {
        const st = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
        const acc = localStorage.getItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
        
        if (st) {
            const elapsed = Date.now() - parseInt(st, 10);
            // 24時間以上経過していたらリセット
            if (elapsed > ONE_DAY_MS) {
                localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);
                localStorage.removeItem(APP.STORAGE_KEYS.TIMER_ACCUMULATED);
                UI.showMessage('中断された古い計測をリセットしました', 'error');
                return false;
            }
            Timer.start();
            return true;
        } else if (acc) {
            updateButtons('paused');
            updateTimeDisplay();
            return true;
        }
        return false;
    }
};