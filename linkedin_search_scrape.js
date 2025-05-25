javascript:(function(){
  const seen = new Set();
  const rows = [['name','profile_url','post_url','post_text','bio']];

  document.querySelectorAll('.update-components-actor__container').forEach(container => {
    const profileLink = container.querySelector('a[href*="/in/"], a[href*="/pub/"]');
    const postContainer = container.closest('.feed-shared-update-v2');

    if (!profileLink || !postContainer) return;

    const profileURL = profileLink.href.split('?')[0].replace(/"/g, '');
    if (seen.has(profileURL)) return;
    seen.add(profileURL);

    const nameSpan = container.querySelector('.update-components-actor__title span[dir="ltr"]');
    let name = nameSpan?.textContent?.trim() || 'unknown';
    name = name.replace(/[^\p{L}\p{N} .'-]/gu, '').trim();

    const postTextEl = postContainer.querySelector('.update-components-text');
    const postText = postTextEl?.innerText.replace(/\s+/g, ' ').trim().replace(/"/g, "'") || '';

    const postURLAnchor = postContainer.querySelector('a[href*="/posts/"], a[href*="/activity/"]');
    const postURL = postURLAnchor?.href.split('?')[0] || '';

    // try to get bio from accessible hovercard or fallback
    let bio = '';
    const alt = container.querySelector('.update-components-actor__description')?.textContent?.trim();
    if (alt) bio = alt;
    else {
      const hovercard = container.closest('.feed-shared-update-v2')?.querySelector('.artdeco-hoverable-trigger__content span')?.textContent?.trim();
      if (hovercard) bio = hovercard;
    }
    bio = bio.replace(/\s+/g, ' ').replace(/"/g, "'");

    rows.push([name, profileURL, postURL, postText, bio]);
  });

  const csv = rows.map(r => r.map(field => `"${field}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'linkedin_posts_with_bio.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
})();
