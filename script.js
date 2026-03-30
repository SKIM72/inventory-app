// Supabase 클라이언트 설정
const { createClient } = supabase;
const supabaseClient = createClient('https://qjftovamkqhxaenueood.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18');

// --- DOM 요소 ---
const locationInput = document.getElementById('location-input');
const barcodeInput = document.getElementById('barcode-input');
const locationSubmitButton = document.getElementById('location-submit-button');
const barcodeSubmitButton = document.getElementById('barcode-submit-button');
const locationClearButton = document.getElementById('location-clear-button');
const barcodeClearButton = document.getElementById('barcode-clear-button');
const multipleQuantityCheckbox = document.getElementById('multiple-quantity-checkbox');
const statusMessage = document.getElementById('status-message');
const scanResultsContainer = document.getElementById('scan-results-container');
const totalExpectedEl = document.getElementById('total-expected');
const totalActualEl = document.getElementById('total-actual');
const progressPercentEl = document.getElementById('progress-percent');
const refreshButton = document.getElementById('refresh-button');
const resetQuantityButton = document.getElementById('reset-quantity-button');
const logoutButton = document.getElementById('logout-button');
const changeChannelButton = document.getElementById('change-channel-button');

// --- 수정 모달 ---
const editModal = document.getElementById('edit-modal');
const modalProductName = document.getElementById('modal-product-name');
const modalBarcode = document.getElementById('modal-barcode');
const modalQuantityInput = document.getElementById('modal-quantity-input');
const modalSaveButton = document.getElementById('modal-save-button');
const modalCancelButton = document.getElementById('modal-cancel-button');

// 복수 수량 입력 모달 요소
const quantityModal = document.getElementById('quantity-modal');
const quantityModalInput = document.getElementById('quantity-input');
const quantityConfirmButton = document.getElementById('quantity-confirm-button');
const quantityCancelButton = document.getElementById('quantity-cancel-button');

// --- 상태 변수 ---
let selectedChannelId = localStorage.getItem('selectedChannelId');
let selectedChannelName = localStorage.getItem('selectedChannelName');
let validLocations = [];
let currentScanData = [];
let currentProductForModal = null;
let productForQuantityModal = null;

// --- 초기화 및 권한 확인 ---
(async () => {
    if (!selectedChannelId) {
        alert('채널이 선택되지 않았습니다. 채널 선택 페이지로 이동합니다.');
        window.location.href = 'index.html';
        return;
    }

    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session || !session.user) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    
    if (session.user.user_metadata.is_approved !== true) {
        alert('승인되지 않은 계정입니다. 관리자에게 문의하세요.');
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return;
    }

    document.querySelector('header h1').textContent = `${selectedChannelName} 재고 실사`;
    await loadLocations();
    await updateProgress();
})();

// --- 함수 ---

async function loadLocations() {
    let allLocations = [];
    let page = 0;
    const pageSize = 1000;
    try {
        while (true) {
            const { data, error } = await supabaseClient.from('locations').select('location_code').eq('channel_id', selectedChannelId).range(page * pageSize, (page + 1) * pageSize - 1);
            if (error) throw error;
            if (data.length > 0) allLocations = allLocations.concat(data);
            if (data.length < pageSize) break;
            page++;
        }
        validLocations = new Set(allLocations.map(location => location.location_code));
    } catch (error) {
        console.error('로케이션 정보 로딩 실패:', error);
        setStatusMessage('로케이션 정보를 불러오는 데 실패했습니다.', 'error');
    }
}

async function updateProgress() {
    try {
        let allScans = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const { data: pageData, error: pageError } = await supabaseClient.from('inventory_scans').select('expected_quantity, quantity').eq('channel_id', selectedChannelId).is('deleted_at', null).range(page * pageSize, (page + 1) * pageSize - 1);
            if (pageError) throw pageError;
            if (pageData) allScans = allScans.concat(pageData);
            if (!pageData || pageData.length < pageSize) break;
            page++;
        }
        const totals = allScans.reduce((acc, item) => {
            acc.expected += item.expected_quantity || 0;
            acc.actual += item.quantity || 0;
            return acc;
        }, { expected: 0, actual: 0 });
        totalExpectedEl.textContent = totals.expected.toLocaleString();
        totalActualEl.textContent = totals.actual.toLocaleString();
        const progress = totals.expected > 0 ? (totals.actual / totals.expected * 100) : 0;
        progressPercentEl.textContent = `${progress.toFixed(2)}%`;
    } catch (error) {
        console.error('진행도 업데이트 실패:', error);
        totalExpectedEl.textContent = '오류';
        totalActualEl.textContent = '오류';
        progressPercentEl.textContent = '오류';
    }
}

async function loadScanData(locationCode) {
    try {
        // 새로 만든 RPC 함수를 호출하여 데이터를 조회합니다.
        const { data, error } = await supabaseClient.rpc('get_scan_data_for_location', {
            channel_id_param: selectedChannelId,
            location_code_param: locationCode
        });

        if (error) throw error;
        currentScanData = data;
        renderScanResults();
    } catch (error) {
        console.error(`${locationCode} 스캔 데이터 로딩 실패:`, error);
        setStatusMessage(`${locationCode}의 스캔 데이터를 불러오는 데 실패했습니다.`, 'error');
    }
}

function renderScanResults() {
    if (currentScanData.length === 0) {
        scanResultsContainer.innerHTML = '<div class="card" style="padding: 1rem; text-align: center; color: var(--text-secondary-color);">해당 로케이션에 스캔된 상품이 없습니다.</div>';
        return;
    }
    let tableHtml = `<table class="results-table"><thead><tr><th>상품명</th><th>상품코드</th><th>바코드</th><th>전산</th><th>실사</th><th>차이</th></tr></thead><tbody>`;
    currentScanData.forEach(item => {
        const expected = item.expected_quantity || 0;
        const actual = item.quantity || 0;
        const difference = actual - expected;
        const diffClass = difference > 0 ? 'diff-plus' : (difference < 0 ? 'diff-minus' : '');
        // 상품명 td의 불필요한 인라인 스타일을 제거했습니다.
        tableHtml += `<tr data-product-code="${item.product_code}"><td>${item.product_name || '알 수 없는 상품'}</td><td style="text-align: center;">${item.product_code || 'N/A'}</td><td style="text-align: center;">${item.barcode}</td><td style="text-align: center;">${expected}</td><td style="text-align: center;">${actual}</td><td style="text-align: center;" class="${diffClass}">${difference}</td></tr>`;
    });
    tableHtml += `</tbody></table>`;
    scanResultsContainer.innerHTML = tableHtml;
}

function setStatusMessage(message, type = 'info', playSound = true) {
    const p = statusMessage.querySelector('p');
    p.textContent = message;
    
    try {
        switch (type) {
            case 'success':
                p.parentElement.style.backgroundColor = '#e8f5e9';
                p.parentElement.style.color = 'var(--success-color)';
                if (playSound) new Audio('SoundFile.wav').play();
                break;
            case 'error':
                p.parentElement.style.backgroundColor = '#ffebee';
                p.parentElement.style.color = 'var(--danger-color)';
                if (playSound) new Audio('error.wav').play();
                break;
            case 'info':
            default:
                p.parentElement.style.backgroundColor = '#e3f2fd';
                p.parentElement.style.color = 'var(--primary-color)';
                break;
        }
    } catch (e) {
        console.error("오디오 재생 오류:", e);
    }
}

async function handleLocationSubmit() {
    const locationCode = locationInput.value.trim().toUpperCase();
    if (!locationCode) { 
        setStatusMessage('로케이션을 입력하세요.', 'error'); 
        return;
    }
    if (validLocations.has(locationCode)) {
        setStatusMessage(`[${locationCode}] 로케이션이 선택되었습니다.`, 'success', false);
        try {
            new Audio('locationscan.wav').play(); // 로케이션 스캔 성공 효과음 재생
        } catch (e) {
            console.error("오디오 재생 오류:", e);
        }
        barcodeInput.disabled = false;
        barcodeInput.focus();
        await loadScanData(locationCode);
    } else {
        setStatusMessage(`[${locationCode}]은 유효하지 않은 로케이션입니다.`, 'error');
        locationInput.select();
    }
}

async function processAndRecordScan(product, quantityToAdd) {
    const locationCode = locationInput.value.trim().toUpperCase();
    const productCode = product.product_code;

    try {
        const { data: existingScan, error: scanError } = await supabaseClient
            .from('inventory_scans')
            .select('id, quantity')
            .eq('channel_id', selectedChannelId)
            .eq('location_code', locationCode)
            .eq('product_code', productCode)
            .is('deleted_at', null)
            .maybeSingle();

        if (scanError) throw scanError;

        if (existingScan) {
            const newQuantity = existingScan.quantity + quantityToAdd;
            const { error: updateError } = await supabaseClient
                .from('inventory_scans')
                .update({ quantity: newQuantity, created_at: new Date().toISOString() })
                .eq('id', existingScan.id);
            
            if (updateError) throw updateError;

        } else {
            const { error: insertError } = await supabaseClient
                .from('inventory_scans')
                .insert({
                    channel_id: selectedChannelId,
                    location_code: locationCode,
                    product_code: productCode,
                    quantity: quantityToAdd,
                    expected_quantity: 0 
                });
            if (insertError) throw insertError;
        }
        
        setStatusMessage(`[${product.product_name}] | 수량: ${quantityToAdd} | 스캔 완료`, 'success');
        
        await loadScanData(locationCode);
        await updateProgress();

    } catch (error) {
        console.error('스캔 처리 중 오류:', error);
        setStatusMessage(`오류 발생: ${error.message}`, 'error');
    }
}

async function handleBarcodeScan() {
    const scannedCode = barcodeInput.value.trim();
    if (!scannedCode) { setStatusMessage('바코드를 입력하세요.', 'error'); return; }

    try {
        const { data: products, error: productError } = await supabaseClient
            .from('products')
            .select('*')
            .eq('channel_id', selectedChannelId)
            .or(`barcode.eq.${scannedCode},product_code.eq.${scannedCode}`)
            .limit(1);

        if (productError || !products || products.length === 0) {
            setStatusMessage(`[${scannedCode}] 상품을 찾을 수 없습니다.`, 'error');
            barcodeInput.value = '';
            barcodeInput.focus();
            return;
        }
        
        const product = products[0];

        if (multipleQuantityCheckbox.checked) {
            productForQuantityModal = product;
            quantityModal.style.display = 'flex';
            quantityModalInput.value = '';
            setTimeout(() => {
                quantityModalInput.focus();
            }, 100);
        } else {
            await processAndRecordScan(product, 1);
        }
    } catch (error) {
        console.error('상품 조회 중 오류:', error);
        setStatusMessage(`오류 발생: ${error.message}`, 'error');
    } finally {
        barcodeInput.value = '';
        if (!multipleQuantityCheckbox.checked) {
            barcodeInput.focus();
        }
    }
}

// --- 이벤트 리스너 ---
locationInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleLocationSubmit(); } });
locationSubmitButton.addEventListener('click', handleLocationSubmit);
barcodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeScan(); } });
barcodeSubmitButton.addEventListener('click', handleBarcodeScan);

locationClearButton.addEventListener('click', () => {
    locationInput.value = '';
    locationInput.focus();
});

barcodeClearButton.addEventListener('click', () => {
    barcodeInput.value = '';
    barcodeInput.focus();
});

logoutButton.addEventListener('click', async () => {
    if (confirm('로그아웃하시겠습니까?')) {
        await supabaseClient.auth.signOut();
        localStorage.removeItem('selectedChannelId');
        localStorage.removeItem('selectedChannelName');
        window.location.href = 'login.html';
    }
});

changeChannelButton.addEventListener('click', () => { if (confirm('채널 선택 화면으로 돌아가시겠습니까?')) { window.location.href = 'index.html'; } });

refreshButton.addEventListener('click', async () => {
    setStatusMessage('데이터를 새로고침합니다...', 'info', false);
    const locationCode = locationInput.value.trim().toUpperCase();
    await loadLocations();
    if (locationCode && validLocations.has(locationCode)) { await loadScanData(locationCode); }
    await updateProgress();
    setStatusMessage('새로고침 완료.', 'success', false);
});

resetQuantityButton.addEventListener('click', async () => {
    if (!confirm(`[${selectedChannelName}] 채널의 모든 실사수량을 0으로 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다!`)) return;
    try {
        const { error } = await supabaseClient.from('inventory_scans').update({ quantity: 0 }).eq('channel_id', selectedChannelId);
        if (error) throw error;
        setStatusMessage('모든 실사수량이 0으로 초기화되었습니다.', 'success');
        const locationCode = locationInput.value.trim().toUpperCase();
        if (locationCode) { await loadScanData(locationCode); }
        await updateProgress();
    } catch (error) {
        console.error('초기화 실패:', error);
        setStatusMessage(`초기화 실패: ${error.message}`, 'error');
    }
});

// --- 모달 로직 ---
scanResultsContainer.addEventListener('click', async (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const productCode = row.dataset.productCode;
    currentProductForModal = currentScanData.find(item => item.product_code === productCode);
    
    if (currentProductForModal) {
        // 모달의 기본 정보를 먼저 표시합니다.
        modalProductName.textContent = currentProductForModal.product_name || '알 수 없는 상품';
        modalQuantityInput.value = currentProductForModal.quantity;
        modalBarcode.textContent = `상품코드: ${productCode} | 전체 바코드 조회 중...`;
        editModal.style.display = 'flex';
        modalQuantityInput.focus();
        modalQuantityInput.select();

        try {
            // DB에서 해당 상품코드의 모든 바코드를 조회합니다.
            const { data: allProducts, error } = await supabaseClient
                .from('products')
                .select('barcode')
                .eq('channel_id', selectedChannelId)
                .eq('product_code', productCode);

            if (error) throw error;

            if (allProducts && allProducts.length > 0) {
                const barcodeList = allProducts.map(p => p.barcode).join(', ');
                modalBarcode.textContent = `상품코드: ${productCode} | 전체 바코드: ${barcodeList}`;
            } else {
                modalBarcode.textContent = `상품코드: ${productCode} | 바코드: ${currentProductForModal.barcode || 'N/A'}`;
            }
        } catch (dbError) {
            console.error("전체 바코드 조회 실패:", dbError);
            modalBarcode.textContent = `상품코드: ${productCode} | 바코드: ${currentProductForModal.barcode || 'N/A'} (목록 조회 실패)`;
        }
    }
});


modalSaveButton.addEventListener('click', async () => {
    const newQuantity = parseInt(modalQuantityInput.value, 10);
    if (isNaN(newQuantity) || newQuantity < 0) { alert('유효한 숫자를 입력하세요.'); return; }
    try {
        const { error } = await supabaseClient.from('inventory_scans').update({ quantity: newQuantity, created_at: new Date().toISOString() }).eq('id', currentProductForModal.id);
        if (error) throw error;
        setStatusMessage(`[${currentProductForModal.product_name}]의 수량이 ${newQuantity}으로 수정되었습니다.`, 'success');
        await loadScanData(locationInput.value.trim().toUpperCase());
        await updateProgress();
        editModal.style.display = 'none';
    } catch (error) {
        console.error('수량 수정 실패:', error);
        setStatusMessage(`수량 수정 실패: ${error.message}`, 'error');
    }
});

modalCancelButton.addEventListener('click', () => { editModal.style.display = 'none'; });
modalQuantityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); modalSaveButton.click(); } });
editModal.addEventListener('click', (e) => { if (e.target === editModal) { editModal.style.display = 'none'; } });

// 복수 수량 입력 모달 이벤트 리스너
quantityConfirmButton.addEventListener('click', async () => {
    const quantityToAdd = parseInt(quantityModalInput.value, 10);
    if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
        alert('1 이상의 유효한 숫자를 입력하세요.');
        return;
    }
    if (productForQuantityModal) {
        await processAndRecordScan(productForQuantityModal, quantityToAdd);
    }
    quantityModal.style.display = 'none';
    productForQuantityModal = null;
    barcodeInput.focus();
});

quantityCancelButton.addEventListener('click', () => {
    quantityModal.style.display = 'none';
    productForQuantityModal = null;
    barcodeInput.focus();
});

quantityModalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        quantityConfirmButton.click();
    }
});

quantityModal.addEventListener('click', (e) => {
    if (e.target === quantityModal) {
        quantityModal.style.display = 'none';
        productForQuantityModal = null;
        barcodeInput.focus();
    }
});