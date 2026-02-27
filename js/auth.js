// js/auth.js

// Verifica se já está logado ao abrir a página
document.addEventListener('DOMContentLoaded', () => {
  const isLogged = localStorage.getItem('pncp_auth');
  
  // Se já estiver logado e estiver na tela de index, manda pro app
  if (isLogged === 'true' && window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
      window.location.href = 'app.html';
  }
});

const loginForm = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');

if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
      e.preventDefault(); // Impede a página de recarregar

      const user = document.getElementById('username').value;
      const pass = document.getElementById('password').value;

      // CREDENCIAIS DE TESTE (Lembre-se: visíveis no código-fonte)
      const validUser = "admin";
      const validPass = "123456";

      if (user === validUser && pass === validPass) {
          // Esconde mensagem de erro
          errorMsg.classList.add('hidden');
          
          // Salva no navegador que o usuário está logado
          localStorage.setItem('pncp_auth', 'true');
          
          // Redireciona para o sistema principal
          window.location.href = 'app.html';
      } else {
          // Mostra mensagem de erro
          errorMsg.classList.remove('hidden');
          
          // Treme o card levemente para dar feedback visual (opcional)
          const card = loginForm.parentElement;
          card.classList.add('translate-x-1');
          setTimeout(() => card.classList.remove('translate-x-1'), 100);
      }
  });
}

// Função utilitária para usar nas outras páginas
function checkAuth() {
  const isLogged = localStorage.getItem('pncp_auth');
  if (isLogged !== 'true') {
      // Se não estiver logado, manda pro index
      window.location.href = 'index.html';
  }
}

// Função de logout
function logout() {
  localStorage.removeItem('pncp_auth');
  window.location.href = 'index.html';
}