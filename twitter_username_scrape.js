javascript:(async function() {
  const usernames = new Set();
  const scrollDelay = 1000; // Time to wait between scrolls
  const maxScrolls = 10; // Maximum number of scrolls to perform
  
  async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function scrapeUsernames() {
    document.querySelectorAll('article[data-testid="tweet"] div[data-testid="User-Name"] a[role="link"][href^="/"]').forEach(link => {
      const username = link.getAttribute('href').split('/')[1].split('?')[0];
      if (username) usernames.add(username);
    });
    console.log(`Found ${usernames.size} unique usernames so far...`);
  }

  // Initial scrape
  await scrapeUsernames();

  // Scroll and scrape
  let lastHeight = document.documentElement.scrollHeight;
  let scrollCount = 0;

  while (scrollCount < maxScrolls) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(scrollDelay);
    
    await scrapeUsernames();
    
    let newHeight = document.documentElement.scrollHeight;
    if (newHeight === lastHeight) {
      console.log('Reached end of feed or no new content loaded');
      break;
    }
    lastHeight = newHeight;
    scrollCount++;
  }

  // Convert to array and create CSV
  const rows = [['username']].concat([...usernames].map(u => [u]));
  const csv = rows.map(r => r.join(',')).join('\n');
  
  // Download as CSV
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'twitter_usernames.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log(`Finished! Collected ${usernames.size} unique usernames`);
})();