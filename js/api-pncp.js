// URLs das fontes do PNCP (API de Consultas)
const API_EDITAIS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const API_ATAS = "https://pncp.gov.br/api/consulta/v1/atas";
const API_CONTRATOS = "https://pncp.gov.br/api/consulta/v1/contratos";

const ApiPNCP = {
  onlyDigits: (s) => (s || "").replace(/\D+/g, ""),

  // Retorna datas no formato yyyymmdd (como a API do PNCP costuma usar)
  getDateRange: (daysAgo = 30) => {
  const days = Math.max(0, Math.abs(Number(daysAgo || 0)));

  // Fixamos o horário no meio do dia para reduzir efeitos de fuso/virada de data
  const end = new Date();
  end.setHours(12, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const format = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };

  let dataInicial = format(start);
  let dataFinal = format(end);

  // Garantia: inicial <= final (evita HTTP 422)
  if (dataInicial > dataFinal) {
    const tmp = dataInicial;
    dataInicial = dataFinal;
    dataFinal = tmp;
  }

  return { dataInicial, dataFinal };
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
  // Fetch com timeout + suporte a AbortSignal externo + retries (para instabilidade do PNCP)
fetchJson: async (
  url,
  {
    timeoutMs = 45000,
    signal,
    retries = 2,
    retryBaseDelayMs = 650,
    retryBackoff = 2,
    retryOnStatuses = [429, 500, 502, 503, 504]
  } = {}
) => {
  const sleep = (ms) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });

  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

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
        if (didTimeout) {
          const te = new Error("Tempo limite excedido ao consultar o PNCP. Tente novamente.");
          te.name = "TimeoutError";
          te.code = "TIMEOUT";
          throw te;
        }
        throw err;
      }

      if (!resp.ok) {
        // Decide se é erro que vale retry
        const shouldRetry = retryOnStatuses.includes(resp.status);
        const detail = text ? ` - ${text.slice(0, 220)}` : "";
        const he = new Error(`HTTP ${resp.status}${detail}`);
        he.name = "HttpError";
        he.status = resp.status;

        if (shouldRetry && attempt < retries) throw he;
        throw he;
      }

      if (!text || text.trim() === "") return { data: [], meta: {} };
      return JSON.parse(text);

    } catch (err) {
      lastErr = err;

      // Não tenta retry em abort do usuário
      if (err && (err.name === "AbortError" || String(err).includes("AbortError"))) {
        throw err;
      }

      const isTimeout = err && (err.name === "TimeoutError" || err.code === "TIMEOUT" || String(err.message || err).includes("Tempo limite"));
      const isRetryableNet = err && (String(err.message || err).includes("Failed to fetch") || String(err.message || err).includes("NetworkError"));
      const isRetryableHttp = err && err.name === "HttpError" && retryOnStatuses.includes(Number(err.status));

      if ((isTimeout || isRetryableNet || isRetryableHttp) && attempt < retries) {
        const delay = Math.round(retryBaseDelayMs * Math.pow(retryBackoff, attempt));
        attempt += 1;
        // Em timeouts, aumenta um pouco o timeout para a próxima tentativa
        if (isTimeout) timeoutMs = Math.min(90000, Math.round(timeoutMs * 1.35));
        await sleep(delay);
        continue;
      }

      throw err;

    } finally {
      clearTimeout(timer);
      if (signal) {
        try { signal.removeEventListener("abort", onAbort); } catch (_) {}
      }
    }
  }

  throw lastErr || new Error("Falha ao consultar o PNCP.");
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
      let url = ApiPNCP.buildUrl(baseUrl, pageParams);

      let json;
      try {
  json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 2 });
} catch (e) {
  const msg = String(e && e.message ? e.message : e);
  const hasTamanho = pageParams.tamanhoPagina !== undefined && pageParams.tamanhoPagina !== null;

  // 1) Timeout / instabilidade: tenta novamente com timeout maior e/ou página menor
  if ((e && (e.name === "TimeoutError" || e.code === "TIMEOUT")) || msg.includes("Tempo limite")) {
    const retryParams = { ...pageParams };

    // Se a página está grande, reduz
    if (hasTamanho) {
      const tp = Number(retryParams.tamanhoPagina);
      if (!isNaN(tp) && tp > 80) retryParams.tamanhoPagina = 80;
      else if (!isNaN(tp) && tp > 50) retryParams.tamanhoPagina = 50;
    } else {
      // Se não tinha tamanhoPagina, define um moderado
      retryParams.tamanhoPagina = 80;
    }

    url = ApiPNCP.buildUrl(baseUrl, retryParams);
    json = await ApiPNCP.fetchJson(url, { timeoutMs: Math.min(90000, Math.round(timeoutMs * 1.35)), signal, retries: 2 });
  }

  // 2) Fallback comum: alguns endpoints rejeitam tamanhoPagina alto (HTTP 400).
  else if (msg.includes("HTTP 400") && hasTamanho) {
    const retryParams = { ...pageParams };
    // primeiro tenta reduzir
    retryParams.tamanhoPagina = Math.min(100, baseTamanho || 100);
    url = ApiPNCP.buildUrl(baseUrl, retryParams);
    try {
      json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 1 });
    } catch (_) {
      // última tentativa: remove tamanhoPagina
      delete retryParams.tamanhoPagina;
      url = ApiPNCP.buildUrl(baseUrl, retryParams);
      json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 1 });
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
