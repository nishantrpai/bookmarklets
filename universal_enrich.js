// ==UserScript==
// @name         Universal Enrich
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
    const MIN_DELAY = 10000;
    const SERVER_IP = `localhost`;
    const PROXY = `http://${SERVER_IP}:8080`;
    const CONFIG_KEY = "enrich_site_config";
    const HISTORY_KEY = "enrich_history";
    const CACHE_KEY = "enrich_cache";
    const CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
    let card = null;
    const SEARCH_URL = `http://${SERVER_IP}:8888`;


    // --- Theme ---
    const FONT = "'SF Mono', SFMono-Regular, Menlo, monospace";
    const BG = "#fff";
    const FG = "#000";
    const DIM = "#666";
    const MUTED = "#999";
    const ACCENT = "#0044aa";
    const BORDER = "#ddd";
    const SURFACE = "#f8f8f8";
    const INPUT_BG = "#f5f5f5";
    const HOVER = "#eee";

    // --- Site config ---
    function getSiteConfig() { return GM_getValue(CONFIG_KEY, {}); }
    function saveSiteConfig(cfg) { GM_setValue(CONFIG_KEY, cfg); }

    // --- History ---
    function getHistory() { return GM_getValue(HISTORY_KEY, []); }
    function addToHistory(entry) {
        const h = getHistory();
        entry.timestamp = new Date().toISOString();
        h.unshift(entry);
        GM_setValue(HISTORY_KEY, h);
    }
    function clearHistory() { GM_setValue(HISTORY_KEY, []); }

    // --- Cache ---
    function getCache() { return GM_getValue(CACHE_KEY, {}); }
    function setCache(key, result) {
        const c = getCache();
        c[key] = { ...result, _cachedAt: Date.now() };
        GM_setValue(CACHE_KEY, c);
    }
    function getCacheEntry(key) {
        const c = getCache();
        const entry = c[key];
        if (!entry) return null;
        if (Date.now() - entry._cachedAt > CACHE_TTL) return null;
        return entry;
    }

    // --- Date ---
    function extractDate(text) {
        const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        const m = text.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})|((?:a\s+|an\s+|\d+\s+)(?:hours?|days?|weeks?|months?|years?)\s+ago)/i);
        return m ? (m[1] || m[2] || m[3]) : "";
    }

    // --- Input ---
    function getInput(selector, source) {
        const el = document.querySelector(selector);
        if (!el) return null;
        let raw = source === "href"
        ? (el.href ? new URL(el.href).hostname : "")
        : el.textContent.trim();
        raw = raw.replace(/^www\./, "");
        const domainMatch = raw.match(/^([a-z0-9-]+)\.([a-z]{2,6})$/i);
        if (domainMatch) return { name: domainMatch[1], tld: domainMatch[2], full: raw };
        return { name: raw, tld: "", full: raw };
    }

    // --- DDG ---
    function ddg(query) {
        console.log(query)
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${SEARCH_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`,
                headers: { "Accept": "application/json" },
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const results = (data.results || []).map(r => ({
                            title: r.title || "",
                            url: r.url || "",
                            snippet: r.content || "",
                            date: r.publishedDate || ""
                        }));
                        resolve(results);
                    } catch (e) {
                        resolve([]);
                    }
                },
                onerror: () => resolve([])
            });
        });
    }

    function toRelatedin(url) {
        const m = url.match(/linkedin\.com\/(in\/.+)/);
        return m ? `https://relatedin.com/${m[1]}` : url;
    }
    function relevant(results, name) {
        return results.filter(r => r.title.toLowerCase().includes(name.toLowerCase()));
    }


    // --- Enrich ---
    async function enrich(name, tld, status) {
        const delay = () => new Promise(r => setTimeout(r, MIN_DELAY));
        const suffix = tld ? ` ${tld}` : "";

        status("1/6 · founder");
        const ceoResults = await ddg(`"${name}"${suffix} founder linkedin`);
        await delay();
        status("2/6 · funding");
        const fundingResults = await ddg(`"${name}"${suffix} funding raised`);
        await delay();
        status("3/6 · news");
        const newsResults = await ddg(`"${name}"${suffix} latest news ${new Date().getFullYear()}`);
        await delay();
        const signalResults = [];//await ddg(`"${name}"${suffix} partnership OR expansion OR "new office" OR hiring`);
        const allNews = [...newsResults, ...signalResults];
        //await delay();
        status("4/6 · revenue");
        const arrResults = relevant(await ddg(`"${name}"${suffix} revenue getlatka`), name);

        let ceo = { name: "", linkedin: "" };
        for (const r of ceoResults) {
            if (r.url.includes("linkedin.com/in/") && /CEO/i.test(r.title)) {
                const m = r.title.match(/^(.+?)\s*[-\u2013|]\s*/i);
                if (m) { ceo = { name: m[1].trim(), linkedin: toRelatedin(r.url) }; break; }
            }
        }
        if (!ceo.name) {
            for (const r of ceoResults) {
                if (!r.url.includes("linkedin.com/in/")) continue;
                if (/\b(CTO|CPO|VP|Director|Head of|Engineer)\b/i.test(r.title)) continue;
                const m = r.title.match(/^(.+?)\s*[-\u2013|]\s*/i);
                if (m) { ceo = { name: m[1].trim(), linkedin: toRelatedin(r.url) }; break; }
            }
        }
        if (!ceo.name) {
            for (const r of ceoResults) {
                if (r.url.includes("linkedin.com/in/")) {
                    const m = r.title.match(/^(.+?)\s*[-\u2013|]\s*/i);
                    if (m) { ceo = { name: m[1].trim(), linkedin: toRelatedin(r.url) }; break; }
                }
            }
        }
        if (!ceo.name) {
            for (const r of ceoResults) {
                const m = r.title.match(/^(.+?)\s*[-\u2013]\s*/);
                if (m && m[1].trim().length > 2 && m[1].trim().length < 40) {
                    ceo = { name: m[1].trim(), linkedin: r.url };
                    break;
                }
            }
        }

        let funding = { amount: "", series: "", date: "", source: "" };
        let bestDate = -Infinity;
        for (const r of fundingResults) {
            if (!/\b(rais\w*|seed|series|funding|invest\w*|backed|round)\b/i.test(r.title)) continue;
            const text = r.title + " " + r.snippet;
            const m = text.match(/\$([\d.]+)\s*(million|billion|m\b)/i);
            if (!m) continue;
            const date = r.date || extractDate(text);
            let dateMs = NaN;
            if (date) {
                const iso = date.match(/(\d{4}-\d{2}-\d{2})/);
                dateMs = iso ? new Date(iso[1]).getTime() : new Date(date).getTime();
            }
            if (!isNaN(dateMs) && dateMs > bestDate) {
                bestDate = dateMs;
                funding = {
                    amount: `$${m[1]} ${m[2].toLowerCase().startsWith("b") ? "billion" : "million"}`,
                    series: (text.match(/\b(pre-?seed|seed|series\s*[a-d]\+?|growth|bridge)\b/i) || [])[1]?.replace(/\b\w/g, c => c.toUpperCase()) || "",
                    date,
                    source: r.url
                };
            }
        }
        if (!funding.amount) {
            for (const r of fundingResults) {
                if (!/\b(rais\w*|seed|series|funding|invest\w*|backed|round)\b/i.test(r.title)) continue;
                const m = (r.title + " " + r.snippet).match(/\$([\d.]+)\s*(million|billion|m\b)/i);
                if (m) {
                    funding = { amount: `$${m[1]} ${m[2].toLowerCase().startsWith("b") ? "billion" : "million"}`, series: "", date: r.date || "", source: r.url };
                    break;
                }
            }
        }
        if (!funding.date) {
            for (const r of [...fundingResults, ...ceoResults, ...newsResults]) {
                const d = r.date || extractDate(r.title + " " + r.snippet);
                if (d) { funding.date = d; break; }
            }
        }

        const seen = new Set();
        const news = allNews
        .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return r.title.toLowerCase().includes(name.toLowerCase()); })
        .slice(0, 10)
        .map(r => ({ title: r.title, url: r.url, snippet: r.snippet.slice(0, 120), date: r.date }));

        let founded = "";
        const allResults = [...ceoResults, ...fundingResults, ...newsResults];
        status("5/6 · founded");
        for (const r of allResults) {
            const text = r.title + " " + r.snippet;
            const m = text.match(/founded\s+(?:in\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/i)
            || text.match(/established\s+(?:in\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/i);
            if (m) { founded = m[1].trim(); break; }
        }
        if (!founded) {
            await delay();
            const foundResults = await ddg(`"${name}"${suffix} "founded in" OR "established in"`);
            for (const r of foundResults) {
                const text = r.title + " " + r.snippet;
                const m = text.match(/founded\s+(?:in\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/i)
                || text.match(/established\s+(?:in\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/i);
                if (m) { founded = m[1].trim(); break; }
            }
        }

        let arr = { value: "", source: "" };
        for (const r of [...arrResults, ...fundingResults, ...newsResults]) {
            const text = r.title + " " + r.snippet;
            const m = text.match(/\$([\d.]+)\+?\s*(million|billion|m\b|bn\b)\+?\s*(?:ARR|MRR|in\s+(?:ARR|MRR|revenue|recurring))/i)
            || text.match(/(?:ARR|MRR|revenue)\s*(?:of|at|:)?\s*\$([\d.]+)\+?\s*(million|billion|m\b|bn\b)\+?/i);

            if (m) {
                const plus = text.includes(`$${m[1]}+`) || text.includes(`$${m[1]}M+`) ? "+" : "";
                arr = { value: `$${m[1]}${plus} ${m[2].toLowerCase().startsWith("b") ? "billion" : "million"} ${/MRR/i.test(text) ? "MRR" : "ARR"}`, source: r.url };
                break;
            }
        }

        let score = 0;
        const reasons = [];
        const relevantCount = allResults.filter(r => (r.title + " " + r.snippet).toLowerCase().includes(name.toLowerCase())).length;
        if (relevantCount >= 3) { score += 30; reasons.push(`${relevantCount} relevant`); }
        else if (relevantCount >= 1) { score += 15; reasons.push(`${relevantCount} relevant`); }
        else reasons.push("no relevant results");
        if (ceo.name) { score += 20; if (ceo.linkedin) { score += 20; if (/CEO/i.test(ceoResults.find(r => r.url.replace("relatedin.com", "linkedin.com"))?.title || "")) score += 10; } }
        else reasons.push("no CEO");
        if (funding.amount) score += 20; else reasons.push("no funding");
        if (news.length) score += 10;

        let employees = "";
        for (const r of [...ceoResults, ...fundingResults, ...newsResults]) {
            const text = r.title + " " + r.snippet;
            const m = text.match(/(\d[\d,]*)\+?\s*(?:employees|team members|people|staff|headcount)/i)
            || text.match(/(?:team of|with|has)\s+(\d[\d,]*)\+?\s*(?:people|employees|team)/i);
            if (m) { employees = m[1].replace(/,/g, "") + "+"; break; }
        }

        // Fallback: dedicated query if not found
        status("6/6 · team size");
        if (!employees) {
            await delay();
            const empResults = await ddg(`"${name}"${suffix} employees OR headcount OR "team size"`);
            for (const r of empResults) {
                const text = r.title + " " + r.snippet;
                const m = text.match(/(\d[\d,]*)\+?\s*(?:employees|team members|people|staff|headcount)/i)
                || text.match(/(?:team of|with|has)\s+(\d[\d,]*)\+?\s*(?:people|employees|team)/i);
                if (m) { employees = m[1].replace(/,/g, "") + "+"; break; }
            }
        }

        return { product: name,
                tld, ceo: ceo.name,
                ceo_linkedin: ceo.linkedin,
                funding, founded, arr, news, employees, confidence: Math.min(score, 100), reasons, notes: "" };
    }


    // --- Config modal ---
    function showConfigModal(onDone, current) {
        const hostname = location.hostname;
        const overlay = document.createElement("div");
        overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;`;
        overlay.innerHTML = `
      <div style="background:${BG};border:1px solid ${BORDER};border-radius:4px;padding:20px;max-width:340px;font-family:${FONT};font-size:11px;line-height:1.65;color:${FG};">
        <div style="margin-bottom:8px;letter-spacing:0.5px;">${current ? "EDIT" : "CONFIGURE"}: ${hostname}</div>
        <div style="color:${DIM};margin-bottom:12px;">Company identifier selector for this page.</div>
        <div style="margin-bottom:10px;">
          <label style="color:${DIM};display:block;margin-bottom:4px;">selector</label>
          <input id="cfg-sel" value="${current?.selector || ""}" placeholder='a[href*="ref=producthunt"]' style="width:100%;padding:6px 8px;border-radius:2px;border:1px solid ${BORDER};background:${INPUT_BG};color:${FG};font-family:${FONT};font-size:11px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="color:${DIM};display:block;margin-bottom:4px;">source</label>
          <select id="cfg-src" style="width:100%;padding:6px 8px;border-radius:2px;border:1px solid ${BORDER};background:${INPUT_BG};color:${FG};font-family:${FONT};font-size:11px;box-sizing:border-box;">
            <option value="href" ${current?.source === "href" ? "selected" : ""}>href (domain)</option>
            <option value="text" ${current?.source === "text" ? "selected" : ""}>text (raw string)</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="cfg-save" style="flex:1;padding:8px;border-radius:2px;border:none;background:${FG};color:${BG};font-family:${FONT};font-size:11px;cursor:pointer;">SAVE</button>
          <button id="cfg-skip" style="flex:1;padding:8px;border-radius:2px;border:1px solid ${BORDER};background:transparent;color:${DIM};font-family:${FONT};font-size:11px;cursor:pointer;">CANCEL</button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);

        overlay.querySelector("#cfg-save").onclick = () => {
            const sel = overlay.querySelector("#cfg-sel").value.trim();
            const src = overlay.querySelector("#cfg-src").value;
            if (!sel) return;
            const cfg = getSiteConfig();
            cfg[hostname] = { selector: sel, source: src };
            saveSiteConfig(cfg);
            overlay.remove();
            onDone();
        };
        overlay.querySelector("#cfg-skip").onclick = () => { overlay.remove(); onDone(); };
    }

    // --- Render card ---
    function renderCard(result, cacheKey, isCached) {
        if (card) card.remove();
        card = document.createElement("div");
        card.style.cssText = `position:fixed;bottom:80px;right:24px;z-index:99999;background:${BG};border:1px solid ${BORDER};border-radius:4px;padding:16px;font-family:${FONT};font-size:11px;line-height:1.65;color:${FG};max-width:340px;max-height:70vh;overflow-y:auto;`;
        card.innerHTML = `
  <button class="card-close" style="position:absolute;top:8px;right:8px;background:none;border:none;color:${MUTED};font-family:${FONT};font-size:11px;cursor:pointer;">[x]</button>
  <div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid ${BORDER};">
    <span style="letter-spacing:0.5px;">${result.product}${result.tld ? "." + result.tld : ""}</span>
    <span style="color:${DIM};margin-left:8px;">${result.confidence}%</span>
${isCached ? `<span style="color:${MUTED};margin-left:4px;">[saved]</span>` : ""}
  </div>
  <div style="margin-bottom:6px;"><span style="color:${DIM};">CEO</span> ${result.ceo ? (result.ceo_linkedin ? `<a href="${result.ceo_linkedin}" target="_blank" style="color:${ACCENT};text-decoration:none;">${result.ceo}</a>` : result.ceo) : "—"}</div>
  <div style="margin-bottom:6px;"><span style="color:${DIM};">FUNDING</span> ${result.funding?.amount ? `<a href="${result.funding.source}" target="_blank" style="color:${ACCENT};text-decoration:none;">${result.funding.amount}</a>${result.funding.series ? ` <span style="color:${DIM};">${result.funding.series}</span>` : ""}${result.funding.date ? ` <span style="color:${DIM};">${new Date(result.funding.date).toLocaleDateString('en-US', {year: 'numeric',month: 'long',day: 'numeric'})}</span>` : ""}` : "—"}</div>
  <div style="margin-bottom:6px;"><span style="color:${DIM};">FOUNDED</span> ${result.founded || "—"}</div>
  <div style="margin-bottom:6px;"><span style="color:${DIM};">TEAM SIZE</span> ${result.employees || "—"}</div>
<div style="margin-bottom:12px;"><span style="color:${DIM};">ARR</span> ${result.arr?.value ? `<a href="${result.arr.source}" target="_blank" style="color:${ACCENT};text-decoration:none;">${result.arr.value}</a>` : "—"}</div>
<div style="margin-bottom:12px;">
    <span style="color:${DIM};display:block;margin-bottom:4px;">NOTES</span>
    <textarea class="card-notes" placeholder="" rows="2" style="width:100%;padding:6px 8px;border-radius:2px;border:1px solid ${BORDER};background:${INPUT_BG};color:${FG};font-family:${FONT};font-size:11px;line-height:1.65;resize:vertical;box-sizing:border-box;"></textarea>
  </div>
${result.news.length ? `<details style="margin-bottom:12px;"><summary style="cursor:pointer;color:${DIM};font-size:11px;">[news: ${result.news.length}]</summary><div style="margin-top:6px;">${result.news.map(n => `<div style="margin-bottom:6px;padding:6px;background:${SURFACE};border-left:2px solid ${BORDER};"><a href="${n.url}" target="_blank" style="color:${ACCENT};text-decoration:none;">${n.title}</a>${n.date ? `<span style="color:${MUTED};margin-left:6px;">${n.date}</span>` : ""}<div style="color:${DIM};margin-top:2px;">${n.snippet}…</div></div>`).join("")}</div></details>` : ""}
  <details style="margin-top:8px;"><summary style="cursor:pointer;color:${DIM};font-size:11px;">[signals]</summary><div style="margin-top:6px;color:${DIM};">${result.reasons.map(r => "· " + r).join("<br>")}</div></details>
`;
        card.querySelector(".card-close").onclick = () => { card.remove(); card = null; };
        const notesEl = card.querySelector(".card-notes");
        if (notesEl) {
            notesEl.value = result.notes || "";
            notesEl.onchange = () => {
                result.notes = notesEl.value;
                setCache(cacheKey, result);
                const h = getHistory();
                const entry = h.find(e => e.product === result.product && e.tld === result.tld);
                if (entry) { entry.notes = result.notes; GM_setValue(HISTORY_KEY, h); }
            };
        }
        document.body.appendChild(card);
    }

    // --- Main UI ---
    function showUI() {
        const toolbar = document.createElement("div");
        toolbar.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;gap:2px;background:${BG};border:1px solid ${BORDER};border-radius:4px;padding:2px;`;
        document.body.appendChild(toolbar);

        const btn = document.createElement("button");
        btn.textContent = "ENRICH";
        btn.style.cssText = `background:none;border:none;color:${FG};font-family:${FONT};font-size:11px;cursor:pointer;padding:6px 12px;border-radius:2px;letter-spacing:0.5px;`;
        btn.onmouseenter = () => btn.style.background = HOVER;
        btn.onmouseleave = () => btn.style.background = "none";
        toolbar.appendChild(btn);

        const cfgBtn = document.createElement("button");
        cfgBtn.textContent = "CFG";
        cfgBtn.style.cssText = `background:none;border:none;color:${DIM};font-family:${FONT};font-size:11px;cursor:pointer;padding:6px 8px;border-radius:2px;`;
        cfgBtn.onmouseenter = () => cfgBtn.style.background = HOVER;
        cfgBtn.onmouseleave = () => cfgBtn.style.background = "none";
        toolbar.appendChild(cfgBtn);

        const histBtn = document.createElement("button");
        histBtn.textContent = "LOG";
        histBtn.style.cssText = `background:none;border:none;color:${FG};font-family:${FONT};font-size:11px;cursor:pointer;padding:6px 8px;border-radius:2px;`;
        histBtn.onmouseenter = () => histBtn.style.background = HOVER;
        histBtn.onmouseleave = () => histBtn.style.background = "none";
        toolbar.appendChild(histBtn);

        cfgBtn.onclick = () => {
            const hostname = location.hostname;
            const current = getSiteConfig()[hostname];
            showConfigModal(() => {}, current);
        };

        btn.onclick = async () => {
            const hostname = location.hostname;
            let siteCfg = getSiteConfig()[hostname];
            if (!siteCfg) {
                await new Promise((resolve) => showConfigModal(resolve));
                siteCfg = getSiteConfig()[hostname];
                if (!siteCfg) return;
            }
            const input = getInput(siteCfg.selector, siteCfg.source);
            if (!input) return alert("Selector didn't find an element on this page");

            const cacheKey = input.tld ? `${input.name}.${input.tld}` : input.name;
            const cached = getCacheEntry(cacheKey);
            if (cached) { renderCard(cached, cacheKey, true); return; }

            btn.textContent = "SEARCHING";
            btn.disabled = true;

            if (card) card.remove();
            card = document.createElement("div");
            card.style.cssText = `position:fixed;bottom:80px;right:24px;z-index:99999;background:${BG};border:1px solid ${BORDER};border-radius:4px;padding:16px;font-family:${FONT};font-size:11px;line-height:1.65;color:${FG};max-width:340px;`;
            card.innerHTML = `<div style="letter-spacing:0.5px;">${input.full}</div><div class="status-text" style="color:${DIM};margin-top:4px;">starting...</div>`;
            document.body.appendChild(card);
            const status = (text) => {
                const el = card.querySelector(".status-text");
                if (el) el.textContent = text;
            };



            const result = await enrich(input.name, input.tld, status);
            setCache(cacheKey, result);
            addToHistory({ ...result, site: hostname, url: location.href });
            renderCard(result, cacheKey, false);

            btn.textContent = "ENRICH";
            btn.disabled = false;
        };

        // --- History ---
        let histPanel = null;
        histBtn.onclick = () => {
            if (histPanel) { histPanel.remove(); histPanel = null; return; }
            const history = getHistory();
            histPanel = document.createElement("div");
            histPanel.style.cssText = `position:fixed;bottom:80px;right:24px;z-index:99999;background:${BG};border:1px solid ${BORDER};border-radius:4px;padding:16px;font-family:${FONT};font-size:11px;line-height:1.65;color:${FG};max-width:360px;max-height:60vh;overflow-y:auto;`;
            histPanel.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="letter-spacing:0.5px;">LOG (${history.length})</span>
    <div>
      <button id="hist-csv" style="font-size:11px;color:${ACCENT};background:none;border:none;cursor:pointer;margin-right:8px;font-family:${FONT};">CSV</button>
      <button id="hist-clear" style="font-size:11px;color:#c00;background:none;border:none;cursor:pointer;margin-right:8px;font-family:${FONT};">CLR</button>
      <button class="hist-close" style="background:none;border:none;color:${MUTED};font-family:${FONT};font-size:11px;cursor:pointer;padding:0 4px;">[x]</button>
    </div>
  </div>
  <input id="hist-search" type="text" placeholder="filter..."
    style="width:100%;padding:6px 10px;border-radius:2px;border:1px solid ${BORDER};background:${INPUT_BG};color:${FG};font-family:${FONT};font-size:11px;box-sizing:border-box;margin-bottom:12px;">
  <div id="hist-list">
  ${history.length === 0 ? `<div style="color:${DIM};">no entries</div>` :
            history.map((h, i) => {
                const domain = h.tld ? `${h.product}.${h.tld}` : h.product;
                return `<div class="hist-item" data-search="${(domain + " " + (h.ceo||"") + " " + (h.funding?.amount||"") + " " + new URL(h.url).host).toLowerCase()}" style="margin-bottom:8px;padding:8px;background:${SURFACE};border-left:2px solid ${BORDER};display:flex;justify-content:space-between;align-items:flex-start;">
  <div style="flex:1;min-width:0;">
<div><span class="hist-view" data-idx="${i}" style="color:${ACCENT};cursor:pointer;">${domain}</span> <span style="color:${DIM};">${h.confidence}%</span></div>
    <div style="color:${DIM};margin-top:2px;">${h.ceo ? `CEO: <a href="${h.ceo_linkedin}" target="_blank" style="color:${ACCENT};text-decoration:none;">${h.ceo}</a>` : ""}${h.funding?.amount ? ` · ${h.funding.amount}` : ""}${h.founded ? ` · ${h.founded}` : ""}</div>
    ${h.arr?.value ? ` · ARR: <a href="${h.arr.source}" target="_blank" style="color:${ACCENT};text-decoration:none;">${h.arr.value}</a>` : ""}
    ${h.notes ? `<div style="color:${MUTED};margin-top:2px;">${h.notes}</div>` : ""}
    <div style="color:${MUTED};margin-top:2px;">${new Date(h.timestamp).toLocaleString()} · <a href="${h.url}" data-host="${h.url}" target="_blank" style="color:${MUTED};text-decoration:none;">${new URL(h.url).host}</a></div>
  </div>
  <button class="hist-remove" data-idx="${i}" style="background:none;border:none;color:${MUTED};font-family:${FONT};font-size:11px;cursor:pointer;padding:2px 4px;flex-shrink:0;">[x]</button>
</div>`;
            }).join("")
        }
  </div>
`;
            document.body.appendChild(histPanel);

            histPanel.querySelector(".hist-close").onclick = () => { histPanel.remove(); histPanel = null; };

            histPanel.querySelector("#hist-clear")?.addEventListener("click", (e) => {
                e.stopPropagation();
                clearHistory();
                histPanel.remove();
                histPanel = null;
                histBtn.onclick();
            });

            histPanel.querySelector("#hist-search").oninput = (e) => {
                const q = e.target.value.toLowerCase();
                histPanel.querySelectorAll(".hist-item").forEach(item => {
                    item.style.display = item.dataset.search.includes(q) ? "" : "none";
                });
            };

            histPanel.querySelector("#hist-csv")?.addEventListener("click", (e) => {
                e.stopPropagation();
                const history = getHistory();
                const headers = ["product", "domain", "ceo", "ceo_linkedin", "funding", "founded", "arr", "confidence", "notes", "site", "timestamp", "source"];
                const rows = history.map(h => [
                    h.product,
                    h.tld ? `${h.product}.${h.tld}` : h.product,
                    h.ceo || "",
                    h.ceo_linkedin || "",
                    h.funding?.amount || "",
                    h.founded || "",
                    h.arr || "",
                    h.confidence || 0,
                    (h.notes || "").replace(/"/g, '""'),
                    h.site || "",
                    h.arr?.value || "",
                    h.arr?.source || "",
                    h.timestamp || ""
                ]);
                const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `enrich-history-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            });

            histPanel.querySelectorAll(".hist-remove").forEach(b => {
                b.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(b.dataset.idx);
                    const h = getHistory();
                    const removed = h[idx];
                    h.splice(idx, 1);
                    GM_setValue(HISTORY_KEY, h);
                    if (removed) {
                        const ck = removed.tld ? `${removed.product}.${removed.tld}` : removed.product;
                        const c = getCache();
                        delete c[ck];
                        GM_setValue(CACHE_KEY, c);
                    }
                    histPanel.remove();
                    histPanel = null;
                    histBtn.onclick();
                };
            });

            histPanel.querySelectorAll(".hist-view").forEach(el => {
                el.onclick = () => {
                    const idx = parseInt(el.dataset.idx);
                    const entry = getHistory()[idx];
                    if (!entry) return;

                    // Close history panel
                    histPanel.remove();
                    histPanel = null;

                    // Re-render full card from this entry
                    renderCard(entry, entry.tld ? `${entry.product}.${entry.tld}` : entry.product, true);
                };
            });


        };
    }

    showUI();
})();
