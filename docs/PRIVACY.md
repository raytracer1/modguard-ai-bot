# Privacy Policy for ModGuard AI

**Last updated: 2026-05-28**

## 1. Data Collection

ModGuard AI processes the following data within Reddit's Devvit platform:

- **Content for analysis**: Post titles, bodies, and comment text from the subreddit's mod queue
- **User metadata**: Reddit usernames, account age, karma scores, posting frequency, prior removal/ban history
- **Moderation history**: Decisions made by moderators (approve, remove, spam, ban), stored for precedent analysis

## 2. How Data Is Used

- Content and metadata are analyzed locally via a rule engine to generate risk scores and rule matches
- For high-priority or ambiguous content, data is sent to the **DeepSeek API** (`api.deepseek.com`) for AI-powered context analysis via a relay proxy (`modguard-relay.vercel.app`)
- Analysis results are cached temporarily in Devvit Redis for performance (expires after 10 minutes)
- Moderation decisions are stored as precedents to improve future analysis accuracy

## 3. Data Sharing

- **No user data is sold, shared with third parties, or used for advertising**
- Data sent to DeepSeek API is used solely for content analysis and is not stored by DeepSeek (per their API policy: https://api-docs.deepseek.com)
- All data remains within the Devvit platform and the DeepSeek API transit path

## 4. Data Retention

- Analysis caches expire automatically after 10 minutes
- Moderation precedents are retained to improve analysis quality
- User posting activity counters expire after the configured frequency window

## 5. Data Subject Rights

Reddit users concerned about data processed by this App may contact the subreddit moderators or the app developer. Since all data originates from public Reddit activity, Reddit's own privacy controls apply.

## 6. Security

- API communication uses HTTPS encryption
- API authentication is enforced via bearer tokens
- The app runs entirely within Reddit's Devvit sandbox

## 7. Contact

For privacy-related inquiries, contact the app developer through the Reddit Devvit platform.
