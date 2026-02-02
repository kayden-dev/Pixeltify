# Pixeltify

A full-stack music guessing game that uses Spotify OAuth and a server-side image pixelation pipeline to turn album art into a progressively clearer puzzle across five rounds.

Built as a solo project (Mar 2024 – May 2024), integrating the Spotify Web API, OAuth 2.0 with CSRF protection, and Jimp for image processing.

## Features

- **Spotify Login** — OAuth 2.0 authorization code flow with CSRF state validation and HTTP-only cookie-based sessions.
- **Top Tracks Fetching** — Pulls a user’s top 200 tracks (long-term) to select a random album.
- **Progressive Pixelation** — Dynamically reduces pixel block size from 320px → 160px → 80px → 40px → 20px across five rounds.
- **Album Search** — Search albums by artist/song/album name and show the top 5 unique results.
- **Guess Validation** — Server-side image comparison confirms whether the selected album cover matches.
- **Responsive UI** — Built with EJS and Bootstrap, with jQuery for quick interactions.

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Runtime    | Node.js (ES Modules)               |
| Backend    | Express.js                          |
| API        | Spotify Web API                     |
| Imaging    | Jimp                                |
| Templating | EJS                                 |
| Frontend   | Bootstrap 5, jQuery                 |
| Config     | dotenv                              |

## Game Flow

1. User logs in with Spotify and grants `user-top-read`.
2. Server fetches top tracks and selects a random album.
3. Album art is pixelated and sent as a base64 data URL.
4. User searches for the album and selects from the top 5 unique results.
5. Correct guesses reveal the album details; incorrect guesses increase image clarity.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Spotify Developer app with a configured Redirect URI

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/pixeltify.git
   cd pixeltify
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:
   ```
   PORT=3000
   CLIENT_ID=your_spotify_client_id
   CLIENT_SECRET=your_spotify_client_secret
   REDIRECT_URI=http://localhost:3000/callback
   ```

4. Start the server:
   ```bash
   node index.js
   ```

5. Open `http://localhost:3000` in your browser.

## Project Structure

```
index.js        — Express server, Spotify auth flow, game logic, image processing
views/          — EJS templates
public/         — Client-side JS and static assets
```

## Notes

- Access tokens expire after 1 hour; refresh tokens are used to request new access tokens.
- Cookies are set with `secure: true`, so local development without HTTPS may require adjusting this flag.
- Image matching uses visual similarity instead of metadata matching.
