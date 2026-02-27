document.addEventListener('DOMContentLoaded', () => {
  const isLogged = localStorage.getItem('pncp_auth') === 'true';
  const path = (window.location.pathname || '').toLowerCase();

  // Considera "index.html" OU diretório raiz (ex.: /) como tela de login.
  const isIndex =
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    path.endsWith('index.html');

  if (isLogged && isIndex) {
    window.location.href = 'app.html';
  }
});

const loginForm = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');

if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    // CREDENCIAIS DE ACESSO (atenção: em site estático isto não é segurança real)
    const validUser = "admin";
    const validPass = "123456";

    if (user === validUser && pass === validPass) {
      if (errorMsg) errorMsg.classList.add('hidden');
      localStorage.setItem('pncp_auth', 'true');
      window.location.href = 'app.html';
    } else {
      if (errorMsg) errorMsg.classList.remove('hidden');
      const card = loginForm.parentElement;
      card.classList.add('translate-x-1');
      setTimeout(() => card.classList.remove('translate-x-1'), 100);
    }
  });
}

function checkAuth() {
  const isLogged = localStorage.getItem('pncp_auth') === 'true';
  if (!isLogged) {
    window.location.href = 'index.html';
  }
}

function logout() {
  localStorage.removeItem('pncp_auth');
  window.location.href = 'index.html';
}
