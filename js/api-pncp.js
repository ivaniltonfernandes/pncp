const API_BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

const ApiPNCP = {
  onlyDigits: (s) => (s || "").replace(/\D+/g, ""),

  // Calcula a data de hoje e a data de X dias atrás no formato AAAAMMDD
  getDateRange: (daysAgo = 60) => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - daysAgo);

    const format = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    };

    return {
      dataInicial: format(past),
      dataFinal: format(today)
    };
  },

  buildUrl: ({dataInicial, dataFinal, codigoModalidadeContratacao, pagina=1, tamanhoPagina=50}) => {
    const u = new URL(API_BASE);
    u.searchParams.set("dataInicial", dataInicial);
    u.searchParams.set("dataFinal", dataFinal);
    u.searchParams.set("codigoModalidadeContratacao", codigoModalidadeContratacao);
    u.searchParams.set("pagina", String(pagina));
    u.searchParams.set("tamanhoPagina", String(tamanhoPagina));
    return u.toString();
  },

  fetchJsonWithTimeout: async (url, ms=20000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      
      // SOLUÇÃO PARA O ERRO: "Unexpected end of JSON input"
      // Lemos a resposta como texto primeiro. Se a API do governo não devolver nada (em branco), 
      // o sistema não bloqueia e retorna apenas uma lista vazia de forma segura.
      const text = await resp.text();
      if (!text || text.trim() === "") {
        return { data: [] };
      }
      return JSON.parse(text);

    } finally {
      clearTimeout(t);
    }
  },

  pick: (obj, keys) => {
    for (const k of keys){
      if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
    }
    return "";
  }
};
