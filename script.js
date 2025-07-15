// Supabase 클라이언트 설정
const { createClient } = supabase;
const supabaseClient = createClient('https://qjftovamkqhxaenueood.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18');

// --- DOM 요소 ---
const locationInput = document.getElementById('location-input');
const barcodeInput = document.getElementById('barcode-input');
const locationSubmitButton = document.getElementById('location-submit-button');
const barcodeSubmitButton = document.getElementById('barcode-submit-button');
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

// --- 상태 변수 ---
let selectedChannelId = localStorage.getItem('selectedChannelId');
let selectedChannelName = localStorage.getItem('selectedChannelName');
let validLocations = [];
let currentScanData = [];
let currentProductForModal = null;


// --- 초기화 및 권한 확인 ---
(async () => {
    // 채널 선택 확인
    if (!selectedChannelId) {
        alert('채널이 선택되지 않았습니다. 채널 선택 페이지로 이동합니다.');
        window.location.href = 'index.html';
        return;
    }

    // 로그인 및 승인 상태 확인
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session || session.user.user_metadata.is_approved !== true) {
        alert('로그인이 필요하거나 승인되지 않은 계정입니다.');
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return;
    }

    // 초기 데이터 로드
    document.querySelector('header h1').textContent = `${selectedChannelName} 재고 실사`;
    await loadLocations();
    await updateProgress();
})();

// --- 함수 ---

// DB에서 모든 로케이션 정보를 불러와 Set에 저장 (페이지네이션 적용)
async function loadLocations() {
    console.log(`채널 ID [${selectedChannelId}]의 로케이션 정보를 불러옵니다...`);
    let allLocations = [];
    let page = 0;
    const pageSize = 1000;

    try {
        while (true) {
            const { data, error } = await supabaseClient
                .from('locations')
                .select('location_code')
                .eq('channel_id', selectedChannelId)
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;
            if (data.length > 0) allLocations = allLocations.concat(data);
            if (data.length < pageSize) break;
            page++;
        }
        validLocations = new Set(allLocations.map(location => location.location_code));
        console.log(`${validLocations.size}개의 로케이션 정보를 성공적으로 불러왔습니다.`);

    } catch (error) {
        console.error('로케이션 정보 로딩 실패:', error);
        setStatusMessage('로케이션 정보를 불러오는 데 실패했습니다.', 'error');
    }
}

// 실사 진행도 요약 정보 업데이트
async function updateProgress() {
    try {
        // ✅ [수정] 모든 데이터를 가져오도록 페이지네이션 로직 추가
        let allScans = [];
        let page = 0;
        const pageSize = 1000;

        while (true) {
            const { data: pageData, error: pageError } = await supabaseClient
                .from('inventory_scans')
                .select('expected_quantity, quantity')
                .eq('channel_id', selectedChannelId)
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (pageError) {
                throw pageError; // 오류 발생 시 반복 중단
            }

            if (pageData) {
                allScans = allScans.concat(pageData);
            }

            // 마지막 페이지에 도달하면 반복 종료
            if (!pageData || pageData.length < pageSize) {
                break;
            }
            
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


// 특정 로케이션의 스캔 데이터 불러오기
async function loadScanData(locationCode) {
    try {
        const { data, error } = await supabaseClient
            .from('inventory_scans')
            .select('*, products(*)')
            .eq('channel_id', selectedChannelId)
            .eq('location_code', locationCode)
            .order('created_at', { ascending: false });

        if (error) throw error;

        currentScanData = data;
        renderScanResults();
    } catch (error) {
        console.error(`${locationCode} 스캔 데이터 로딩 실패:`, error);
        setStatusMessage(`${locationCode}의 스캔 데이터를 불러오는 데 실패했습니다.`, 'error');
    }
}

// 스캔 결과 테이블 렌더링
function renderScanResults() {
    if (currentScanData.length === 0) {
        scanResultsContainer.innerHTML = '<div class="card" style="padding: 1rem; text-align: center; color: var(--text-secondary-color);">해당 로케이션에 스캔된 상품이 없습니다.</div>';
        return;
    }

    let tableHtml = `
        <table class="results-table">
            <thead>
                <tr>
                    <th>상품명</th>
                    <th>전산</th>
                    <th>실사</th>
                    <th>차이</th>
                </tr>
            </thead>
            <tbody>
    `;

    currentScanData.forEach(item => {
        const expected = item.expected_quantity || 0;
        const actual = item.quantity || 0;
        const difference = actual - expected;
        const diffClass = difference > 0 ? 'diff-plus' : (difference < 0 ? 'diff-minus' : '');
        
        tableHtml += `
            <tr data-barcode="${item.barcode}">
                <td>${item.products?.product_name || '알 수 없는 상품'}</td>
                <td style="text-align: center;">${expected}</td>
                <td style="text-align: center;">${actual}</td>
                <td style="text-align: center;" class="${diffClass}">${difference}</td>
            </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    scanResultsContainer.innerHTML = tableHtml;
}

// 상태 메시지 표시 및 오디오 재생
function setStatusMessage(message, type = 'info', playSound = true) {
    const p = statusMessage.querySelector('p');
    p.textContent = message;
    
    switch (type) {
        case 'success':
            p.style.color = 'green';
            if (playSound) new Audio('success.mp3').play();
            break;
        case 'error':
            p.style.color = 'red';
            if (playSound) new Audio('error.mp3').play();
            break;
        case 'info':
        default:
            p.style.color = 'blue';
            break;
    }
}

// 로케이션 처리
async function handleLocationSubmit() {
    const locationCode = locationInput.value.trim().toUpperCase();
    if (!locationCode) return;

    if (validLocations.has(locationCode)) {
        setStatusMessage(`${locationCode} 로케이션이 선택되었습니다.`, 'success');
        barcodeInput.disabled = false;
        barcodeInput.focus();
        await loadScanData(locationCode);
    } else {
        setStatusMessage(`'${locationCode}'는 유효하지 않은 로케이션입니다.`, 'error');
        locationInput.select();
    }
}

// 바코드 스캔 처리
async function handleBarcodeScan() {
    const scannedCode = barcodeInput.value.trim();
    if (!scannedCode) return;

    const locationCode = locationInput.value.trim().toUpperCase();

    try {
        const { data: product, error: productError } = await supabaseClient
            .from('products')
            .select('*')
            .eq('channel_id', selectedChannelId)
            .or(`barcode.eq.${scannedCode},product_code.eq.${scannedCode}`)
            .single();

        if (productError || !product) {
            setStatusMessage(`[${scannedCode}] 상품을 찾을 수 없습니다.`, 'error');
            return;
        }

        const { data: existingScan, error: scanError } = await supabaseClient
            .from('inventory_scans')
            .select('*')
            .eq('channel_id', selectedChannelId)
            .eq('location_code', locationCode)
            .eq('barcode', product.barcode)
            .single();

        if (scanError && scanError.code !== 'PGRST116') { // PGRST116: 'exact-one-row-not-found' - 정상적인 케이스
            throw scanError;
        }

        const quantityToAdd = multipleQuantityCheckbox.checked ? (parseInt(prompt('수량을 입력하세요:', '1'), 10) || 1) : 1;

        if (existingScan) {
            // 업데이트
            const newQuantity = existingScan.quantity + quantityToAdd;
            const { error: updateError } = await supabaseClient
                .from('inventory_scans')
                .update({ quantity: newQuantity, created_at: new Date().toISOString() })
                .eq('id', existingScan.id);
            if (updateError) throw updateError;
        } else {
            // 삽입
            const { error: insertError } = await supabaseClient
                .from('inventory_scans')
                .insert({
                    channel_id: selectedChannelId,
                    location_code: locationCode,
                    barcode: product.barcode,
                    quantity: quantityToAdd,
                    expected_quantity: 0
                });
            if (insertError) throw insertError;
        }
        
        setStatusMessage(`${product.product_name} | 수량: ${quantityToAdd} | 스캔 완료`, 'success');
        await loadScanData(locationCode);
        await updateProgress();

    } catch (error) {
        console.error('바코드 스캔 처리 중 오류:', error);
        setStatusMessage(`오류 발생: ${error.message}`, 'error');
    } finally {
        barcodeInput.value = '';
        if (!multipleQuantityCheckbox.checked) {
            barcodeInput.focus();
        }
    }
}

// --- 이벤트 리스너 ---

locationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleLocationSubmit();
    }
});
locationSubmitButton.addEventListener('click', handleLocationSubmit);

barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleBarcodeScan();
    }
});
barcodeSubmitButton.addEventListener('click', handleBarcodeScan);


// 로그아웃
logoutButton.addEventListener('click', async () => {
    if (confirm('로그아웃하시겠습니까?')) {
        await supabaseClient.auth.signOut();
        localStorage.removeItem('selectedChannelId');
        localStorage.removeItem('selectedChannelName');
        window.location.href = 'login.html';
    }
});

// 채널 변경
changeChannelButton.addEventListener('click', () => {
    if (confirm('채널 선택 화면으로 돌아가시겠습니까?')) {
        window.location.href = 'index.html';
    }
});

// 새로고침
refreshButton.addEventListener('click', async () => {
    setStatusMessage('데이터를 새로고침합니다...', 'info', false);
    const locationCode = locationInput.value.trim().toUpperCase();
    await loadLocations(); // 로케이션 목록 갱신
    if (locationCode && validLocations.has(locationCode)) {
        await loadScanData(locationCode);
    }
    await updateProgress();
    setStatusMessage('새로고침 완료.', 'success', false);
});

// 실사수량 초기화
resetQuantityButton.addEventListener('click', async () => {
    if (!confirm(`[${selectedChannelName}] 채널의 모든 실사수량을 0으로 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다!`)) return;

    try {
        const { error } = await supabaseClient
            .from('inventory_scans')
            .update({ quantity: 0 })
            .eq('channel_id', selectedChannelId);
        
        if (error) throw error;
        
        setStatusMessage('모든 실사수량이 0으로 초기화되었습니다.', 'success');
        const locationCode = locationInput.value.trim().toUpperCase();
        if (locationCode) {
            await loadScanData(locationCode);
        }
        await updateProgress();
    } catch (error) {
        console.error('초기화 실패:', error);
        setStatusMessage(`초기화 실패: ${error.message}`, 'error');
    }
});


// --- 모달 로직 ---
scanResultsContainer.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;

    const barcode = row.dataset.barcode;
    currentProductForModal = currentScanData.find(item => item.barcode === barcode);

    if (currentProductForModal) {
        modalProductName.textContent = currentProductForModal.products?.product_name || '알 수 없는 상품';
        modalBarcode.textContent = `바코드: ${barcode}`;
        modalQuantityInput.value = currentProductForModal.quantity;
        editModal.style.display = 'flex';
        modalQuantityInput.focus();
        modalQuantityInput.select();
    }
});

modalSaveButton.addEventListener('click', async () => {
    const newQuantity = parseInt(modalQuantityInput.value, 10);
    if (isNaN(newQuantity) || newQuantity < 0) {
        alert('유효한 숫자를 입력하세요.');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('inventory_scans')
            .update({ quantity: newQuantity, created_at: new Date().toISOString() })
            .eq('id', currentProductForModal.id);

        if (error) throw error;

        setStatusMessage(`${currentProductForModal.products?.product_name}의 수량이 ${newQuantity}(으)로 수정되었습니다.`, 'success');
        await loadScanData(locationInput.value.trim().toUpperCase());
        await updateProgress();
        editModal.style.display = 'none';

    } catch (error) {
        console.error('수량 수정 실패:', error);
        setStatusMessage(`수량 수정 실패: ${error.message}`, 'error');
    }
});

modalCancelButton.addEventListener('click', () => {
    editModal.style.display = 'none';
});

modalQuantityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        modalSaveButton.click();
    }
});

editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
        editModal.style.display = 'none';
    }
});