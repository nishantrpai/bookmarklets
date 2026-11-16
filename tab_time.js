// ==UserScript==
// @name         Always-On Tab Title Stopwatch
// @namespace    http://tampermonkey.net
// @version      1.0
// @description  Automatically displays a persistent stopwatch in every tab title by default.
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const START_KEY = '_tm_sw_start';
    let origTitle = document.title;

    let start = Number(sessionStorage.getItem(START_KEY));
    if (!start) {
        start = Date.now();
        sessionStorage.setItem(START_KEY, start);
    }

    function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return (h ? h + ':' : '') +
            (m < 10 ? '0' : '') + m + ':' +
            (sec < 10 ? '0' : '') + sec;
    }

    function updateTitle() {
        if (!document.title.includes(' | ') || !document.title.endsWith(origTitle)) {
            const parts = document.title.split(' | ');
            origTitle = parts.length > 1 ? parts.slice(1).join(' | ') : document.title;
        }

        document.title = `${formatTime(Date.now() - start)} | ${origTitle}`;
    }

    GM_registerMenuCommand('Reset Stopwatch', () => {
        start = Date.now();
        sessionStorage.setItem(START_KEY, start);
        updateTitle();
    });



    updateTitle();
    setInterval(updateTitle, 1000);
})();
