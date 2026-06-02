javascript:(async function() {
  // Extract search query from URL
  const searchQuery = (() => {
    const urlPath = window.location.pathname;
    if (urlPath.includes('/search')) {
      const searchParam = new URLSearchParams(window.location.search).get('q');
      return searchParam || urlPath.split('/search/')[1]?.split('?')[0] || 'twitter-search';
    }
    return 'twitter-search';
  })();
  
  const rows = [['name','tweet_url','tweet_text']];
  const seen = new Set();
  let mutationTimer;
  const MUTATION_TIMEOUT = 5000; // 5 seconds without mutations before downloading
  
  function clean(text) {
    return (text || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  }

  function resetMutationTimer() {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(finishCollection, MUTATION_TIMEOUT);
    status.textContent = `Collecting "${searchQuery}"... (${rows.length - 1} tweets)`;
  }

  function finishCollection() {
    observer.disconnect();
    document.body.removeChild(status);
    
    // Add search query as first row
    const csvData = [`"search_query","${clean(searchQuery)}"`];
    csvData.push(''); // Empty line after search query
    
    // Add the rest of the data
    csvData.push(...rows.map(r => r.map(x => `"${x}"`).join(',')));
    
    const csv = csvData.join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Include the search query in the filename (cleaned for valid filename)
    const safeSearchQuery = searchQuery.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    a.download = `twitter_${safeSearchQuery}_${new Date().toISOString().split('T')[0]}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`Finished! Collected ${rows.length - 1} unique tweets for search: "${searchQuery}"`);
  }

  async function processTweet(tweet) {
    try {
      const userLink = tweet.querySelector('div[data-testid="User-Name"] a[role="link"][href^="/"]');
      const tweetLink = tweet.querySelector('a[href*="/status/"]');
      const textEl = tweet.querySelector('[data-testid="tweetText"]');
      
      if (!userLink || !tweetLink || !textEl) return;

      const tweetURL = `https://x.com${tweetLink.getAttribute('href').split('?')[0]}`;
      if (seen.has(tweetURL)) return;
      seen.add(tweetURL);

      const name = clean(userLink.innerText);
      const tweetText = clean(textEl.innerText);

      // Only include name, tweet URL, and tweet text (no profile URL)
      rows.push([name, tweetURL, tweetText]);
      console.log(`Processed tweet from: ${name} (Total: ${rows.length - 1})`);
    } catch (e) {
      console.error('Tweet processing error:', e);
    }
  }

  // Create status element
  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;bottom:10px;right:10px;background:black;color:white;padding:10px;z-index:9999;border-radius:5px;';
  document.body.appendChild(status);
  
  const observer = new MutationObserver(async (mutations) => {
    // Only process if mutations affected tweet content
    const relevantMutations = mutations.some(mutation => 
      mutation.target.querySelector('article[data-testid="tweet"]')
    );
    
    if (relevantMutations) {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      for (const tweet of tweets) {
        await processTweet(tweet);
      }
      resetMutationTimer();
    }
  });

  // Start observing with more specific targeting
  observer.observe(document.querySelector('main'), {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  // Process any tweets that are already on the page
  const initialTweets = document.querySelectorAll('article[data-testid="tweet"]');
  for (const tweet of initialTweets) {
    await processTweet(tweet);
  }
  
  // Start initial timer
  resetMutationTimer();
  
  console.log(`Started collecting tweets for search: "${searchQuery}". Scroll to load more tweets. Collection will finish after 5 seconds of no new tweets.`);
})();