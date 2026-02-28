document.addEventListener('DOMContentLoaded', () => {
  const isLogged = localStorage.getItem('pncp_auth');

  // Em GitHub Pages (site de projeto), o caminho costuma terminar com "/pncp/" (sem "index.html").
  // Então consideramos como "tela de login" qualquer URL que termine com "/" ou "index.html".
  const path = window.location.pathname || "";
  const isLoginPage = path.endsWith("index.html") || path.endsWith("/");

  if (isLogged === 'true' && isLoginPage) {
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

    // CREDENCIAIS DE ACESSO (front-end). Em site estático isso NÃO é segurança real.
    const validUser = "admin";
    const validPass = "123456";

    if (user === validUser && pass === validPass) {
      if (errorMsg) errorMsg.classList.add('hidden');
      localStorage.setItem('pncp_auth', 'true');
      window.location.href = 'app.html';
    } else {
      if (errorMsg) errorMsg.classList.remove('hidden');
      const card = loginForm.parentElement;
      if (card) {
        card.classList.add('translate-x-1');
        setTimeout(() => card.classList.remove('translate-x-1'), 100);
      }
    }
  });
}

function checkAuth() {
  const isLogged = localStorage.getItem('pncp_auth');
  if (isLogged !== 'true') {
    window.location.href = 'index.html';
  }
}

function logout() {
  localStorage.removeItem('pncp_auth');
  window.location.href = 'index.html';
}
