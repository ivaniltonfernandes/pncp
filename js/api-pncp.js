// URLs das fontes do PNCP (API de Consultas)
const API_EDITAIS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const API_ATAS = "https://pncp.gov.br/api/consulta/v1/atas";
const API_CONTRATOS = "https://pncp.gov.br/api/consulta/v1/contratos";

const ApiPNCP = {
  onlyDigits: (s) => (s || "").replace(/\D+/g, ""),

  // Retorna datas no formato yyyymmdd (como a API do PNCP costuma usar)
  getDateRange: (daysAgo = 30) => {
    // Garante intervalo válido e evita inversões por parâmetros negativos ou efeitos de fuso/DST
    const days = Math.max(0, Math.abs(Number(daysAgo || 0)));

    const end = new Date();
    // fixa o horário no meio do dia para evitar bordas de DST/virada de dia
    end.setHours(12, 0, 0, 0);

    const start = new Date(end);
    start.setDate(end.getDate() - days);

    // Se por qualquer motivo inverter, corrige aqui
    let a = start, b = end;
    if (a.getTime() > b.getTime()) {
      const tmp = a; a = b; b = tmp;
    }

    const format = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}${m}${d}`;
    };

    return {
      dataInicial: format(a),
      dataFinal: format(b)
    };
  },

  // Monta URL com quaisquer parâmetros (não "trava" em um conjunto fixo)
  buildUrl: (baseUrl, params = {}) => {
    const u = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const s = String(v).trim();
      if (!s) return;
      u.searchParams.set(k, s);
    });
    return u.toString();
  },

  // Fetch com timeout + suporte a AbortSignal externo
  fetchJson: async (url, { timeoutMs = 20000, signal } = {}) => {
    const ctrl = new AbortController();
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      try { ctrl.abort(); } catch (_) {}
    }, timeoutMs);

    const onAbort = () => {
      try { ctrl.abort(); } catch (_) {}
    };

    try {
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      let resp;
      let text = "";
      try {
        resp = await fetch(url, { signal: ctrl.signal });
        text = await resp.text().catch(() => "");
      } catch (err) {
        // Se estourou o timeout, transforma o AbortError em um erro claro
        if (didTimeout) {
          throw new Error("Tempo limite excedido ao consultar o PNCP. Tente novamente.");
        }
        throw err;
      }

      if (!resp.ok) {
        const detail = text ? ` - ${text.slice(0, 220)}` : "";
        throw new Error(`HTTP ${resp.status}${detail}`);
      }

      if (!text || text.trim() === "") return { data: [], meta: {} };
      return JSON.parse(text);

    } finally {
      clearTimeout(timer);
      if (signal) {
        try { signal.removeEventListener("abort", onAbort); } catch (_) {}
      }
    }
  },

  sleep: (ms, signal) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  }),

  // Lida com yyyymmdd, ISO e Date
  parseDateMs: (value) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();

    const s = String(value).trim();
    if (!s) return 0;

    // yyyymmdd
    if (/^\d{8}$/.test(s)) {
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(4, 6));
      const d = Number(s.slice(6, 8));
      const dt = new Date(y, m - 1, d);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    const dt = new Date(s);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  },

  formatDateBR: (value) => {
    const ms = ApiPNCP.parseDateMs(value);
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("pt-BR");
  },

  pick: (obj, keys) => {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) {
        const s = String(obj[k]).trim();
        if (s !== "") return obj[k];
      }
    }
    return "";
  },

  // Paginação robusta (para endpoints do PNCP que retornam meta com total de páginas)
  fetchAllPages: async (baseUrl, params = {}, options = {}) => {
    const {
      signal,
      timeoutMs = 20000,
      pageDelayMs = 120,
      maxPages = 80,
      maxItems = 15000,
      onProgress
    } = options;

  // Normaliza e garante que dataInicial <= dataFinal (evita HTTP 422 por inversão)
  const _normDate = (v) => {
    const s = String(v ?? "").trim();
    const digits = s.replace(/\D+/g, "");
    if (digits.length === 8) return digits; // yyyymmdd
    return s;
  };

  const _fixDateOrder = (p) => {
    if (!p || p.dataInicial == null || p.dataFinal == null) return p;
    const a = _normDate(p.dataInicial);
    const b = _normDate(p.dataFinal);
    if (/^\d{8}$/.test(a) && /^\d{8}$/.test(b)) {
      if (Number(a) > Number(b)) {
        const tmp = p.dataInicial;
        p.dataInicial = p.dataFinal;
        p.dataFinal = tmp;
      }
    }
    return p;
  };

  _fixDateOrder(params);

    let page = Number(params.pagina || 1);
    const baseTamanho = params.tamanhoPagina !== undefined ? Number(params.tamanhoPagina) : undefined;

    let totalPages = null;
    let items = [];
    let truncated = false;

    const guessHasMore = (dataArr, tamanho) => {
      const t = Number(tamanho || 0);
      if (!t) return dataArr.length > 0;
      return dataArr.length >= t;
    };

    for (let i = 0; i < maxPages; i++) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

      const pageParams = { ...params, pagina: page };
      _fixDateOrder(pageParams);
      let url = ApiPNCP.buildUrl(baseUrl, pageParams);

      let json;
      try {
        json = await ApiPNCP.fetchJson(url, { timeoutMs, signal });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        const hasTamanho = pageParams.tamanhoPagina !== undefined && pageParams.tamanhoPagina !== null;

        // Fallback 1: algumas respostas retornam HTTP 422 quando dataInicial > dataFinal
        if (msg.includes("HTTP 422") && msg.includes("Data Inicial") && pageParams.dataInicial != null && pageParams.dataFinal != null) {
          const retryParams = { ...pageParams, dataInicial: pageParams.dataFinal, dataFinal: pageParams.dataInicial };
          _fixDateOrder(retryParams);
          url = ApiPNCP.buildUrl(baseUrl, retryParams);
          json = await ApiPNCP.fetchJson(url, { timeoutMs, signal });
        }
        // Fallback 2: alguns endpoints rejeitam tamanhoPagina alto (HTTP 400)
        else if (msg.includes("HTTP 400") && hasTamanho) {
          const retryParams = { ...pageParams };
          // primeiro tenta reduzir
          retryParams.tamanhoPagina = Math.min(100, baseTamanho || 100);
          _fixDateOrder(retryParams);
          url = ApiPNCP.buildUrl(baseUrl, retryParams);
          try {
            json = await ApiPNCP.fetchJson(url, { timeoutMs, signal });
          } catch (_) {
            // última tentativa: remove tamanhoPagina
            delete retryParams.tamanhoPagina;
            _fixDateOrder(retryParams);
            url = ApiPNCP.buildUrl(baseUrl, retryParams);
            json = await ApiPNCP.fetchJson(url, { timeoutMs, signal });
          }
        } else {
          throw e;
        }
      }

      const data = Array.isArray(json?.data) ? json.data
        : Array.isArray(json?.items) ? json.items
        : Array.isArray(json?.results) ? json.results
        : [];

      items = items.concat(data);

      const meta = json?.meta || json?.paginacao || json?.pagination || json || {};
      const tp = Number(meta.totalPaginas ?? meta.totalPages ?? meta.total_pages ?? meta.totalPaginasConsulta);
      if (!isNaN(tp) && tp > 0) totalPages = tp;

      if (typeof onProgress === "function") {
        onProgress({ page, totalPages, itemsSoFar: items.length, url });
      }

      if (items.length >= maxItems) {
        truncated = true;
        break;
      }

      let hasMore = false;
      if (totalPages !== null) {
        hasMore = page < totalPages;
      } else if (meta.paginasRestantes !== undefined && meta.paginasRestantes !== null) {
        const pr = Number(meta.paginasRestantes);
        hasMore = !isNaN(pr) && pr > 0;
      } else {
        hasMore = guessHasMore(data, pageParams.tamanhoPagina);
      }

      if (!hasMore) break;

      page += 1;
      if (pageDelayMs) await ApiPNCP.sleep(pageDelayMs, signal);
    }

    return {
      data: items,
      meta: { totalPages, truncated }
    };
  }
};

// expõe no escopo global (para outros scripts)
window.ApiPNCP = ApiPNCP;
window.API_EDITAIS = API_EDITAIS;
window.API_ATAS = API_ATAS;
window.API_CONTRATOS = API_CONTRATOS;
