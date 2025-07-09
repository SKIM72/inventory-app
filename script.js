const SUPABASE_URL = 'https://qjftovamkqhxaenueood.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// HTML 요소 가져오기
const locationInput = document.getElementById('location-input');
const locationList = document.getElementById('location-list');
const locationSubmitButton = document.getElementById('location-submit-button');
const barcodeInput = document.getElementById('barcode-input');
const barcodeSubmitButton = document.getElementById('barcode-submit-button');
const multipleQuantityCheckbox = document.getElementById('multiple-quantity-checkbox');
const resetButton = document.getElementById('reset-quantity-button');
const statusMessage = document.getElementById('status-message');
const resultsContainer = document.getElementById('scan-results-container');
const totalExpectedEl = document.getElementById('total-expected');
const totalActualEl = document.getElementById('total-actual');
const progressPercentEl = document.getElementById('progress-percent');

// 효과음 오디오 객체 생성
const beepSound = new Audio('beep.mp3');

let validLocations = [];

async function loadLocations() {
    const { data, error } = await supabaseClient.from('locations').select('location_code');
    if (error) {
        console.error('로케이션 정보 로딩 실패:', error);
        alert('데이터베이스 연결에 실패했습니다. F12를 눌러 콘솔을 확인하세요.');
        return;
    }
    validLocations = data.map(location => location.location_code);
    locationList.innerHTML = '';
    validLocations.forEach(locationCode => {
        const option = document.createElement('option');
        option.value = locationCode;
        locationList.appendChild(option);
    });
}

async function displayLocationScans(locationCode) {
    if (!locationCode) {
        resultsContainer.innerHTML = '';
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('inventory_scans')
            .select(`
                expected_quantity, 
                quantity,
                products ( product_name, barcode )
            `)
            .eq('location_code', locationCode);

        if (error) throw error;

        if (data.length === 0) {
            resultsContainer.innerHTML = '<p>해당 로케이션에 스캔된 데이터가 없습니다.</p>';
            return;
        }

        let tableHTML = `
            <table class="results-table">
                <thead>
                    <tr>
                        <th>상품명</th>
                        <th>바코드</th>
                        <th>전산수량</th>
                        <th>실사수량</th>
                        <th>차이수량</th>
                    </tr>
                </thead>
                <tbody>
        `;
        data.forEach(item => {
            const expected = item.expected_quantity || 0;
            const actual = item.quantity || 0;
            const diff = actual - expected;
            
            let diffClass = '';
            if (diff > 0) diffClass = 'diff-plus';
            if (diff < 0) diffClass = 'diff-minus';

            tableHTML += `
                <tr>
                    <td>${item.products.product_name}</td>
                    <td>${item.products.barcode}</td>
                    <td>${expected}</td>
                    <td>${actual}</td>
                    <td class="${diffClass}">${diff}</td>
                </tr>
            `;
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
        .select('expected_quantity, quantity');

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
        locationInput.select();
        barcodeInput.disabled = true;
    }
}

async function handleBarcodeScan() {
    const location = locationInput.value;
    const barcode = barcodeInput.value.trim();

    if (!location) {
        statusMessage.textContent = '먼저 로케이션을 선택하세요!';
        statusMessage.style.color = 'red';
        return;
    }
    if (!barcode) {
        statusMessage.textContent = '바코드를 입력하세요!';
        statusMessage.style.color = 'red';
        return;
    }
    
    try {
        const { data: product, error: productError } = await supabaseClient
            .from('products')
            .select('barcode')
            .eq('barcode', barcode)
            .single();

        if (productError && productError.code !== 'PGRST116') {
            throw productError;
        }

        if (!product) {
            statusMessage.textContent = '존재하지 않는 상품입니다. 다시 입력하세요.';
            statusMessage.style.color = 'red';
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

        let { data: existingScan, error: selectError } = await supabaseClient.from('inventory_scans').select('*').eq('location_code', location).eq('barcode', barcode).single();
        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        if (existingScan) {
            const newQuantity = (existingScan.quantity || 0) + qty;
            const { error: updateError } = await supabaseClient.from('inventory_scans').update({ quantity: newQuantity, created_at: new Date().toISOString() }).eq('id', existingScan.id);
            if (updateError) throw updateError;
            statusMessage.textContent = `[${barcode}] ${qty}개 추가, 총 ${newQuantity}개`;
        } else {
            const { data: expectedData, error: expectedError } = await supabaseClient
                .from('inventory_scans')
                .select('expected_quantity')
                .eq('location_code', location)
                .eq('barcode', barcode)
                .single();
            
            let expected_qty = 0;
            if(expectedData) {
                expected_qty = expectedData.expected_quantity;
            }

            const { error: insertError } = await supabaseClient.from('inventory_scans').insert([{ location_code: location, barcode: barcode, quantity: qty, expected_quantity: expected_qty }]);
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
            .eq('location_code', location);

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

// 페이지가 로딩되면 바로 실행
async function init() {
    await loadLocations();
    await updateGlobalProgress();
}

init();