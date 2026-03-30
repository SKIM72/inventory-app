// Supabase 클라이언트 설정
const SUPABASE_URL = 'https://lmlpbjosdygnpqcnrwuj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbHBiam9zZHlnbnBxY25yd3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MDA2NjgsImV4cCI6MjA2ODQ3NjY2OH0.Jt1Al2Sl44fSlRMAsvRw5cBuKfXcMzeYyzE774stBuQ';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 상태 변수 ---
let currentOrder = null;
let pickingItems = [];
let itemForModal = null;
let itemToEdit = null; // 수량 수정 모달용 아이템

// --- 유틸리티 함수 ---
function playSound(soundId) {
    const sound = document.getElementById(soundId);
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.error(`오디오 재생 오류 (${soundId}): ${e.message}`));
    }
}

// --- 핵심 로직 함수 ---

async function handleOrderSubmit() {
    const orderInput = document.getElementById('order-input');
    const barcodeInput = document.getElementById('barcode-input');
    const recipientInfoEl = document.getElementById('recipient-info');
    const addressInfoEl = document.getElementById('address-info');
    const pickingItemsContainer = document.getElementById('picking-items-container');
    const resetOrderButton = document.getElementById('reset-order-button');
    const refreshButton = document.getElementById('refresh-button');
    const selectedChannelId = localStorage.getItem('selectedChannelId');
    const orderNo = orderInput.value.trim();

    if (!orderNo) {
        setStatusMessage('출고지시번호를 입력하세요.', 'error');
        playSound('error-sound');
        return;
    }

    try {
        const { data: orderDataArray, error: orderError } = await supabaseClient.rpc('get_order_by_number_in_channel', {
            p_order_number: orderNo,
            p_channel_id: selectedChannelId
        });

        if (orderError) throw orderError;
        
        if (!orderDataArray || orderDataArray.length === 0) {
            throw new Error('해당 채널에 존재하지 않는 출고지시번호입니다.');
        }
        
        currentOrder = orderDataArray[0];
        playSound('orderscan-sound');
        
        recipientInfoEl.textContent = currentOrder.recipient || '수취인 정보 없음';
        addressInfoEl.textContent = currentOrder.destination_address || '';
        document.querySelector('header h1').textContent = `${localStorage.getItem('selectedChannelName')} / ${currentOrder.batch_date} / ${currentOrder.batch_number}차 검수`;
        resetOrderButton.style.display = 'inline-flex';
        refreshButton.style.display = 'inline-flex';

        await loadPickingItems();
        updateProgress();

        if (currentOrder.status === '완료') {
            setStatusMessage(`[${orderNo}] 검수가 완료된 주문입니다.`, 'success');
            barcodeInput.disabled = true;
        } else {
            setStatusMessage(`[${orderNo}] 검수를 시작합니다. 상품 바코드를 스캔하세요.`, 'info');
            barcodeInput.disabled = false;
            barcodeInput.focus();
        }

    } catch (error) {
        playSound('error-sound');
        setStatusMessage(error.message, 'error');
        currentOrder = null;
        pickingItems = [];
        if(pickingItemsContainer) pickingItemsContainer.innerHTML = '';
        if(recipientInfoEl) recipientInfoEl.textContent = '출고지시번호를 먼저 선택하세요.';
        if(addressInfoEl) addressInfoEl.textContent = '';
        document.querySelector('header h1').textContent = `${localStorage.getItem('selectedChannelName')} 출고 검수`;
        if(resetOrderButton) resetOrderButton.style.display = 'none';
        if(refreshButton) refreshButton.style.display = 'none';
        updateProgress();
    }
}

async function handleResetOrder() {
    if (!currentOrder) return;
    if (confirm('이 출고건의 모든 검수 내역을 초기화하시겠습니까?')) {
        try {
            await supabaseClient.from('picking_items').update({ picked_quantity: 0 }).eq('order_id', currentOrder.id);
            await supabaseClient.from('picking_orders').update({ total_picked_quantity: 0, status: '미검수' }).eq('id', currentOrder.id);
            setStatusMessage('검수 내역이 초기화되었습니다. 다시 조회합니다.', 'success');
            await handleOrderSubmit();
        } catch (error) {
            setStatusMessage(`초기화 실패: ${error.message}`, 'error');
            playSound('error-sound');
        }
    }
}

async function loadPickingItems() {
    if (!currentOrder) return;
    try {
        const { data, error } = await supabaseClient
            .from('picking_items')
            .select('*')
            .eq('order_id', currentOrder.id)
            .order('product_name');

        if (error) throw error;
        pickingItems = data;
        renderPickingItems();
    } catch (error) {
        setStatusMessage('상품 목록을 불러오는 데 실패했습니다.', 'error');
    }
}

function renderPickingItems() {
    const pickingItemsContainer = document.getElementById('picking-items-container');
    if (!pickingItemsContainer) return;
    if (pickingItems.length === 0) {
        pickingItemsContainer.innerHTML = '<div class="card" style="padding: 1rem; text-align: center;">검수할 상품이 없습니다.</div>';
        return;
    }

    let tableHtml = `
        <table class="items-table">
            <thead>
                <tr>
                    <th>상품명</th><th>바코드</th><th>지시수량</th><th>검수수량</th>
                </tr>
            </thead>
            <tbody>
    `;
    pickingItems.forEach(item => {
        const isCompleted = (item.picked_quantity || 0) >= item.expected_quantity;
        tableHtml += `
            <tr class="${isCompleted ? 'completed' : ''}" data-barcode="${item.barcode}">
                <td>${item.product_name || '이름 없음'}</td>
                <td style="text-align: center;">${item.barcode}</td>
                <td style="text-align: center;">${item.expected_quantity}</td>
                <td style="text-align: center;" class="item-progress">${item.picked_quantity || 0}</td>
            </tr>
        `;
    });
    tableHtml += `</tbody></table>`;
    pickingItemsContainer.innerHTML = tableHtml;
}

async function processQuantityUpdate(item, qtyToAdd) {
    const currentPicked = item.picked_quantity || 0;
    const expected = item.expected_quantity;

    if (currentPicked + qtyToAdd > expected) {
        alert('지시수량보다 많습니다.');
        playSound('error-sound');
        return;
    }
    try {
        const newPickedQty = currentPicked + qtyToAdd;
        await supabaseClient.from('picking_items').update({ picked_quantity: newPickedQty }).eq('id', item.id);
        const newTotalPicked = (currentOrder.total_picked_quantity || 0) + qtyToAdd;
        const newStatus = newTotalPicked >= currentOrder.total_expected_quantity ? '완료' : '검수중';
        const { data: updatedOrder } = await supabaseClient.from('picking_orders').update({ total_picked_quantity: newTotalPicked, status: newStatus }).eq('id', currentOrder.id).select().single();
        
        item.picked_quantity = newPickedQty;
        currentOrder.total_picked_quantity = updatedOrder.total_picked_quantity;
        currentOrder.status = updatedOrder.status;

        playSound('productscan-sound');
        setStatusMessage(`[${item.product_name}] ${qtyToAdd}개 검수 완료.`, 'success');
        updateProgress();
        renderPickingItems();
        
        if (currentOrder.status === '완료') handleOrderCompletion();
    } catch (error) {
        playSound('error-sound');
        setStatusMessage(`오류 발생: ${error.message}`, 'error');
    }
}

async function handleBarcodeScan() {
    const barcodeInput = document.getElementById('barcode-input');
    const multiQtyCheckbox = document.getElementById('multi-qty-checkbox');
    const scannedCode = barcodeInput.value.trim();

    if (!scannedCode || !currentOrder || currentOrder.status === '완료') {
        if (barcodeInput) barcodeInput.value = '';
        return;
    }

    const targetItem = pickingItems.find(item => item.barcode === scannedCode);

    if (!targetItem) {
        setStatusMessage(`[${scannedCode}] 이 주문에 없는 상품입니다.`, 'error');
        playSound('error-sound');
        if (barcodeInput) barcodeInput.select();
        return;
    }

    if ((targetItem.picked_quantity || 0) >= targetItem.expected_quantity) {
        setStatusMessage(`[${targetItem.product_name}] 이미 지시수량만큼 검수했습니다.`, 'error');
        playSound('error-sound');
        if (barcodeInput) barcodeInput.value = '';
        return;
    }

    if (multiQtyCheckbox.checked) {
        itemForModal = targetItem;
        document.getElementById('quantity-modal').style.display = 'flex';
        const quantityInput = document.getElementById('quantity-input');
        
        quantityInput.value = '';
        
        // ▼▼▼ [수정] PC 포커스 문제 해결 ▼▼▼
        setTimeout(() => {
            quantityInput.focus();
        }, 100); // 0.1초 후 포커스를 실행하여 렌더링 시간 확보
        // ▲▲▲ [수정] PC 포커스 문제 해결 ▲▲▲

    } else {
        await processQuantityUpdate(targetItem, 1);
    }
    
    if(barcodeInput) {
        barcodeInput.value = '';
        barcodeInput.focus();
    }
}

function handleOrderCompletion() {
    playSound('success-sound');
    document.getElementById('barcode-input').disabled = true;
    setStatusMessage(`[${currentOrder.order_number}] 모든 상품의 검수가 완료되었습니다!`, 'success');

    const orderInput = document.getElementById('order-input');
    orderInput.focus();
    orderInput.select();
}

function updateProgress() {
    const totalExpectedEl = document.getElementById('total-expected');
    const totalPickedEl = document.getElementById('total-picked');
    const progressPercentEl = document.getElementById('progress-percent');

    const expected = currentOrder ? currentOrder.total_expected_quantity : 0;
    const picked = currentOrder ? currentOrder.total_picked_quantity : 0;
    const progress = expected > 0 ? (picked / expected * 100) : 0;

    if(totalExpectedEl) totalExpectedEl.textContent = expected.toLocaleString();
    if(totalPickedEl) totalPickedEl.textContent = picked.toLocaleString();
    if(progressPercentEl) progressPercentEl.textContent = `${progress.toFixed(2)}%`;
}

function setStatusMessage(message, type = 'info') {
    const statusMessageEl = document.getElementById('status-message');
    if(statusMessageEl) {
        statusMessageEl.className = type;
        statusMessageEl.querySelector('p').textContent = message;
    }
}

async function handleItemRowClick(barcode) {
    if (!currentOrder || currentOrder.status === '완료') return;

    itemToEdit = pickingItems.find(item => item.barcode === barcode);
    if (!itemToEdit) return;

    const editModal = document.getElementById('edit-quantity-modal');
    document.getElementById('edit-modal-product-name').textContent = itemToEdit.product_name;
    document.getElementById('edit-modal-barcode').textContent = `바코드: ${itemToEdit.barcode}`;
    const editInput = document.getElementById('edit-quantity-input');
    editInput.value = itemToEdit.picked_quantity || 0;
    editInput.max = itemToEdit.expected_quantity;

    editModal.style.display = 'flex';
    editInput.focus();
    editInput.select();
}

async function handleSaveEditedQuantity() {
    const editInput = document.getElementById('edit-quantity-input');
    const newQuantity = parseInt(editInput.value, 10);

    if (!itemToEdit || isNaN(newQuantity) || newQuantity < 0) {
        alert('올바른 수량을 입력하세요.');
        return;
    }

    if (newQuantity > itemToEdit.expected_quantity) {
        alert('지시수량보다 많습니다.');
        return;
    }

    const oldQuantity = itemToEdit.picked_quantity || 0;
    const quantityChange = newQuantity - oldQuantity;

    try {
        await supabaseClient.from('picking_items').update({ picked_quantity: newQuantity }).eq('id', itemToEdit.id);

        const newTotalPicked = (currentOrder.total_picked_quantity || 0) + quantityChange;
        const newStatus = newTotalPicked >= currentOrder.total_expected_quantity ? '완료' : '검수중';
        const { data: updatedOrder } = await supabaseClient.from('picking_orders').update({ total_picked_quantity: newTotalPicked, status: newStatus }).eq('id', currentOrder.id).select().single();

        itemToEdit.picked_quantity = newQuantity;
        currentOrder.total_picked_quantity = updatedOrder.total_picked_quantity;
        currentOrder.status = updatedOrder.status;

        playSound('productscan-sound');
        setStatusMessage(`[${itemToEdit.product_name}] 수량이 ${newQuantity}(으)로 수정되었습니다.`, 'success');
        updateProgress();
        renderPickingItems();
        
        if (currentOrder.status === '완료') handleOrderCompletion();

    } catch (error) {
        playSound('error-sound');
        setStatusMessage(`수정 오류: ${error.message}`, 'error');
    } finally {
        document.getElementById('edit-quantity-modal').style.display = 'none';
        itemToEdit = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const selectedChannelId = localStorage.getItem('selectedChannelId');
    const selectedChannelName = localStorage.getItem('selectedChannelName');

    (async () => {
        if (!selectedChannelId) {
            alert('채널이 선택되지 않았습니다. 선택 페이지로 이동합니다.');
            window.location.href = 'index.html';
            return;
        }
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error || !session) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }
        const h1 = document.querySelector('header h1');
        if(h1) h1.textContent = `${selectedChannelName} 출고 검수`;
    })();

    const orderInput = document.getElementById('order-input');
    const orderSubmitButton = document.getElementById('order-submit-button');
    const barcodeInput = document.getElementById('barcode-input');
    const barcodeSubmitButton = document.getElementById('barcode-submit-button');
    const orderClearButton = document.getElementById('order-clear-button');
    const barcodeClearButton = document.getElementById('barcode-clear-button');
    const changeChannelButton = document.getElementById('change-channel-button');
    const logoutButton = document.getElementById('logout-button');
    const quantityModal = document.getElementById('quantity-modal');
    const quantityInput = document.getElementById('quantity-input');
    const modalConfirmButton = document.getElementById('modal-confirm-button');
    const modalCancelButton = document.getElementById('modal-cancel-button');
    const resetOrderButton = document.getElementById('reset-order-button');
    const refreshButton = document.getElementById('refresh-button');
    const pickingItemsContainer = document.getElementById('picking-items-container');
    const editQuantityModal = document.getElementById('edit-quantity-modal');
    const editModalSaveButton = document.getElementById('edit-modal-save-button');
    const editModalCancelButton = document.getElementById('edit-modal-cancel-button');
    const editQuantityInput = document.getElementById('edit-quantity-input');

    if(orderInput) orderInput.addEventListener('keydown', e => e.key === 'Enter' && handleOrderSubmit());
    if(orderSubmitButton) orderSubmitButton.addEventListener('click', handleOrderSubmit);
    if(barcodeInput) barcodeInput.addEventListener('keydown', e => e.key === 'Enter' && handleBarcodeScan());
    if(barcodeSubmitButton) barcodeSubmitButton.addEventListener('click', handleBarcodeScan);
    if(orderClearButton) {
        orderClearButton.addEventListener('click', () => {
            if(orderInput) {
                orderInput.value = '';
                orderInput.focus();
            }
        });
    }
    if(barcodeClearButton) {
        barcodeClearButton.addEventListener('click', () => {
            if(barcodeInput) {
                barcodeInput.value = '';
                barcodeInput.focus();
            }
        });
    }
    if(changeChannelButton) {
        changeChannelButton.addEventListener('click', () => {
            if (confirm('채널 선택 화면으로 돌아가시겠습니까? 현재 작업 내용은 저장되지 않습니다.')) {
                localStorage.removeItem('selectedChannelId');
                localStorage.removeItem('selectedChannelName');
                window.location.href = 'index.html';
            }
        });
    }
    if(logoutButton) {
        logoutButton.addEventListener('click', async () => {
            if (confirm('로그아웃하시겠습니까?')) {
                await supabaseClient.auth.signOut();
                localStorage.clear();
                window.location.href = 'login.html';
            }
        });
    }
    if(resetOrderButton) resetOrderButton.addEventListener('click', handleResetOrder);
    if(refreshButton) refreshButton.addEventListener('click', handleOrderSubmit);

    // 상품 수량 수정 기능 비활성화
    /*
    if (pickingItemsContainer) {
        pickingItemsContainer.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.barcode) {
                handleItemRowClick(row.dataset.barcode);
            }
        });
    }
    */

    if(modalConfirmButton) {
        modalConfirmButton.addEventListener('click', async () => {
            const qty = parseInt(quantityInput.value, 10);
            if (itemForModal && qty > 0) {
                await processQuantityUpdate(itemForModal, qty);
            }
            quantityModal.style.display = 'none';
            itemForModal = null;
            
            document.getElementById('barcode-input').focus();
        });
    }
    if(modalCancelButton) {
        modalCancelButton.addEventListener('click', () => {
            quantityModal.style.display = 'none';
            itemForModal = null;

            document.getElementById('barcode-input').focus();
        });
    }
    if(quantityInput) {
        quantityInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') modalConfirmButton.click();
        });
    }
    if(editModalSaveButton) editModalSaveButton.addEventListener('click', handleSaveEditedQuantity);
    if(editModalCancelButton) {
        editModalCancelButton.addEventListener('click', () => {
            editQuantityModal.style.display = 'none';
            itemToEdit = null;
        });
    }
    if(editQuantityInput) {
        editQuantityInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') editModalSaveButton.click();
        });
    }
});