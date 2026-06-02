javascript:(async function() {
  // Extract tweet ID and username from URL
  const getTweetInfo = () => {
    const urlPath = window.location.pathname;
    const match = urlPath.match(/\/([^\/]+)\/status\/(\d+)/);
    if (match) {
      return {
        username: match[1],
        tweetId: match[2],
        identifier: `@${match[1]}_${match[2]}`
      };
    }
    return {
      username: 'unknown',
      tweetId: 'unknown',
      identifier: 'twitter-replies'
    };
  };
  
  const tweetInfo = getTweetInfo();
  const rows = [['reply_author','reply_url','reply_text','reply_time','likes','retweets']];
  const seen = new Set();
  let mutationTimer;
  const MUTATION_TIMEOUT = 5000; // 5 seconds without mutations before downloading
  
  function clean(text) {
    return (text || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  }

  function resetMutationTimer() {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(finishCollection, MUTATION_TIMEOUT);
    status.textContent = `Collecting replies to ${tweetInfo.identifier}... (${rows.length - 1} replies)`;
  }

  function finishCollection() {
    observer.disconnect();
    document.body.removeChild(status);
    
    // Add tweet info as first row
    const csvData = [`"main_tweet_author","${clean(tweetInfo.username)}"`];
    // add link for tweet instead of tweet id
    csvData.push(`"main_tweet_id","https://x.com/${clean(tweetInfo.username)}/status/${clean(tweetInfo.tweetId)}"`);
    csvData.push(''); // Empty line after tweet info
    
    // Add the rest of the data
    csvData.push(...rows.map(r => r.map(x => `"${x}"`).join(',')));
    
    const csv = csvData.join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Include the tweet info in the filename
    const safeIdentifier = tweetInfo.identifier.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    a.download = `twitter_replies_${safeIdentifier}_${new Date().toISOString().split('T')[0]}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`Finished! Collected ${rows.length - 1} unique replies for tweet: ${tweetInfo.identifier}`);
  }

  async function processReply(tweet) {
    try {
      const userLink = tweet.querySelector('div[data-testid="User-Name"] a[role="link"][href^="/"]');
      const tweetLink = tweet.querySelector('a[href*="/status/"]');
      const textEl = tweet.querySelector('[data-testid="tweetText"]');
      const timeEl = tweet.querySelector('time');
      
      if (!userLink || !tweetLink || !textEl) return;

      const replyURL = `https://x.com${tweetLink.getAttribute('href').split('?')[0]}`;
      if (seen.has(replyURL)) return;
      
      // Skip if this is the main tweet (not a reply)
      if (replyURL.includes(`/status/${tweetInfo.tweetId}`)) return;
      
      seen.add(replyURL);

      const replyAuthor = clean(userLink.innerText);
      const replyText = clean(textEl.innerText);
      const replyTime = timeEl ? timeEl.getAttribute('datetime') || clean(timeEl.innerText) : '';
      
      // Extract engagement metrics
      const likeButton = tweet.querySelector('[data-testid="like"]');
      const retweetButton = tweet.querySelector('[data-testid="retweet"]');
      
      let likes = '0';
      let retweets = '0';
      
      if (likeButton) {
        const likeText = likeButton.getAttribute('aria-label') || '';
        const likeMatch = likeText.match(/(\d+)/);
        if (likeMatch) likes = likeMatch[1];
      }
      
      if (retweetButton) {
        const retweetText = retweetButton.getAttribute('aria-label') || '';
        const retweetMatch = retweetText.match(/(\d+)/);
        if (retweetMatch) retweets = retweetMatch[1];
      }

      rows.push([replyAuthor, replyURL, replyText, replyTime, likes, retweets]);
      console.log(`Processed reply from: ${replyAuthor} (Total: ${rows.length - 1})`);
    } catch (e) {
      console.error('Reply processing error:', e);
    }
  }

  // Create status element
  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;bottom:10px;right:10px;background:black;color:white;padding:10px;z-index:9999;border-radius:5px;font-family:sans-serif;';
  document.body.appendChild(status);
  
  // Create manual download button
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download CSV Now';
  downloadBtn.style.cssText = 'position:fixed;bottom:60px;right:10px;background:#1da1f2;color:white;padding:8px 12px;z-index:9999;border:none;border-radius:5px;cursor:pointer;font-family:sans-serif;';
  downloadBtn.onclick = finishCollection;
  document.body.appendChild(downloadBtn);
  
  const observer = new MutationObserver(async (mutations) => {
    // Only process if mutations affected tweet content
    const relevantMutations = mutations.some(mutation => 
      mutation.target.nodeType === 1 && 
      mutation.target instanceof Element && 
      mutation.target.querySelector('article[data-testid="tweet"]')
    );
    
    if (relevantMutations) {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      for (const tweet of tweets) {
        await processReply(tweet);
      }
      resetMutationTimer();
    }
  });

  // Start observing with more specific targeting
  const mainElement = document.querySelector('main');
  if (mainElement) {
    observer.observe(mainElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
  }

  // Process any tweets that are already on the page
  const initialTweets = document.querySelectorAll('article[data-testid="tweet"]');
  for (const tweet of initialTweets) {
    await processReply(tweet);
  }

  // Start initial timer
  resetMutationTimer();

  console.log(`Started collecting replies for tweet: ${tweetInfo.identifier}. Scroll to load more replies. Collection will finish after 5 seconds of no new replies, or click the download button.`);
})();
