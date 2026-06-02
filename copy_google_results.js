javascript:(function() {
    const STORAGE_KEY = 'google_search_results';
    
    function clean(text) {
        return (text || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
    }

    function getStoredResults() {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [['title', 'link', 'description']];
    }

    function saveResults(rows) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }

    function processResults() {
        const rows = getStoredResults();
        const results = [...document.querySelectorAll('div.tF2Cxc')];
        let newCount = 0;
        
        results.forEach(r => {
            const title = clean(r.querySelector('h3')?.textContent || 'no title');
            const link = clean(r.querySelector('a')?.href || 'no link');
            const description = clean(r.querySelector('.VwiC3b')?.textContent || 'no description');
            
            // Check if this result already exists to avoid duplicates
            const exists = rows.some(row => row[1] === link);
            if (!exists && link !== 'no link') {
                rows.push([title, link, description]);
                newCount++;
            }
        });
        
        saveResults(rows);
        updateButtonText();
        console.log(`Added ${newCount} new results. Total: ${rows.length - 1}`);
        return newCount;
    }

    function downloadCSV() {
        const rows = getStoredResults();
        const csvContent = rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `google_results_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function clearResults() {
        localStorage.removeItem(STORAGE_KEY);
        updateButtonText();
        console.log('Cleared all stored results');
    }

    function updateButtonText() {
        const rows = getStoredResults();
        const count = rows.length - 1; // Subtract header row
        const downloadBtn = document.getElementById('google-csv-download');
        if (downloadBtn) {
            downloadBtn.textContent = `Download CSV (${count})`;
        }
    }

    function createButtons() {
        // Remove existing buttons to avoid duplicates
        const existingDownload = document.getElementById('google-csv-download');
        const existingClear = document.getElementById('google-csv-clear');
        if (existingDownload) existingDownload.remove();
        if (existingClear) existingClear.remove();

        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'google-csv-download';
        downloadBtn.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#1da1f2;color:white;padding:8px 12px;z-index:9999;border:none;border-radius:5px;cursor:pointer;font-family:sans-serif;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);';
        downloadBtn.onclick = downloadCSV;
        document.body.appendChild(downloadBtn);

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.id = 'google-csv-clear';
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = 'position:fixed;bottom:10px;right:140px;background:#dc3545;color:white;padding:8px 12px;z-index:9999;border:none;border-radius:5px;cursor:pointer;font-family:sans-serif;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);';
        clearBtn.onclick = clearResults;
        document.body.appendChild(clearBtn);

        // Instructions button
        const infoBtn = document.createElement('button');
        infoBtn.textContent = '?';
        infoBtn.style.cssText = 'position:fixed;bottom:10px;right:200px;background:#28a745;color:white;padding:8px 12px;z-index:9999;border:none;border-radius:5px;cursor:pointer;font-family:sans-serif;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);';
        infoBtn.onclick = () => alert('Instructions:\n1. Run this bookmarklet on each Google search results page\n2. Navigate to next page and run again\n3. Results accumulate automatically\n4. Click Download when finished\n5. Click Clear to start fresh');
        document.body.appendChild(infoBtn);

        updateButtonText();
    }

    // Create buttons
    createButtons();

    // Process current page results
    const newResults = processResults();

    // Show status message
    const statusMsg = document.createElement('div');
    statusMsg.style.cssText = 'position:fixed;top:10px;right:10px;background:#000;color:#fff;padding:8px 12px;z-index:9999;border-radius:5px;font-family:sans-serif;font-size:12px;';
    statusMsg.textContent = `Added ${newResults} results from this page`;
    document.body.appendChild(statusMsg);
    setTimeout(() => statusMsg.remove(), 3000);

    console.log('Google search results collector active. Run this bookmarklet on each new page to accumulate results.');
})();