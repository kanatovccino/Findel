// === JAVASCRIPT ===
const DEFAULT_STATE = {
    isWorking: false,
    isPaused: false,
    totalWorkedMs: 0,
    lastResumeTime: null,
    targetOrders: null,
    sessionOrders: [],
    expenses: [],
    pastSessions: []
};

let state = JSON.parse(localStorage.getItem('findel_v1')) || DEFAULT_STATE;

if (state.totalWorkedMs === undefined) state.totalWorkedMs = 0;
if (state.isPaused === undefined) state.isPaused = false;
if (state.targetOrders === undefined) state.targetOrders = null;
if (!state.pastSessions) state.pastSessions = [];
if (!state.expenses) state.expenses = [];
if (state.isWorking && !state.lastResumeTime) {
    state.lastResumeTime = state.sessionStartTime || Date.now();
}

let selectedCategory = null;
let timerInterval = null;
let pendingResetType = null;
const COMMISSION = 0.85;

const CATEGORY_MAP = { 
    'groceries': { icon: 'fa-basket-shopping', label: 'Продукты' }, 
    'family': { icon: 'fa-people-roof', label: 'Семья' }, 
    'courier': { icon: 'fa-box', label: 'Курьерка' }, 
    'subs': { icon: 'fa-rotate-right', label: 'Подписки' }, 
    'force_majeure': { icon: 'fa-triangle-exclamation', label: 'Форс-мажор' },
    'transport': { icon: 'fa-car', label: 'Транспорт' },
    'charity': { icon: 'fa-cat', label: 'Благотворительность' },
    'credit': { icon: 'fa-file-invoice-dollar', label: 'Кредит' },
    'other': { icon: 'fa-ghost', label: 'Хаос' }
};

// ХЕЛПЕР: сохранение стейта
function saveState() {
    localStorage.setItem('findel_v1', JSON.stringify(state));
}

// ХЕЛПЕР: форматирование времени (вместо дублирования кода)
function formatTime(ms) {
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ХЕЛПЕР: получить актуальные миллисекунды текущей смены
function getCurrentMs() {
    let currentMs = state.totalWorkedMs;
    if (state.isWorking && !state.isPaused && state.lastResumeTime) {
        currentMs += (Date.now() - state.lastResumeTime);
    }
    return currentMs;
}

function switchTab(tabId) {
    ['work', 'spend', 'status'].forEach(id => {
        document.getElementById(`section-${id}`).classList.add('hidden');
        document.getElementById(`nav-${id}`).classList.remove('text-green-500', 'text-white');
        document.getElementById(`nav-${id}`).classList.add('text-gray-500');
    });
    document.getElementById(`section-${tabId}`).classList.remove('hidden');
    document.getElementById(`nav-${tabId}`).classList.remove('text-gray-500');
    document.getElementById(`nav-${tabId}`).classList.add('text-green-500');
    if(tabId === 'status') updateStatusView();
}

// === SWIPE LOGIC ===
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
    const text = document.getElementById('swipe-text');
    const icon = document.getElementById('swipe-icon');
    if (state.isWorking) {
        text.innerText = "ЗАКОНЧИТЬ СМЕНУ";
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-stop');
    } else {
        text.innerText = "НАЧАТЬ СМЕНУ";
        icon.classList.remove('fa-stop');
        icon.classList.add('fa-chevron-right');
    }
}

// === WORK LOGIC ===
function updatePauseBtnUI() {
    const btn = document.getElementById('btn-pause');
    const icon = document.getElementById('pause-icon');
    
    if (!state.isWorking) {
        btn.className = "w-16 h-14 shrink-0 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center transition-colors tap-effect";
        icon.className = "fa-solid fa-pause text-gray-600 text-xl";
        return;
    }
    
    if (state.isPaused) {
        btn.className = "w-16 h-14 shrink-0 rounded-2xl bg-green-600/20 border border-green-500/50 flex items-center justify-center transition-colors tap-effect";
        icon.className = "fa-solid fa-play text-green-500 text-xl pl-1";
    } else {
        btn.className = "w-16 h-14 shrink-0 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center transition-colors tap-effect";
        icon.className = "fa-solid fa-pause text-white text-xl";
    }
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

function toggleSession() {
    const inputArea = document.getElementById('order-input-area');
    
    if (!state.isWorking) {
        state.isWorking = true;
        state.isPaused = false;
        state.totalWorkedMs = 0;
        state.lastResumeTime = Date.now();
        state.sessionOrders = [];
        state.targetOrders = null; 
        
        inputArea.classList.remove('opacity-50', 'pointer-events-none');
        
        updatePauseBtnUI();
        startTimer();
        renderSessionOrders();
        if (navigator.vibrate) navigator.vibrate(100);
    } else {
        const rawTotal = state.sessionOrders.reduce((sum, order) => sum + order.amount, 0);
        const netTotal = Math.floor(rawTotal * COMMISSION);
        
        const currentMs = getCurrentMs();
        const hoursDecimal = currentMs / 1000 / 3600;
        const rate = hoursDecimal > 0.01 ? Math.floor(netTotal / hoursDecimal) : 0;
        
        const sessionRecord = {
            id: Date.now(),
            date: new Date().toLocaleDateString('ru-RU'),
            netTotal: netTotal,
            timeStr: formatTime(currentMs),
            rate: rate,
            orderCount: state.sessionOrders.length
        };

        if (state.sessionOrders.length > 0 || currentMs > 60000) {
            state.pastSessions.push(sessionRecord);
        }

        state.isWorking = false;
        state.isPaused = false;
        state.totalWorkedMs = 0;
        state.lastResumeTime = null;
        state.sessionOrders = [];
        state.targetOrders = null; 
        
        inputArea.classList.add('opacity-50', 'pointer-events-none');
        
        stopTimer();
        updateWorkUI();
        updatePauseBtnUI();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
    updateSwipeUI();
    saveState();
}

function addOrder() {
    if (state.isPaused) return;
    const input = document.getElementById('order-amount');
    const amount = parseInt(input.value);
    
    if (!amount || amount <= 0) return;
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
    
    // Оптимизация: собираем HTML один раз через map().join('')
    list.innerHTML = [...state.sessionOrders].reverse().map((order, index) => {
        const orderNum = state.sessionOrders.length - index;
        const timeStr = new Date(order.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const netAmount = Math.floor(order.amount * COMMISSION);
        
        return `
            <div class="flex justify-between items-center bg-neutral-900/40 p-3 rounded-xl border border-neutral-800/50">
                <div class="flex items-center gap-3">
                    <span class="text-neutral-500 font-mono text-xs">#${orderNum}</span>
                    <span class="text-gray-300 text-sm">${timeStr}</span>
                </div>
                <span class="text-white font-bold font-display">${netAmount} ₸</span>
            </div>
        `;
    }).join('');
}

function updateWorkUI() {
    const rawTotal = state.sessionOrders.reduce((sum, order) => sum + order.amount, 0);
    const netTotal = Math.floor(rawTotal * COMMISSION);
    
    document.getElementById('total-earned').innerText = netTotal;
    let rate = 0;
    
    if (state.isWorking) {
        const hours = getCurrentMs() / 1000 / 3600;
        if (hours > 0.01) { 
            rate = Math.floor(netTotal / hours);
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

    const leftEl = document.getElementById('orders-left');
    if (state.targetOrders !== null && state.targetOrders > 0) {
        const left = Math.max(0, state.targetOrders - state.sessionOrders.length);
        leftEl.innerText = left;
    } else {
        leftEl.innerText = '~';
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!state.isWorking || state.isPaused) return;
        document.getElementById('session-timer').innerText = formatTime(getCurrentMs());
        updateWorkUI(); 
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    document.getElementById('session-timer').innerText = "00:00:00";
    document.getElementById('hourly-rate').innerText = "0";
    document.getElementById('total-earned').innerText = "0";
    document.getElementById('orders-left').innerText = "~";
    
    document.getElementById('hourly-rate').className = "font-display text-6xl font-bold text-white transition-all duration-300";
    document.getElementById('rate-glow').className = "absolute inset-0 opacity-10 blur-xl bg-transparent";
    document.getElementById('current-orders-list').innerHTML = '';
}

function copySessionsMD() {
    if (!state.pastSessions || state.pastSessions.length === 0) return;

    let md = "| Дата | Чистыми | Время | Доставки | Рейт |\n|---|---|---|---|---|\n";
    [...state.pastSessions].reverse().forEach(sess => {
        const ordersStr = sess.orderCount !== undefined ? sess.orderCount : 0;
        md += `| ${sess.date} | ${sess.netTotal} ₸ | ${sess.timeStr} | ${ordersStr} | ${sess.rate} ₸/ч |\n`;
    });
    
    const textarea = document.getElementById('hidden-copy-area');
    textarea.value = md;
    textarea.classList.remove('hidden');
    textarea.select();
    document.execCommand('copy');
    textarea.classList.add('hidden');
    
    const btn = document.getElementById('btn-copy-sessions');
    btn.innerHTML = '<i class="fa-solid fa-check text-green-500 text-lg"></i>';
    
    setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-copy text-lg"></i>';
    }, 2000);
}

// === ДАННЫЕ СМЕНЫ ===
function openDataSection() {
    document.getElementById('section-data').classList.remove('hidden');
    document.getElementById('section-data').classList.add('flex');
    document.getElementById('target-orders-input').value = state.targetOrders || '';
    renderEditOrders();
}

function closeDataSection() {
    document.getElementById('section-data').classList.add('hidden');
    document.getElementById('section-data').classList.remove('flex');
}

function setTargetOrders(val) {
    const num = parseInt(val);
    state.targetOrders = (isNaN(num) || num <= 0) ? null : num;
    saveState();
    updateWorkUI();
}

function renderEditOrders() {
    const list = document.getElementById('data-orders-list');
    
    if (state.sessionOrders.length === 0) {
        list.innerHTML = '<p class="text-neutral-500 text-center mt-10 text-sm">Нет заказов в текущей смене</p>';
        return;
    }

    // Оптимизация
    list.innerHTML = [...state.sessionOrders].reverse().map((order, index) => {
        const realIndex = state.sessionOrders.length - 1 - index;
        const timeStr = new Date(order.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        return `
            <div class="flex items-center gap-3 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
                <span class="text-neutral-500 font-mono text-xs w-6">#${state.sessionOrders.length - index}</span>
                <span class="text-gray-400 text-xs w-10">${timeStr}</span>
                <input type="number" value="${order.amount}" onchange="editOrder(${realIndex}, this.value)" class="flex-1 bg-neutral-800 text-white font-display font-bold p-2 rounded-lg text-right focus:ring-2 focus:ring-green-500 outline-none w-full" inputmode="numeric">
                <button onclick="deleteOrder(${realIndex})" class="w-8 h-8 flex items-center justify-center text-red-500/50 hover:text-red-500 transition-colors tap-effect">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
}

function editOrder(realIndex, newVal) {
    const val = parseInt(newVal) || 0;
    if (val >= 0) {
        state.sessionOrders[realIndex].amount = val;
        saveState();
        if (state.isWorking) {
            updateWorkUI();
            renderSessionOrders();
        }
    }
}

function deleteOrder(realIndex) {
    if(confirm("Удалить этот заказ?")) {
        state.sessionOrders.splice(realIndex, 1);
        saveState();
        if (state.isWorking) {
            updateWorkUI();
            renderSessionOrders();
        }
        renderEditOrders();
    }
}

// === РАСХОДЫ И СТАТУС ===
function selectCategory(catId, btnElement) {
    if (selectedCategory === catId) {
        selectedCategory = null;
        btnElement.classList.remove('active');
    } else {
        selectedCategory = catId;
        document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }
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
    saveState();
    
    amountInput.value = '';
    itemInput.value = '';
    selectedCategory = null;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
}

function updateStatusView() {
    const psList = document.getElementById('past-sessions-list');
    
    // Оптимизация
    if(!state.pastSessions || state.pastSessions.length === 0) {
        psList.innerHTML = '<p class="text-xs text-neutral-600">Нет завершенных смен</p>';
    } else {
        psList.innerHTML = [...state.pastSessions].reverse().map(sess => {
            const ordersStr = sess.orderCount !== undefined ? sess.orderCount : 0;
            return `
                <div class="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 flex justify-between items-center">
                    <div>
                        <div class="text-white font-bold font-display text-lg">${sess.netTotal} ₸</div>
                        <div class="text-[10px] text-gray-500">${sess.date} • ${sess.timeStr} • ${ordersStr} дост.</div>
                    </div>
                    <div class="text-green-500 font-mono text-sm font-bold bg-green-500/10 px-2 py-1 rounded-lg">${sess.rate} ₸/ч</div>
                </div>
            `;
        }).join('');
    }

    const list = document.getElementById('history-list');
    
    // Оптимизация
    if (state.expenses.length === 0) {
        list.innerHTML = '<tr><td colspan="3" class="p-4 text-xs text-neutral-600 text-center">Нет записанных трат</td></tr>';
    } else {
        list.innerHTML = state.expenses.slice(0, 20).map(exp => {
            const catInfo = CATEGORY_MAP[exp.category] || CATEGORY_MAP['other'];
            return `
                <tr class="transition-colors hover:bg-white/5">
                    <td class="p-3 text-center align-middle">
                        <div class="w-8 h-8 rounded-full bg-neutral-800 inline-flex items-center justify-center text-gray-400" title="${catInfo.label}">
                            <i class="fa-solid ${catInfo.icon} text-xs"></i>
                        </div>
                    </td>
                    <td class="p-3 align-middle overflow-hidden">
                        <div class="text-white text-sm font-medium break-words whitespace-normal line-clamp-3">${exp.item}</div>
                    </td>
                    <td class="p-3 text-right align-middle">
                        <div class="font-display font-bold text-white whitespace-nowrap">
                            -${exp.amount}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// === РЕДАКТОР ТРАТ ===
function openExpensesEdit() {
    document.getElementById('section-expenses-edit').classList.remove('hidden');
    document.getElementById('section-expenses-edit').classList.add('flex');
    renderExpensesEditList();
}

function closeExpensesEdit() {
    document.getElementById('section-expenses-edit').classList.add('hidden');
    document.getElementById('section-expenses-edit').classList.remove('flex');
    
    const copyBtn = document.getElementById('btn-copy-md');
    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    copyBtn.classList.remove('text-green-500');
    copyBtn.classList.add('text-white');
}

function renderExpensesEditList() {
    const list = document.getElementById('expenses-edit-list');
    
    if (state.expenses.length === 0) {
        list.innerHTML = '<p class="text-neutral-500 text-center mt-10 text-sm">Траты пусты</p>';
        return;
    }

    // Оптимизация
    list.innerHTML = state.expenses.map((exp, index) => {
        const catInfo = CATEGORY_MAP[exp.category] || CATEGORY_MAP['other'];
        return `
            <div class="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center bg-neutral-900/60 p-3 rounded-xl border border-neutral-800">
                <div class="w-6 flex justify-center text-gray-400" title="${catInfo.label}">
                    <i class="fa-solid ${catInfo.icon} text-sm"></i>
                </div>
                <input type="text" value="${exp.item}" onchange="editExpenseItem(${index}, this.value)" class="bg-transparent text-white text-xs w-full outline-none border-b border-transparent focus:border-green-500/50 transition-colors pb-1">
                <input type="number" value="${exp.amount}" onchange="editExpenseAmount(${index}, this.value)" class="bg-transparent text-white font-display font-bold text-right w-16 outline-none border-b border-transparent focus:border-green-500/50 transition-colors pb-1" inputmode="numeric">
                <button onclick="deleteExpense(${index})" class="text-red-500/50 hover:text-red-500 w-6 flex justify-center items-center tap-effect">
                    <i class="fa-solid fa-trash text-sm"></i>
                </button>
            </div>
        `;
    }).join('');
}

function editExpenseItem(index, val) {
    if (state.expenses[index]) {
        state.expenses[index].item = val;
        saveState();
        updateStatusView();
    }
}

function editExpenseAmount(index, val) {
    const num = parseInt(val);
    if (state.expenses[index] && !isNaN(num) && num > 0) {
        state.expenses[index].amount = num;
        saveState();
        updateStatusView();
    }
}

function deleteExpense(index) {
    if(confirm("Удалить эту трату?")) {
        state.expenses.splice(index, 1);
        saveState();
        updateStatusView();
        renderExpensesEditList();
    }
}

function copyExpensesMD() {
    let md = "| Категория | Комментарий | Сумма |\n|---|---|---|\n";
    state.expenses.forEach(exp => {
        const catInfo = CATEGORY_MAP[exp.category] || CATEGORY_MAP['other'];
        md += `| ${catInfo.label} | ${exp.item || '-'} | ${exp.amount} ₸ |\n`;
    });
    
    const textarea = document.getElementById('hidden-copy-area');
    textarea.value = md;
    textarea.classList.remove('hidden');
    textarea.select();
    document.execCommand('copy');
    textarea.classList.add('hidden');
    
    const btn = document.getElementById('btn-copy-md');
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    btn.classList.remove('text-white');
    btn.classList.add('text-green-500');
    
    setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        btn.classList.remove('text-green-500');
        btn.classList.add('text-white');
    }, 2000);
}

// === УПРАВЛЕНИЕ ДАННЫМИ (СБРОС) ===
function toggleResetMenu() {
    const menu = document.getElementById('reset-menu');
    menu.classList.toggle('hidden');
    menu.classList.toggle('flex');
}

function requestReset(type) {
    pendingResetType = type;
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth; 
    modal.classList.add('opacity-100');
}

function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('opacity-100');
    setTimeout(() => modal.classList.add('hidden'), 300);
    pendingResetType = null;
}

function executeReset() {
    if (pendingResetType === 'sessions') {
        state.pastSessions = [];
    } else if (pendingResetType === 'expenses') {
        state.expenses = [];
    }
    
    saveState();
    updateStatusView();
    closeConfirmModal();
    
    const menu = document.getElementById('reset-menu');
    menu.classList.add('hidden');
    menu.classList.remove('flex');
}

// === ИНИЦИАЛИЗАЦИЯ ===
function init() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('clock').innerText = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }, 1000);
    
    initSwipe();
    updatePauseBtnUI(); 
    
    if (state.isWorking) {
        document.getElementById('order-input-area').classList.remove('opacity-50', 'pointer-events-none');
        startTimer();
        updateWorkUI();
        renderSessionOrders();
    }
}
init();