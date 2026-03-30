// Supabase 클라이언트 설정
const SUPABASE_URL = 'https://lmlpbjosdygnpqcnrwuj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbHBiam9zZHlnbnBxY25yd3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MDA2NjgsImV4cCI6MjA2ODQ3NjY2OH0.Jt1Al2Sl44fSlRMAsvRw5cBuKfXcMzeYyzE774stBuQ';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const channelListContainer = document.getElementById('channel-list-container');
const logoutButton = document.getElementById('logout-button');

// 로그인 상태 확인
(async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    loadChannels();
})();

// DB에서 채널 목록을 가져와 버튼으로 표시
async function loadChannels() {
    try {
        const { data, error } = await supabaseClient
            .from('channels')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        
        if (data.length === 0) {
             channelListContainer.innerHTML = '<p>진행할 채널이 없습니다. 관리자에게 문의하세요.</p>';
             return;
        }

        channelListContainer.innerHTML = data.map(channel => `
            <button class="channel-button" data-id="${channel.id}" data-name="${channel.name}">
                ${channel.name}
            </button>
        `).join('');

    } catch (error) {
        console.error('채널 로딩 실패:', error);
        channelListContainer.innerHTML = '<p>채널 목록을 불러오는 데 실패했습니다.</p>';
    }
}

// 채널 버튼 클릭 시 채널 ID/이름 저장 후, 출고 검수 페이지로 바로 이동
channelListContainer.addEventListener('click', (e) => {
    const button = e.target.closest('.channel-button');
    if (button) {
        localStorage.setItem('selectedChannelId', button.dataset.id);
        localStorage.setItem('selectedChannelName', button.dataset.name); // 채널 이름도 저장
        window.location.href = 'main.html'; // main.html로 바로 이동
    }
});

// 로그아웃
logoutButton.addEventListener('click', async () => {
    if (confirm('로그아웃하시겠습니까?')) {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        window.location.href = 'login.html';
    }
});