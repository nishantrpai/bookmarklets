## Scripts

### Google
- **copy_googleautocomplete.js** — Copies all visible Google autocomplete suggestions to the clipboard as newline-separated text.
- **copy_googleresults.js** — Accumulates Google search results (title, link, description) across pages using `localStorage` and downloads them as a CSV file.
- **highlight_googlekeyword.js** — Highlights specific keywords green in Google search results for faster visual scanning during research.

### LinkedIn
- **copy_linkedin_profile.js** — Copies a LinkedIn profile's name, headline, about section, experience, and education to the clipboard as JSON.
- **linkedin_search_scrape.js** — Scrapes LinkedIn search result feed items (name, profile URL, post URL, post text, bio) and downloads them as a CSV.

### Twitter / X
- **twitter_replies.js** — Collects tweet replies as you scroll a thread and downloads them as a CSV file.
- **twitter_search_scrape.js** — Scrapes Twitter search result tweets and downloads them as a CSV file.
- **twitter_user_scrape.js** — Scrapes user profiles encountered while scrolling Twitter and downloads them (username, display name, profile URL, bio) as a CSV.
- **twitter_username_scrape.js** — Extracts unique usernames from any Twitter page by scrolling and copies them to the clipboard.

### Reddit
- **reddit_search_comments.js** — Copies the text of all visible Reddit search-result comments to the clipboard.
- **reddit_search_comments_titles.js** — Copies the titles of all visible Reddit search-result comment threads to the clipboard.
- **reddit_search_posts_titles.js** — Copies the titles of all visible Reddit post links to the clipboard.
- **reddit_search_q+a.js** — Copies Reddit Q&A thread titles from a search results page to the clipboard.

### YouTube
- **youtube_loop.js** — Adds a floating UI on YouTube to set a custom start/end loop for the current video. Useful for focused listening or studying a specific clip.

### G2
- **copy_g2_reviews_like.js** — Scrapes "What do you like best about…" answers from G2 review pages and stores/appends them across pages using `localStorage`.
- **copy_g2_reviews_dislikes.js** — Scrapes "What do you dislike about…" answers from G2 review pages and stores/appends them across pages using `localStorage`.

### Quora
- **quora_search_titles.js** — Copies all question titles visible on a Quora search results page to the clipboard.

### Shell
- **checkdomain.sh** — Checks whether a project name is available (404/DNS miss) or taken across common AI, no-code, and developer hosting platforms (Vercel, Netlify, Railway, GitHub Pages, Supabase, Replit, etc.).

---

*Minified variants (`*.min.js`) are compressed versions of their corresponding scripts for use directly as bookmarklet URLs.*