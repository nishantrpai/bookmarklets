javascript:(async function() {
  const rows = [['name','profile_url','tweet_url','tweet_text']];
  const seen = new Set();
  let mutationTimer;
  const MUTATION_TIMEOUT = 5000; // 5 seconds without mutations before downloading
  
  function clean(text) {
    return (text || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  }

  function resetMutationTimer() {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(finishCollection, MUTATION_TIMEOUT);
    status.textContent = `Collecting... (${rows.length - 1} tweets)`;
  }

  function finishCollection() {
    observer.disconnect();
    document.body.removeChild(status);
    
    // Download CSV
    const csv = rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'twitter_tweets.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`Finished! Collected ${rows.length - 1} unique tweets`);
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
      const profileURL = `https://x.com${userLink.getAttribute('href').split('?')[0]}`;
      const tweetText = clean(textEl.innerText);

      rows.push([name, profileURL, tweetURL, tweetText]);
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
  
  // Start initial timer
  resetMutationTimer();
  
  console.log('Started collecting tweets. Scroll to load more tweets. Collection will finish after 5 seconds of no new tweets.');
})();