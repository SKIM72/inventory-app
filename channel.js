const SUPABASE_URL = 'https://qjftovamkqhxaenueood.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const channelListContainer = document.getElementById('channel-list');

// DB에서 채널 목록을 가져와 버튼으로 표시
async function loadChannels() {
    try {
        const { data, error } = await supabaseClient.from('channels').select('*').order('id');
        if (error) throw error;
        
        if (data.length === 0) {
             channelListContainer.innerHTML = '<p>생성된 채널이 없습니다. 관리자 페이지에서 채널을 추가해 주세요.</p>';
             return;
        }

        let buttonsHTML = '';
        data.forEach(channel => {
            buttonsHTML += `<button class="channel-button" data-id="${channel.id}" data-name="${channel.name}">${channel.name}</button>`;
        });
        channelListContainer.innerHTML = buttonsHTML;

    } catch (error) {
        console.error('채널 로딩 실패:', error);
        channelListContainer.innerHTML = '<p>채널을 불러오는 데 실패했습니다. 데이터베이스 연결을 확인하세요.</p>';
    }
}

// 버튼 클릭 시 채널 ID와 이름을 저장하고 재고 실사 페이지(main.html)로 이동
channelListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('channel-button')) {
        const channelId = e.target.dataset.id;
        const channelName = e.target.dataset.name;
        
        // 브라우저의 로컬 스토리지에 선택한 채널 정보를 저장
        localStorage.setItem('selectedChannelId', channelId);
        localStorage.setItem('selectedChannelName', channelName);
        
        // 재고 실사 페이지 주소를 'main.html'로 변경
        window.location.href = 'main.html';
    }
});

// 페이지 로드 시 채널 목록 불러오기 실행
loadChannels();