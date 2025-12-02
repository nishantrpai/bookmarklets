javascript:(function(){
  const profile = {};

  // Name
  const nameEl = document.querySelector('h1');
  profile.name = nameEl ? nameEl.textContent.trim() : '';

  // Headline
  const headlineEl = document.querySelector('div.text-body-medium.break-words');
  profile.headline = headlineEl ? headlineEl.textContent.trim() : '';

  // About
  const aboutEl = document.querySelector('section.pv-profile-card');
  // remove about from about text using regex lotta new lines too
  profile.about = aboutEl ? aboutEl.textContent.trim() : '';

  // Experience
  const experienceSection = document.querySelector('#experience')?.parentElement;
  const experienceEls = experienceSection ? experienceSection.querySelectorAll('ul li') : [];
  profile.experience = Array.from(experienceEls).map(el => {
    const title = el.querySelector('div.hoverable-link-text.t-bold span[aria-hidden="true"]')?.textContent.trim() || '';
    const company = el.querySelector('span.t-14.t-normal')?.textContent.trim() || '';
    const dates = el.querySelector('span.t-14.t-normal.t-black--light')?.textContent.trim() || '';
    return { title, company, dates };
  });

  // Posts
  const postEls = document.querySelectorAll('.feed-shared-update-v2');
  profile.posts = Array.from(postEls).map(el => {
    const text = el.querySelector('.update-components-text')?.innerText.trim() || '';
    const date = el.querySelector('.update-components-actor__sub-description-link')?.textContent.trim() || '';
    return { text, date };
  });

  // Copy to clipboard
  const text = JSON.stringify(profile, null, 2);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    alert('Profile copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy: ', err);
    alert('Failed to copy profile. Check console for details.');
  }
  document.body.removeChild(textarea);
})();