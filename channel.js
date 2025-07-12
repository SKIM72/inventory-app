const { createClient } = supabase;
const supabaseClient = createClient('https://qjftovamkqhxaenueood.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18');

const channelListContainer = document.getElementById('channel-list');

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

channelListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('channel-button')) {
        const channelId = e.target.dataset.id;
        const channelName = e.target.dataset.name;
        
        localStorage.setItem('selectedChannelId', channelId);
        localStorage.setItem('selectedChannelName', channelName);
        
        window.location.href = 'main.html';
    }
});

loadChannels();