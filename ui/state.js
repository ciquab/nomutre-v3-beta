// 内部状態（直接アクセス禁止）
const _state = { 
    beerMode: 'mode1', 
    chart: null, 
    timerId: null,
    chartRange: '1w',
    isEditMode: false,
    heatmapOffset: 0,
    logLimit: 50,
    isLoadingLogs: false // 【追加】無限スクロール用フラグ
};

// 状態マネージャー
export const StateManager = {
    get beerMode() { return _state.beerMode; },
    get chart() { return _state.chart; },
    get timerId() { return _state.timerId; },
    get chartRange() { return _state.chartRange; },
    get isEditMode() { return _state.isEditMode; },
    get heatmapOffset() { return _state.heatmapOffset; },
    get logLimit() { return _state.logLimit; },
    get isLoadingLogs() { return _state.isLoadingLogs; },

    setBeerMode: (v) => { _state.beerMode = v; },
    setChart: (v) => { if(_state.chart) _state.chart.destroy(); _state.chart = v; },
    setTimerId: (v) => { _state.timerId = v; },
    setChartRange: (v) => { _state.chartRange = v; },
    setIsEditMode: (v) => { _state.isEditMode = v; }, // 名前統一 setEditMode -> setIsEditMode
    setHeatmapOffset: (v) => { _state.heatmapOffset = v; },
    
    incrementHeatmapOffset: () => { _state.heatmapOffset++; },
    decrementHeatmapOffset: () => { if(_state.heatmapOffset > 0) _state.heatmapOffset--; },
    
    // 無限スクロール用
    setLogLimit: (v) => { _state.logLimit = v; },
    incrementLogLimit: (v) => { _state.logLimit += v; },
    setLogLoading: (v) => { _state.isLoadingLogs = v; },
    
    toggleEditMode: () => { _state.isEditMode = !_state.isEditMode; return _state.isEditMode; }
};