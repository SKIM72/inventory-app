const { createClient } = supabase;
const supabaseClient = createClient('https://qjftovamkqhxaenueood.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18');

const channelListContainer = document.getElementById('channel-list');

// ✅ 로그인 및 승인 상태 확인 '문지기'
(async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    // 세션이 없거나, 사용자가 승인되지 않았다면 로그인 페이지로 보냄
    if (error || !session || session.user.user_metadata.is_approved !== true) {
        window.location.href = 'login.html';
        return; // 아래 코드 실행 중지
    }

    // 모든 확인을 통과한 경우에만 채널 목록을 불러옴
    loadChannels();
})();


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
        
        // 재고 실사 페이지로 이동
        window.location.href = 'main.html';
    }
});