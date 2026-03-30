// Supabase 클라이언트 설정
const SUPABASE_URL = 'https://lmlpbjosdygnpqcnrwuj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbHBiam9zZHlnbnBxY25yd3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MDA2NjgsImV4cCI6MjA2ODQ3NjY2OH0.Jt1Al2Sl44fSlRMAsvRw5cBuKfXcMzeYyzE774stBuQ';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM 요소
const loginForm = document.getElementById('login-form');
const authMessage = document.getElementById('auth-message');
const showSignup = document.getElementById('show-signup');
const authFormContainer = document.getElementById('auth-form');

// 로그인 처리
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        const messageEl = document.getElementById('auth-message');
        if (error) {
            messageEl.textContent = '로그인 실패: ' + error.message;
        } else if (data.user) {
            if (data.user.email === 'eowert72@gmail.com' || (data.user.user_metadata && data.user.user_metadata.is_admin === true)) {
                 window.location.href = 'index.html';
            } else {
                 window.location.href = 'index.html';
            }
        }
    });
}

// 회원가입 폼 보여주기
if (showSignup) {
    showSignup.addEventListener('click', (e) => {
        e.preventDefault();

        // 제목을 '회원가입'으로 변경하는 코드
        document.getElementById('auth-title').textContent = '회원가입';

        // 기존 코드
        authFormContainer.innerHTML = `
            <form id="signup-form">
                <div class="input-group" style="margin-bottom: 1rem;">
                    <label for="signup-email">이메일</label>
                    <input type="email" id="signup-email" required placeholder="사용할 이메일 입력">
                </div>
                <div class="input-group" style="margin-bottom: 1.5rem;">
                    <label for="signup-password">비밀번호 (6자 이상)</label>
                    <input type="password" id="signup-password" required minlength="6" placeholder="6자 이상 입력">
                </div>
                <button type="submit" class="channel-button">가입 요청</button>
            </form>
            <p id="auth-message" style="color: red; text-align: center; margin-top: 1rem;"></p>
            <p style="text-align: center; margin-top: 2rem;">
                이미 계정이 있으신가요? <a href="login.html">로그인</a>
            </p>
        `;

        // 동적으로 생성된 회원가입 폼에 이벤트 리스너 추가
        document.getElementById('signup-form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;

            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
            });

            const messageEl = document.getElementById('auth-message');
            if (error) {
                messageEl.textContent = '회원가입 실패: ' + error.message;
            } else {
                messageEl.style.color = 'green';
                messageEl.textContent = '회원가입 성공! 관리자 승인 후 로그인이 가능합니다.';
                ev.target.reset();
            }
        });
    });
}