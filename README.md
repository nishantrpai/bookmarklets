## Scripts

### Google
- **copy_google_autocomplete.js** — Copies all visible Google autocomplete suggestions to the clipboard as newline-separated text.
- **copy_google_results.js** — Accumulates Google search results (title, link, description) across pages using `localStorage` and downloads them as a CSV file.
- **highlight_google_keyword.js** — Highlights specific keywords green in Google search results for faster visual scanning during research.

### LinkedIn
- **copy_linkedin_profile.js** — Copies a LinkedIn profile's name, headline, about section, experience, and education to the clipboard as JSON.
- **get_linkedin_search_results.js** — Scrapes LinkedIn search result feed items (name, profile URL, post URL, post text, bio) and downloads them as a CSV.

### Twitter / X
- **get_twitter_replies.js** — Collects tweet replies as you scroll a thread and downloads them as a CSV file.
- **get_twitter_search_results.js** — Scrapes Twitter search result tweets and downloads them as a CSV file.
- **get_twitter_users.js** — Scrapes user profiles encountered while scrolling Twitter and downloads them (username, display name, profile URL, bio) as a CSV.
- **copy_twitter_usernames.js** — Extracts unique usernames from any Twitter page by scrolling and copies them to the clipboard.

### Reddit
- **copy_reddit_search_comments.js** — Copies the text of all visible Reddit search-result comments to the clipboard.
- **copy_reddit_search_comment_titles.js** — Copies the titles of all visible Reddit search-result comment threads to the clipboard.
- **copy_reddit_search_post_titles.js** — Copies the titles of all visible Reddit post links to the clipboard.
- **copy_reddit_search_qa.js** — Copies Reddit Q&A thread titles from a search results page to the clipboard.

### YouTube
- **copy_youtube_comments.js** — Copies visible YouTube comments to the clipboard.
- **loop_youtube_video.js** — Adds a floating UI on YouTube to set a custom start/end loop for the current video. Useful for focused listening or studying a specific clip.

### G2
- **copy_g2_review_likes.js** — Scrapes "What do you like best about…" answers from G2 review pages and stores/appends them across pages using `localStorage`.
- **copy_g2_review_dislikes.js** — Scrapes "What do you dislike about…" answers from G2 review pages and stores/appends them across pages using `localStorage`.

### Quora
- **copy_quora_search_titles.js** — Copies all question titles visible on a Quora search results page to the clipboard.

### Shell
- **check_domain.sh** — Checks whether a project name is available (404/DNS miss) or taken across common AI, no-code, and developer hosting platforms (Vercel, Netlify, Railway, GitHub Pages, Supabase, Replit, etc.).
- **check_email_provider.sh** — Checks a domain's MX records and identifies the likely email provider.

### Node
- **scan_stack.js** — Fetches one or more URLs and detects common frontend/platform/server signatures from response headers and HTML.

---

*Minified variants (`*.min.js`) are compressed versions of their corresponding scripts for use directly as bookmarklet URLs.*