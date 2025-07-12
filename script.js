const { createClient } = supabase;
const supabaseClient = createClient('https://qjftovamkqhxaenueood.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18');

// 로그인 상태 확인
(async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session || session.user.user_metadata.is_approved !== true) {
        await supabaseClient.auth.signOut();
        alert('로그인이 필요하거나, 승인되지 않은 계정입니다.');
        window.location.href = 'login.html';
    }
})();

// 로컬 스토리지에서 선택된 채널 정보 가져오기
const selectedChannelId = localStorage.getItem('selectedChannelId');
const selectedChannelName = localStorage.getItem('selectedChannelName');

// 채널 정보가 없으면 선택 페이지로 강제 이동
if (!selectedChannelId) {
    alert('채널이 선택되지 않았습니다. 채널 선택 페이지로 이동합니다.');
    window.location.href = 'index.html'; 
}

// HTML 요소 가져오기
const locationInput = document.getElementById('location-input');
const locationSubmitButton = document.getElementById('location-submit-button');
const barcodeInput = document.getElementById('barcode-input');
const barcodeSubmitButton = document.getElementById('barcode-submit-button');
const multipleQuantityCheckbox = document.getElementById('multiple-quantity-checkbox');
const resetButton = document.getElementById('reset-quantity-button');
const refreshButton = document.getElementById('refresh-button');
const changeChannelButton = document.getElementById('change-channel-button');
const scannerLogoutButton = document.getElementById('logout-button');
const statusMessage = document.getElementById('status-message');
const resultsContainer = document.getElementById('scan-results-container');
const totalExpectedEl = document.getElementById('total-expected');
const totalActualEl = document.getElementById('total-actual');
const progressPercentEl = document.getElementById('progress-percent');
const editModal = document.getElementById('edit-modal');
const modalProductName = document.getElementById('modal-product-name');
const modalBarcode = document.getElementById('modal-barcode');
const modalQuantityInput = document.getElementById('modal-quantity-input');
const modalSaveButton = document.getElementById('modal-save-button');
const modalCancelButton = document.getElementById('modal-cancel-button');

// 효과음 오디오 객체 생성
const beepSound = new Audio('SoundFile.wav'); 
const errorSound = new Audio('error.wav'); 

let validLocations = [];
let currentEditingScanId = null; 

// 페이지 제목에 현재 채널 이름 표시
document.querySelector('header h1').textContent = `재고 실사 (${selectedChannelName})`;


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
        validLocations = allLocations.map(location => location.location_code);
        console.log(`${validLocations.length}개의 로케이션 정보를 성공적으로 불러왔습니다.`);

    } catch (error) {
        console.error('로케이션 정보 로딩 실패:', error);
        alert('데이터베이스 연결에 실패했습니다. F12를 눌러 콘솔을 확인하세요.');
    }
}

function openEditModal(scan) {
    currentEditingScanId = scan.id;
    modalProductName.textContent = scan.products.product_name;
    modalBarcode.textContent = `바코드: ${scan.products.barcode}`;
    modalQuantityInput.value = scan.quantity;
    editModal.style.display = 'flex';
    modalQuantityInput.focus();
    modalQuantityInput.select();
}

function closeEditModal() {
    currentEditingScanId = null;
    editModal.style.display = 'none';
}

async function saveQuantity() {
    const newQuantity = parseInt(modalQuantityInput.value, 10);
    if (isNaN(newQuantity) || newQuantity < 0) {
        alert('유효한 수량을 입력하세요.');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('inventory_scans')
            .update({ quantity: newQuantity, created_at: new Date().toISOString() })
            .eq('id', currentEditingScanId);

        if (error) throw error;

        beepSound.play();
        statusMessage.textContent = '수량이 성공적으로 수정되었습니다.';
        statusMessage.style.color = 'green';
        closeEditModal();
        
        await displayLocationScans(locationInput.value.trim());
        await updateGlobalProgress();

    } catch (error) {
        console.error('수량 업데이트 실패:', error);
        statusMessage.textContent = `오류: ${error.message}`;
        statusMessage.style.color = 'red';
    }
}


async function displayLocationScans(locationCode) {
    if (!locationCode) {
        resultsContainer.innerHTML = '';
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('inventory_scans')
            .select(`id, expected_quantity, quantity, products ( product_name, barcode )`)
            .eq('location_code', locationCode)
            .eq('channel_id', selectedChannelId);

        if (error) throw error;

        if (data.length === 0) {
            resultsContainer.innerHTML = '<p class="no-data-message">해당 로케이션에 스캔된 데이터가 없습니다.</p>';
            return;
        }

        let tableHTML = `
            <table class="results-table">
                <thead><tr><th>상품명</th><th>바코드</th><th>전산</th><th>실사</th><th>차이</th></tr></thead>
                <tbody>`;
        data.forEach(item => {
            const expected = item.expected_quantity || 0;
            const actual = item.quantity || 0;
            const diff = actual - expected;
            
            let diffClass = '';
            if (diff > 0) diffClass = 'diff-plus';
            if (diff < 0) diffClass = 'diff-minus';
            
            tableHTML += `
                <tr data-scan='${JSON.stringify(item)}'>
                    <td>${item.products.product_name}</td>
                    <td>${item.products.barcode}</td>
                    <td>${expected}</td>
                    <td>${actual}</td>
                    <td class="${diffClass}">${diff}</td>
                </tr>`;
        });
        tableHTML += '</tbody></table>';
        resultsContainer.innerHTML = tableHTML;

    } catch (error) {
        console.error('스캔 내역 조회 실패:', error);
        resultsContainer.innerHTML = `<p style="color:red;">데이터를 불러오는 중 오류가 발생했습니다.</p>`;
    }
}

async function updateGlobalProgress() {
    const { data, error } = await supabaseClient
        .from('inventory_scans')
        .select('expected_quantity, quantity')
        .eq('channel_id', selectedChannelId);

    if (error) {
        console.error('전체 진척도 데이터 조회 실패:', error);
        return;
    }

    const totals = data.reduce((acc, item) => {
        acc.expected += item.expected_quantity || 0;
        acc.actual += item.quantity || 0;
        return acc;
    }, { expected: 0, actual: 0 });

    const progress = totals.expected > 0 ? (totals.actual / totals.expected) * 100 : 0;

    totalExpectedEl.textContent = totals.expected;
    totalActualEl.textContent = totals.actual;
    progressPercentEl.textContent = progress.toFixed(2) + '%';
}

function selectLocation() {
    const enteredLocation = locationInput.value.trim();
    if (validLocations.includes(enteredLocation)) {
        statusMessage.textContent = `로케이션 [${enteredLocation}]이(가) 선택되었습니다.`;
        statusMessage.style.color = 'blue';
        barcodeInput.disabled = false;
        barcodeInput.focus();
        displayLocationScans(enteredLocation);
    } else {
        statusMessage.textContent = '존재하지 않는 로케이션입니다. 다시 입력하세요.';
        statusMessage.style.color = 'red';
        errorSound.play();
        locationInput.select();
        barcodeInput.disabled = true;
    }
}

async function handleBarcodeScan() {
    const location = locationInput.value;
    const barcode = barcodeInput.value.trim();

    if (!location || !barcode) {
        statusMessage.textContent = '로케이션과 바코드를 모두 입력하세요!';
        statusMessage.style.color = 'red';
        return;
    }
    
    try {
        const { data: product, error: productError } = await supabaseClient
            .from('products')
            .select('barcode')
            .eq('barcode', barcode)
            .eq('channel_id', selectedChannelId) 
            .single();

        if (productError && productError.code !== 'PGRST116') throw productError;

        if (!product) {
            statusMessage.textContent = '존재하지 않는 상품입니다. 다시 입력하세요.';
            statusMessage.style.color = 'red';
            errorSound.play(); 
            barcodeInput.value = '';
            barcodeInput.focus();
            return;
        }

        let qty = 1;

        if (multipleQuantityCheckbox.checked) {
            const inputQty = prompt('등록할 수량을 입력하세요:', '1');
            if (inputQty === null) {
                barcodeInput.value = '';
                return;
            }
            const parsedQty = parseInt(inputQty, 10);
            if (isNaN(parsedQty) || parsedQty <= 0) {
                alert('유효한 숫자를 입력하세요.');
                barcodeInput.value = '';
                return;
            }
            qty = parsedQty;
        }
        
        let { data: existingScan, error: selectError } = await supabaseClient.from('inventory_scans').select('*').eq('location_code', location).eq('barcode', barcode).eq('channel_id', selectedChannelId).single();
        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        if (existingScan) {
            const newQuantity = (existingScan.quantity || 0) + qty;
            const { error: updateError } = await supabaseClient.from('inventory_scans').update({ quantity: newQuantity, created_at: new Date().toISOString() }).eq('id', existingScan.id);
            if (updateError) throw updateError;
            statusMessage.textContent = `[${barcode}] ${qty}개 추가, 총 ${newQuantity}개`;
        } else {
            const { error: insertError } = await supabaseClient.from('inventory_scans').insert([{ location_code: location, barcode: barcode, quantity: qty, expected_quantity: 0, channel_id: selectedChannelId }]);
            if (insertError) throw insertError;
            statusMessage.textContent = `[${barcode}] ${qty}개 신규 등록 완료`;
        }
        statusMessage.style.color = 'green';
        beepSound.play();
        await displayLocationScans(location);
        await updateGlobalProgress();

    } catch (error) {
        console.error('데이터 처리 실패:', error);
        statusMessage.textContent = `오류: ${error.message}`;
        statusMessage.style.color = 'red';
    } finally {
        barcodeInput.value = '';
        barcodeInput.focus();
    }
}

async function handleResetQuantity() {
    const location = locationInput.value.trim();
    if (!location) {
        alert('초기화할 로케이션을 먼저 선택해주세요.');
        return;
    }

    if (!confirm(`정말로 로케이션 [${location}]의 모든 실사수량을 0으로 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
        return;
    }

    try {
        statusMessage.textContent = `[${location}] 초기화 진행 중...`;
        statusMessage.style.color = 'orange';

        const { error } = await supabaseClient
            .from('inventory_scans')
            .update({ quantity: 0 })
            .eq('location_code', location)
            .eq('channel_id', selectedChannelId);

        if (error) throw error;

        alert(`[${location}] 로케이션의 실사수량이 모두 0으로 초기화되었습니다.`);
        statusMessage.textContent = `[${location}] 초기화 완료.`;
        statusMessage.style.color = 'green';
        
        await displayLocationScans(location);
        await updateGlobalProgress();

    } catch (error) {
        console.error('초기화 실패:', error);
        alert('초기화 작업 중 오류가 발생했습니다.');
        statusMessage.textContent = `오류: ${error.message}`;
        statusMessage.style.color = 'red';
    }
}

// -- 이벤트 리스너(Event Listeners) --
locationSubmitButton.addEventListener('click', selectLocation);
locationInput.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), selectLocation()));
barcodeSubmitButton.addEventListener('click', handleBarcodeScan);
barcodeInput.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), handleBarcodeScan()));
resetButton.addEventListener('click', handleResetQuantity);
refreshButton.addEventListener('click', () => {
    location.reload();
});

changeChannelButton.addEventListener('click', () => {
    if (confirm('채널 선택 화면으로 돌아가시겠습니까?')) {
        window.location.href = 'index.html';
    }
});

scannerLogoutButton.addEventListener('click', async () => {
     if (confirm('로그아웃하시겠습니까?')) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            alert('로그아웃 실패: ' + error.message);
        } else {
            localStorage.removeItem('selectedChannelId');
            localStorage.removeItem('selectedChannelName');
            window.location.href = 'login.html';
        }
    }
});

resultsContainer.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (row && row.dataset.scan) {
        const scanData = JSON.parse(row.dataset.scan);
        openEditModal(scanData);
    }
});

modalSaveButton.addEventListener('click', saveQuantity);
modalCancelButton.addEventListener('click', closeEditModal);
modalQuantityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveQuantity();
    }
});

// 페이지가 로딩되면 바로 실행
async function init() {
    await loadLocations();
    await updateGlobalProgress();
}

init();
