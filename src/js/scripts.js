// === JAVASCRIPT ёпта ===
const DEFAULT_STATE = {
    isWorking: false,
    isPaused: false,
    totalWorkedMs: 0,
    lastResumeTime: null,
    sessionOrders: [],
    expenses: [],
    credit: { totalDebt: 2000000, monthlyGoal: 120000, monthlyPaid: 0, totalPaid: 0 }
};
let state = JSON.parse(localStorage.getItem('findel_v1')) || DEFAULT_STATE;

if (state.totalWorkedMs === undefined) state.totalWorkedMs = 0;
if (state.isPaused === undefined) state.isPaused = false;
if (state.isWorking && !state.lastResumeTime) {
    state.lastResumeTime = state.sessionStartTime || Date.now();
}
let selectedCategory = null;
let timerInterval = null;
const COMMISSION = 0.85; // Вычет 15%
function saveState() {
    localStorage.setItem('findel_v1', JSON.stringify(state));
}
function switchTab(tabId) {
    ['work', 'spend', 'status'].forEach(id => {
        document.getElementById(`section-${id}`).classList.add('hidden');
        document.getElementById(`nav-${id}`).classList.remove('text-orange-500', 'text-white');
        document.getElementById(`nav-${id}`).classList.add('text-gray-500');
    });
    document.getElementById(`section-${tabId}`).classList.remove('hidden');
    document.getElementById(`nav-${tabId}`).classList.remove('text-gray-500');
    document.getElementById(`nav-${tabId}`).classList.add('text-orange-500');
    if(tabId === 'status') updateStatusView();
}
// --- SWIPE ЛОГИКА ---
function initSwipe() {
    const container = document.getElementById('swipe-container');
    const thumb = document.getElementById('swipe-thumb');
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    const startDrag = (e) => {
        isDragging = true;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        thumb.style.transition = 'none';
    };
    const drag = (e) => {
        if (!isDragging) return;
        let clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        let maxDrag = container.offsetWidth - thumb.offsetWidth - 8;
        
        currentX = clientX - startX;
        if (currentX < 0) currentX = 0;
        if (currentX > maxDrag) currentX = maxDrag;
        
        thumb.style.transform = `translateX(${currentX}px)`;
    };
    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        let maxDrag = container.offsetWidth - thumb.offsetWidth - 8;
        thumb.style.transition = 'transform 0.3s ease';
        
        if (currentX > maxDrag * 0.8) {
            toggleSession();
        }
        currentX = 0;
        thumb.style.transform = `translateX(0px)`;
    };
    thumb.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    thumb.addEventListener('touchstart', startDrag, {passive: true});
    document.addEventListener('touchmove', drag, {passive: true});
    document.addEventListener('touchend', endDrag);
    
    updateSwipeUI();
}
function updateSwipeUI() {
    const container = document.getElementById('swipe-container');
    const text = document.getElementById('swipe-text');
    const icon = document.getElementById('swipe-icon');
    if (state.isWorking) {
        container.classList.replace('bg-white', 'bg-red-600');
        text.innerText = "ЗАКОНЧИТЬ СМЕНУ";
        text.classList.replace('text-black', 'text-white');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-stop');
    } else {
        container.classList.replace('bg-red-600', 'bg-white');
        text.innerText = "НАЧАТЬ СМЕНУ";
        text.classList.replace('text-white', 'text-black');
        icon.classList.remove('fa-stop');
        icon.classList.add('fa-chevron-right');
    }
}
// --- ЛОГИКА РАБОТЫ ---
function toggleSession() {
    const inputArea = document.getElementById('order-input-area');
    const actionBtns = document.getElementById('action-buttons');
    
    if (!state.isWorking) {
        state.isWorking = true;
        state.isPaused = false;
        state.totalWorkedMs = 0;
        state.lastResumeTime = Date.now();
        state.sessionOrders = [];
        
        inputArea.classList.remove('opacity-50', 'pointer-events-none');
        actionBtns.classList.remove('hidden');
        
        updatePauseBtnUI();
        startTimer();
        renderSessionOrders();
        if (navigator.vibrate) navigator.vibrate(100);
    } else {
        state.isWorking = false;
        state.isPaused = false;
        
        inputArea.classList.add('opacity-50', 'pointer-events-none');
        actionBtns.classList.add('hidden');
        
        stopTimer();
        updateWorkUI();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
    updateSwipeUI();
    saveState();
}
function togglePause() {
    if (!state.isWorking) return;
    if (state.isPaused) {
        state.isPaused = false;
        state.lastResumeTime = Date.now();
        startTimer();
    } else {
        state.isPaused = true;
        state.totalWorkedMs += (Date.now() - state.lastResumeTime);
        clearInterval(timerInterval);
        updateWorkUI();
    }
    updatePauseBtnUI();
    saveState();
}
function updatePauseBtnUI() {
    const btn = document.getElementById('btn-pause');
    if (state.isPaused) {
        btn.innerText = "ПРОДОЛЖИТЬ";
        btn.classList.replace('bg-neutral-900', 'bg-orange-600/20');
        btn.classList.replace('text-gray-400', 'text-orange-500');
        btn.classList.replace('border-neutral-800', 'border-orange-500/50');
    } else {
        btn.innerText = "ПАУЗА";
        btn.classList.replace('bg-orange-600/20', 'bg-neutral-900');
        btn.classList.replace('text-orange-500', 'text-gray-400');
        btn.classList.replace('border-orange-500/50', 'border-neutral-800');
    }
}
function addOrder() {
    if (state.isPaused) return;
    const input = document.getElementById('order-amount');
    const amount = parseInt(input.value);
    
    if (!amount || amount <= 0) return;
    // В память сохраняем полную сумму, чтобы не терять исходник
    state.sessionOrders.push({
        amount: amount,
        time: Date.now()
    });
    
    input.value = '';
    input.focus();
    
    if (navigator.vibrate) navigator.vibrate(50);
    
    saveState();
    updateWorkUI();
    renderSessionOrders();
}
function renderSessionOrders() {
    const list = document.getElementById('current-orders-list');
    list.innerHTML = '';
    const reversedOrders = [...state.sessionOrders].reverse();
    reversedOrders.forEach((order, index) => {
        const orderNum = state.sessionOrders.length - index;
        const date = new Date(order.time);
        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Отображаем сразу -15%
        const netAmount = Math.round(order.amount * COMMISSION);
        const html = `
            <div class="flex justify-between items-center bg-neutral-900/40 p-3 rounded-xl border border-neutral-800/50">
                <div class="flex items-center gap-3">
                    <span class="text-neutral-500 font-mono text-xs">#${orderNum}</span>
                    <span class="text-gray-300 text-sm">${timeStr}</span>
                </div>
                <span class="text-white font-bold font-display">${netAmount} ₸</span>
            </div>
        `;
        list.innerHTML += html;
    });
}
function updateWorkUI() {
    const rawTotal = state.sessionOrders.reduce((sum, order) => sum + order.amount, 0);
    const netTotal = Math.round(rawTotal * COMMISSION);
    
    document.getElementById('total-earned').innerText = netTotal;
    let rate = 0;
    let currentMs = 0;
    if (state.isWorking) {
        currentMs = state.totalWorkedMs;
        if (!state.isPaused && state.lastResumeTime) {
            currentMs += (Date.now() - state.lastResumeTime);
        }
        
        const hours = currentMs / 1000 / 3600;
        if (hours > 0.01) { 
            rate = Math.round(netTotal / hours);
        }
    }
    
    const rateEl = document.getElementById('hourly-rate');
    const glowEl = document.getElementById('rate-glow');
    rateEl.innerText = rate;
    rateEl.className = "font-display text-6xl font-bold transition-all duration-300"; 
    glowEl.className = "absolute inset-0 opacity-20 blur-xl transition-colors duration-500"; 
    if (rate >= 2500) {
        rateEl.classList.add('legendary-text'); 
        glowEl.classList.add('bg-purple-600', 'opacity-40');
    } else if (rate >= 2000) {
        rateEl.classList.add('text-green-500');
        glowEl.classList.add('bg-green-600');
    } else {
        rateEl.classList.add('text-white');
        glowEl.classList.add('bg-transparent');
    }
}
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!state.isWorking || state.isPaused) return;
        
        const currentMs = state.totalWorkedMs + (Date.now() - state.lastResumeTime);
        
        const h = Math.floor(currentMs / 3600000).toString().padStart(2, '0');
        const m = Math.floor((currentMs % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((currentMs % 60000) / 1000).toString().padStart(2, '0');
        
        document.getElementById('session-timer').innerText = `${h}:${m}:${s}`;
        updateWorkUI(); 
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    document.getElementById('session-timer').innerText = "00:00:00";
    document.getElementById('hourly-rate').innerText = "0";
    document.getElementById('total-earned').innerText = "0";
    
    document.getElementById('hourly-rate').className = "font-display text-6xl font-bold text-white transition-all duration-300";
    document.getElementById('rate-glow').className = "absolute inset-0 opacity-10 blur-xl bg-transparent";
    document.getElementById('current-orders-list').innerHTML = '';
}
// --- ВЫВОД (EXPORT) ---
function showExport() {
    if (!state.isWorking) return;
    // Считаем актуальные данные
    const rawTotal = state.sessionOrders.reduce((sum, order) => sum + order.amount, 0);
    const netTotal = Math.round(rawTotal * COMMISSION);
    let currentMs = state.totalWorkedMs;
    if (!state.isPaused && state.lastResumeTime) {
        currentMs += (Date.now() - state.lastResumeTime);
    }
    
    const hoursDecimal = currentMs / 1000 / 3600;
    const rate = hoursDecimal > 0.01 ? Math.round(netTotal / hoursDecimal) : 0;
    const h = Math.floor(currentMs / 3600000).toString().padStart(2, '0');
    const m = Math.floor((currentMs % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((currentMs % 60000) / 1000).toString().padStart(2, '0');
    const timeStr = `${h}:${m}:${s}`;
    
    const dateStr = new Date().toLocaleDateString('ru-RU');
    // Формируем Markdown таблицу
    const md = `| Дата | Чистыми | Время | Рейт |\n|---|---|---|---|\n| ${dateStr} | ${netTotal} ₸ | ${timeStr} | ${rate} ₸/ч |`;
    document.getElementById('export-text').value = md;
    
    const modal = document.getElementById('export-modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth; // Триггер анимации
    modal.classList.add('opacity-100');
}
function closeExport() {
    const modal = document.getElementById('export-modal');
    modal.classList.remove('opacity-100');
    setTimeout(() => modal.classList.add('hidden'), 300);
    document.getElementById('btn-copy').innerText = "КОПИРОВАТЬ";
    document.getElementById('btn-copy').classList.replace('bg-green-600', 'bg-blue-600');
}
function copyExport() {
    const textarea = document.getElementById('export-text');
    textarea.select();
    document.execCommand('copy');
    
    const btn = document.getElementById('btn-copy');
    btn.innerText = "СКОПИРОВАНО!";
    btn.classList.replace('bg-blue-600', 'bg-green-600');
}
// --- ЛОГИКА РАСХОДОВ И СТАТУСА ---
function selectCategory(catId, btnElement) {
    selectedCategory = catId;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('border-orange-500', 'bg-neutral-800', 'active');
        btn.querySelector('i').classList.remove('text-orange-400', 'text-blue-400', 'text-purple-400', 'text-red-400', 'text-pink-400', 'text-gray-200');
        btn.querySelector('i').classList.add('text-gray-400');
    });
    btnElement.classList.add('border-orange-500', 'bg-neutral-800', 'active');
    btnElement.querySelector('i').classList.remove('text-gray-400');
}
function saveExpense() {
    const amountInput = document.getElementById('expense-amount');
    const itemInput = document.getElementById('expense-item');
    
    const amount = parseInt(amountInput.value);
    const item = itemInput.value.trim() || "Без названия";
    if (!amount || !selectedCategory) return;
    const expense = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        amount: amount,
        category: selectedCategory,
        item: item
    };
    
    state.expenses.unshift(expense); 
    if (selectedCategory === 'credit') {
        state.credit.monthlyPaid += amount;
        state.credit.totalPaid += amount;
    }
    saveState();
    amountInput.value = '';
    itemInput.value = '';
    selectedCategory = null;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('border-orange-500', 'bg-neutral-800', 'active'));
    document.querySelectorAll('.cat-btn i').forEach(i => i.classList.add('text-gray-400'));
    
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
}
function updateStatusView() {
    const monthPct = Math.min((state.credit.monthlyPaid / state.credit.monthlyGoal) * 100, 100);
    const totalPct = Math.min((state.credit.totalPaid / state.credit.totalDebt) * 100, 100);
    document.getElementById('month-paid').innerText = state.credit.monthlyPaid.toLocaleString();
    document.getElementById('bar-month').style.width = `${monthPct}%`;
    document.getElementById('total-paid').innerText = state.credit.totalPaid.toLocaleString();
    document.getElementById('total-debt-val').innerText = state.credit.totalDebt.toLocaleString();
    document.getElementById('bar-total').style.width = `${totalPct}%`;
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    state.expenses.slice(0, 5).forEach(exp => {
        const isCredit = exp.category === 'credit';
        const iconClass = getIconForCat(exp.category);
        
        const html = `
            <div class="flex justify-between items-center bg-neutral-900/50 p-3 rounded-xl border border-white/5">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-gray-400">
                        <i class="${iconClass} text-xs"></i>
                    </div>
                    <div>
                        <div class="text-white text-sm font-medium">${exp.item}</div>
                        <div class="text-xs text-gray-500 capitalize">${exp.category}</div>
                    </div>
                </div>
                <div class="font-display font-bold ${isCredit ? 'text-green-400' : 'text-white'}">
                    ${isCredit ? '+' : '-'}${exp.amount}
                </div>
            </div>
        `;
        list.innerHTML += html;
    });
}
function getIconForCat(cat) {
    const map = {
        'food': 'fa-solid fa-burger',
        'bike': 'fa-solid fa-motorcycle',
        'family': 'fa-solid fa-house-chimney',
        'credit': 'fa-solid fa-file-invoice-dollar',
        'subs': 'fa-solid fa-wifi',
        'other': 'fa-solid fa-ghost'
    };
    return map[cat] || 'fa-solid fa-circle';
}
function clearAllData() {
    if(confirm("Точно удалить все данные? Это необратимо.")) {
        localStorage.removeItem('findel_v1');
        location.reload();
    }
}
function init() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('clock').innerText = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }, 1000);
    initSwipe();
    if (state.isWorking) {
        document.getElementById('order-input-area').classList.remove('opacity-50', 'pointer-events-none');
        document.getElementById('action-buttons').classList.remove('hidden');
        updatePauseBtnUI();
        startTimer();
        updateWorkUI();
        renderSessionOrders();
    }
}
init();
