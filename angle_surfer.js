// ==UserScript==
// @name         SearXNG Angle Surfer
// @namespace    http://localhost:8888/
// @version      6.0
// @match        http://localhost:8888/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    // ─── State ──────────────────────────────────────────────────────────────────
    let currentGraph = null;
    let currentSeed = "";
    let selectMode = false;
    let selectedNodes = new Set();

    // ─── Autocomplete ───────────────────────────────────────────────────────────
    async function autocomplete(q) {
        try {
            const r = await fetch(`/autocompleter?q=${encodeURIComponent(q)}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
            });
            if (!r.ok) return [];
            return r.json();
        } catch {
            return [];
        }
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    // ─── BFS ────────────────────────────────────────────────────────────────────
    async function buildGraph(seed, depth, maxBranch) {
        const seen = new Set([seed.toLowerCase()]);
        const graph = {};
        let frontier = [seed];

        for (let level = 0; level < depth; level++) {
            const next = [];
            for (const node of frontier) {
                const suggestions = await autocomplete(node);
                const newOnes = suggestions
                .filter((s) => !seen.has(s.toLowerCase()))
                .filter((_, i) => maxBranch === 0 || i < maxBranch);
                graph[node] = newOnes;
                newOnes.forEach((s) => seen.add(s.toLowerCase()));
                next.push(...newOnes);
                await sleep(150);
            }
            frontier = next;
        }
        return graph;
    }

    // ─── HTML escape ────────────────────────────────────────────────────────────
    function esc(s) {
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    // ─── Node row ───────────────────────────────────────────────────────────────
    function makeNodeRow(node, level) {
        const row = document.createElement("div");
        row.className = `as-node level-${Math.min(level, 4)}`;
        row.dataset.node = node;
        row.innerHTML = `<span class="as-toggle">·</span> ${esc(node)}`;
        row.addEventListener("click", () => handleNodeClick(node, row, level));
        return row;
    }

    // ─── Unified click handler ──────────────────────────────────────────────────
    async function handleNodeClick(node, row, level) {
        // Select mode: toggle selection, don't expand
        if (selectMode) {
            row.classList.toggle("selected");
            if (row.classList.contains("selected")) {
                selectedNodes.add(node);
            } else {
                selectedNodes.delete(node);
            }
            return;
        }

        const toggle = row.querySelector(".as-toggle");

        // Already fetched → just toggle visibility
        if (row.dataset.fetched === "1") {
            const kids = row.nextElementSibling;
            if (kids && kids.classList.contains("as-children")) {
                kids.classList.toggle("expanded");
                toggle.textContent = kids.classList.contains("expanded") ? "−" : "+";
            }
            return;
        }

        // Graph already has children (from BFS) → render them
        if (currentGraph && currentGraph[node] && currentGraph[node].length) {
            renderChildren(row, currentGraph[node], level);
            row.dataset.fetched = "1";
            toggle.textContent = "−";
            return;
        }

        // Otherwise → fetch from autocomplete
        toggle.textContent = "…";
        const suggestions = await autocomplete(node);

        if (!suggestions.length) {
            toggle.textContent = "·";
            return;
        }

        if (currentGraph) currentGraph[node] = suggestions;
        renderChildren(row, suggestions, level);
        row.dataset.fetched = "1";
        toggle.textContent = "−";
    }

    // ─── Render children ────────────────────────────────────────────────────────
    function renderChildren(row, children, parentLevel) {
        const kids = document.createElement("div");
        kids.className = "as-children expanded";
        children.forEach((c) => kids.appendChild(makeNodeRow(c, parentLevel + 1)));
        row.insertAdjacentElement("afterend", kids);
    }

    // ─── Render tree ────────────────────────────────────────────────────────────
    function renderTree(graph, seed) {
        const body = document.getElementById("as-body");
        body.innerHTML = "";

        const rootRow = makeNodeRow(seed, 0);
        body.appendChild(rootRow);

        if (graph[seed] && graph[seed].length) {
            renderChildren(rootRow, graph[seed], 0);
            rootRow.dataset.fetched = "1";
            rootRow.querySelector(".as-toggle").textContent = "−";
        }

        const total = Object.values(graph).reduce((a, b) => a + b.length, 0);
        const stats = document.createElement("div");
        stats.className = "as-count";
        stats.textContent = `${total} nodes / ${Object.keys(graph).length} parents`;
        body.appendChild(stats);
    }

    // ─── Panel ──────────────────────────────────────────────────────────────────
    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "angle-surfer-panel";
        panel.innerHTML = `
      <div id="as-resize"></div>
      <div id="as-header">
        <span id="as-title">angle</span>
        <button id="as-close">x</button>
      </div>
      <div id="as-controls">
        <label>depth <input id="as-depth" type="number" value="2" min="1" max="5"></label>
        <label>branch <input id="as-branch" type="number" value="0" min="0" max="20"></label>
        <span class="as-hint">0=all</span>
      </div>
      <div id="as-body">
        <p class="as-hint">type a query, then press surf.</p>
      </div>
      <div id="as-footer">
        <button id="as-surf" class="as-btn">surf</button>
        <button id="as-select" class="as-btn">select</button>
        <button id="as-copy" class="as-btn" disabled>copy</button>
      </div>
    `;

      const style = document.createElement("style");
      style.textContent = `
      #angle-surfer-panel {
        position: fixed;
        top: 0;
        right: -360px;
        width: 340px;
        min-width: 200px;
        max-width: 80vw;
        height: 100vh;
        background: #fff;
        color: #111;
        font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
        font-size: 11px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        transition: right 0.2s ease;
        box-shadow: -4px 0 20px rgba(0,0,0,0.08);
      }
      #angle-surfer-panel.open { right: 0; }

      #as-resize {
        position: absolute;
        left: 0; top: 0;
        width: 5px;
        height: 100%;
        cursor: col-resize;
        z-index: 1;
      }
      #as-resize:hover { background: #e0e0e0; }

      #as-header {
        padding: 10px 14px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #as-title { font-size: 11px; letter-spacing: 0.05em; color: #111; }
      #as-close {
        background: none; border: none; color: #999;
        font-size: 12px; cursor: pointer; font-family: inherit;
      }
      #as-close:hover { color: #111; }

      #as-controls {
        padding: 8px 14px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        gap: 12px;
        align-items: center;
      }
      #as-controls label {
        display: flex; align-items: center; gap: 4px;
        color: #666; font-size: 10px;
      }
      #as-controls input {
        background: #f5f5f5; border: 1px solid #ddd; color: #111;
        padding: 2px 4px; border-radius: 0;
        font-family: inherit; font-size: 10px; width: 32px;
      }
      #as-controls input:focus { border-color: #999; outline: none; }
      .as-hint { color: #999; font-size: 10px; }

      #as-body {
        flex: 1;
        overflow-y: auto;
        overflow-x: auto;
        padding: 10px 14px;
      }
      #as-body::-webkit-scrollbar { width: 4px; height: 4px; }
      #as-body::-webkit-scrollbar-track { background: #fff; }
      #as-body::-webkit-scrollbar-thumb { background: #ddd; }

      #as-footer {
        padding: 8px 14px;
        border-top: 1px solid #e0e0e0;
        display: flex; gap: 8px;
      }
      .as-btn {
        padding: 4px 12px;
        border: 1px solid #ddd;
        border-radius: 0;
        background: none;
        color: #111;
        cursor: pointer;
        font-family: inherit;
        font-size: 10px;
        letter-spacing: 0.05em;
      }
      .as-btn:hover { border-color: #111; }
      .as-btn:disabled { opacity: 0.3; cursor: default; }
      .as-btn:disabled:hover { border-color: #ddd; }
      #as-select.active {
        border-color: #111;
        background: #111;
        color: #fff;
      }

      .as-node {
        margin: 1px 0;
        padding: 2px 4px;
        cursor: pointer;
        white-space: nowrap;
        font-size: 11px;
        color: #333;
        user-select: none;
      }
      .as-node:hover { color: #000; background: #f5f5f5; }
      .as-node.selected {
        background: #f0f0f0;
        border-left: 2px solid #111;
        padding-left: 2px;
      }
      .as-node.level-0 { color: #000; font-weight: 500; }
      .as-node.level-1 { color: #333; }
      .as-node.level-2 { color: #555; }
      .as-node.level-3 { color: #777; }
      .as-node.level-4 { color: #999; }

      .as-children {
        display: none;
        border-left: 1px solid #e0e0e0;
        margin-left: 7px;
        padding-left: 8px;
      }
      .as-children.expanded { display: block; }

      .as-toggle {
        display: inline-block;
        width: 10px;
        color: #bbb;
        user-select: none;
        text-align: center;
      }
      .as-status { color: #999; font-size: 10px; margin-top: 6px; }
      .as-count { color: #999; font-size: 9px; margin-top: 10px; }
    `;
      document.head.appendChild(style);
      document.body.appendChild(panel);

      document.getElementById("as-close").addEventListener("click", () =>
                                                           panel.classList.remove("open")
                                                          );
      document.getElementById("as-surf").addEventListener("click", surf);
      document.getElementById("as-copy").addEventListener("click", copyTree);

      // Select mode toggle
      document.getElementById("as-select").addEventListener("click", () => {
          selectMode = !selectMode;
          const btn = document.getElementById("as-select");
          btn.classList.toggle("active", selectMode);
          btn.textContent = selectMode ? "deselect" : "select";

          if (!selectMode) {
              selectedNodes.clear();
              document.querySelectorAll(".as-node.selected").forEach((el) =>
                                                                     el.classList.remove("selected")
                                                                    );
          }
      });

      // Resize handle
      const handle = document.getElementById("as-resize");
      let resizing = false;

      handle.addEventListener("mousedown", (e) => {
          resizing = true;
          e.preventDefault();
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
      });

      document.addEventListener("mousemove", (e) => {
          if (!resizing) return;
          const newWidth = window.innerWidth - e.clientX;
          if (newWidth >= 200 && newWidth <= window.innerWidth * 0.8) {
              panel.style.width = newWidth + "px";
          }
      });

      document.addEventListener("mouseup", () => {
          if (resizing) {
              resizing = false;
              document.body.style.cursor = "";
              document.body.style.userSelect = "";
          }
      });
  }

    // ─── Search-bar button ──────────────────────────────────────────────────────
    function injectSearchButton() {
        const input =
              document.querySelector("input[name='q']") ||
              document.querySelector("#q");
        if (!input) return;

        const parent = input.parentElement;
        parent.style.display = "flex";
        parent.style.alignItems = "center";
        parent.style.gap = "4px";
        input.style.flex = "1";

        const btn = document.createElement("button");
        btn.id = "as-toggle";
        btn.textContent = "angle";
        btn.type = "button";

        btn.style.cssText = `
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 0;
      background: #fff;
      color: #333;
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.05em;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    `;

      btn.addEventListener("mouseenter", () => {
          btn.style.color = "#000";
          btn.style.borderColor = "#000";
      });
      btn.addEventListener("mouseleave", () => {
          btn.style.color = "#333";
          btn.style.borderColor = "#ddd";
      });
      btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById("angle-surfer-panel").classList.toggle("open");
      });

      const submit = parent.querySelector('button[type="submit"], input[type="submit"]');
      if (submit) {
          submit.insertAdjacentElement("beforebegin", btn);
      } else {
          input.insertAdjacentElement("afterend", btn);
      }
  }

    // ─── Surf ───────────────────────────────────────────────────────────────────
    async function surf() {
        const btn = document.getElementById("as-surf");
        const body = document.getElementById("as-body");
        const copyBtn = document.getElementById("as-copy");

        const input =
              document.querySelector("input[name='q']") ||
              document.querySelector("#q");
        const seed = input ? input.value.trim() : "";
        if (!seed) {
            body.innerHTML = '<p class="as-hint">no query.</p>';
            return;
        }

        const depth = parseInt(document.getElementById("as-depth").value) || 2;
        const maxBranch = parseInt(document.getElementById("as-branch").value) || 0;

        btn.disabled = true;
        btn.textContent = "surfing";
        body.innerHTML = `<p class="as-status">depth=${depth} branch=${maxBranch || "all"} ...</p>`;
        currentSeed = seed;
        selectedNodes.clear();
        selectMode = false;
        document.getElementById("as-select").classList.remove("active");
        document.getElementById("as-select").textContent = "select";

        try {
            const graph = await buildGraph(seed, depth, maxBranch);
            currentGraph = graph;
            renderTree(graph, seed);
            copyBtn.disabled = false;
        } catch (e) {
            body.innerHTML = `<p class="as-hint">error: ${esc(e.message)}</p>`;
        } finally {
            btn.disabled = false;
            btn.textContent = "surf";
        }
    }

    // ─── Copy ───────────────────────────────────────────────────────────────────
    function copyTree() {
        if (selectedNodes.size > 0) {
            const text = [...selectedNodes].join("\n");
            navigator.clipboard.writeText(text).then(flashCopy);
            return;
        }

        if (!currentGraph) return;
        let lines = [currentSeed];

        function walk(node, depth, visited) {
            if (visited.has(node)) return;
            visited.add(node);
            const kids = currentGraph[node] || [];
            kids.forEach((c) => {
                lines.push("  ".repeat(depth) + "+ " + c);
                walk(c, depth + 1, visited);
            });
        }
        walk(currentSeed, 1, new Set());

        navigator.clipboard.writeText(lines.join("\n")).then(flashCopy);
    }

    function flashCopy() {
        const btn = document.getElementById("as-copy");
        btn.textContent = "ok";
        setTimeout(() => (btn.textContent = "copy"), 1000);
    }

    // ─── Init ───────────────────────────────────────────────────────────────────
    createPanel();
    injectSearchButton();
})();
