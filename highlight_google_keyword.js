javascript:(function() {
    // Function to parse the CPC value
    function parseCPC(cpcText) {
        if (!cpcText) return 0;
        const value = parseFloat(cpcText.replace('₹', '').replace(',', ''));
        return isNaN(value) ? 0 : value;
    }

    // Function to parse growth percentage
    function parseGrowth(growthText) {
      console.log(`Parsing growth text: ${growthText}`);
        if(growthText == '+∞') return Infinity; // Handle infinite growth
        if (!growthText) return 0;
        return parseFloat(growthText.replace('%', '').replace(',', ''));
    }

    // Function to check if keyword indicates a job or problem
    function isJobOrProblem(keyword) {
        const jobTerms = ['how to', 'vs', 'solution', 'problem', 'fix', 'best', 'help', 'service', 'hire'];
        return jobTerms.some(term => keyword.toLowerCase().includes(term));
    }

    // Function to check if keyword is too generic
    function isGeneric(keyword) {
        const genericTerms = ['free', 'online', 'best', 'top', 'new', 'cheap', 'latest'];
        return genericTerms.some(term => keyword.toLowerCase() === term);
    }

    // Main function to analyze and highlight rows
    function analyzeAndHighlight() {
      console.log('Starting keyword analysis...');
        const rows = document.querySelectorAll('div.particle-table-row[role="row"]');
        
        console.log(`Found ${rows.length} rows to analyze.`);
        rows.forEach(row => {
            if (!(row instanceof HTMLElement)) return;
            
            const keywordCell = row.querySelector('ess-cell[essfield="text"] span.keyword');
            const growthCell = row.querySelector('ess-cell[essfield="recent_search_trend_change"] text-field');
            console.log(`Growth cell content: ${growthCell?.textContent}`);
            const competitionCell = row.querySelector('ess-cell[essfield="competition"] text-field');
            const cpcCell = row.querySelector('ess-cell[essfield="bid_min"] text-field');

            if (!keywordCell?.textContent || !growthCell?.textContent || 
                !competitionCell?.textContent || !cpcCell?.textContent) return;

            const keyword = keywordCell.textContent.trim();
            let growth = parseGrowth(growthCell.textContent.trim());
            const competition = competitionCell.textContent.trim().toLowerCase();
            const cpc = parseCPC(cpcCell.textContent.trim());

            // Skip if keyword is too generic
            if (isGeneric(keyword)) {
                row.style.backgroundColor = '#ffcccb'; // Light red for keywords to avoid
                return;
            }

            // Highlight high potential keywords
            console.log(`Analyzing keyword: ${keyword}, Growth: ${growth}, Competition: ${competition}, CPC: ${cpc}`);
            if (
                (growth >= 900 || growth === Infinity) &&
                competition === 'low'
                // cpc >= 500 &&
                // isJobOrProblem(keyword)
            ) {
                row.style.backgroundColor = '#c3ebc3'; // Light green for opportunity
            }
            // if negative growth, highlight in red
            else if (growth < 0) {
                row.style.backgroundColor = '#ffcccb'; // Light red for negative growth
            }
        });
    }

    // Run the analysis
    analyzeAndHighlight();

    // Add observer for dynamic content
    const observer = new MutationObserver(analyzeAndHighlight);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();