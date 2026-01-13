/* ==========================================================================
   Global Error Handling
   ========================================================================== */

/**
 * エラーオーバーレイを表示する
 * @param {string} msg - エラーメッセージ
 * @param {string} source - エラー発生元ファイル
 * @param {number} lineno - 行番号
 */
export const showErrorOverlay = (msg, source, lineno) => {
    const overlay = document.getElementById('global-error-overlay');
    const details = document.getElementById('error-details');
    
    if (overlay && details) {
        const now = new Date().toLocaleString();
        const errText = `[${now}]\nMessage: ${msg}\nSource: ${source}:${lineno}\nUA: ${navigator.userAgent}`;
        
        details.textContent = errText;
        overlay.classList.remove('hidden');
        
        const copyBtn = document.getElementById('btn-copy-error');
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(errText)
                    .then(() => alert('エラーログをコピーしました'))
                    .catch(() => alert('コピーに失敗しました'));
            };
        }
    }
    console.error('Global Error Caught:', msg);
};

/**
 * グローバルエラーリスナーの初期化
 */
export const initErrorHandler = () => {
    window.onerror = function(msg, source, lineno, colno, error) {
        showErrorOverlay(msg, source, lineno);
        return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
        showErrorOverlay(`Unhandled Promise Rejection: ${event.reason}`, 'Promise', 0);
    });
};