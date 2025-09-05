# X (Twitter) MCP Server

[![npm version](https://img.shields.io/npm/v/x-mcp.svg)](https://www.npmjs.com/package/x-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io/)
[![X API v2](https://img.shields.io/badge/X%20API-v2-1DA1F2?logo=x&logoColor=white)](https://developer.x.com/en/docs/x-api)

An MCP server that provides tools for posting tweets and threads to X (formerly Twitter) using the X API v2.

## 🚀 Features

- **Post single tweets** with optional media, replies, and quotes
- **Post tweet threads** with automatic reply chaining
- **Upload media** (images) for use in tweets
- **Verify authentication** configuration
- Support for both **OAuth 2.0** and **OAuth 1.0a** authentication

## 🛠️ Tools

### `verify_auth`
Verify your authentication configuration and show current settings.

**Parameters:** None

**Example:**
```json
{
  "authType": "oauth2",
  "hasOAuth2AccessToken": true,
  "hasOAuth1": false,
  "apiBase": "https://api.x.com",
  "mediaUploadEndpoint": "https://api.x.com/2/media/upload"
}
```

### `upload_media`
Upload media (images) to X for use in tweets using the new X API v2 endpoint.

**Parameters:**
- `data_base64` (required): Base64-encoded media data (may include data URL prefix)
- `media_type` (optional): MIME type (e.g., "image/png", "image/jpeg")

**Returns:** Media ID string for use in tweets

**Note:** Uses the new `/2/media/upload` endpoint (the legacy v1.1 endpoint is deprecated as of March 2025).

### `post_tweet`
Post a single tweet to X.

**Parameters:**
- `text` (required): Tweet text (1-280 characters)
- `media_ids` (optional): Array of media IDs from `upload_media`
- `in_reply_to_tweet_id` (optional): Tweet ID to reply to
- `quote_tweet_id` (optional): Tweet ID to quote

**Returns:** Tweet ID and URL

### `post_thread`
Post a thread of connected tweets to X.

**Parameters:**
- `items` (required): Array of tweet objects, each with:
  - `text` (required): Tweet text (1-280 characters)
  - `media_ids` (optional): Array of media IDs
- `delay_ms` (optional): Delay between tweets in milliseconds (0-5000, default: 500)

**Returns:** Thread summary with all tweet IDs and first tweet URL

## 🔐 Authentication Setup

### Option 1: OAuth 2.0 User Context (Required for Posting Tweets)

**Important:** To post tweets, you need a **User Context** token, not an Application-Only token.

1. Create a Twitter Developer account at https://developer.twitter.com
2. Create a new app in the Developer Portal
3. Set up OAuth 2.0 settings:
   - Add a redirect URI (e.g., `http://localhost:3000/callback`)
   - Note your Client ID and Client Secret
4. **Generate a User Context Access Token** using OAuth 2.0 Authorization Code flow:
   - Required scopes: `tweet.write`, `tweet.read`, `users.read`
   - Optional: `offline.access` (for refresh tokens)

**Getting User Context Token:**
You need to complete the OAuth 2.0 Authorization Code flow to get a user-specific access token. This requires:
- Directing a user to authorize your app
- Exchanging the authorization code for an access token
- The token will be tied to the specific user who authorized it

Set environment variable:
```bash
export X_OAUTH2_ACCESS_TOKEN="your_user_context_bearer_token_here"
```

**Note:** Application-Only tokens (Client Credentials) cannot post tweets and will result in a 403 error.

### Option 2: OAuth 1.0a

1. Create a Twitter Developer account and app
2. Generate API keys and access tokens

Set environment variables:
```bash
export X_CONSUMER_KEY="your_consumer_key"
export X_CONSUMER_SECRET="your_consumer_secret"
export X_ACCESS_TOKEN="your_access_token"
export X_ACCESS_TOKEN_SECRET="your_access_token_secret"
```

### Legacy Environment Variables

The server also supports legacy `TWITTER_*` prefixed environment variables:
- `TWITTER_OAUTH2_ACCESS_TOKEN`
- `TWITTER_CONSUMER_KEY`
- `TWITTER_CONSUMER_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET`

## 📦 Installation

### From Source

1. Clone the repository:
```bash
git clone https://github.com/BioInfo/x-mcp-server.git
cd x-mcp-server
```

2. Install dependencies and build:
```bash
npm install
npm run build
```

### MCP Configuration

Add to your MCP settings configuration file:

**For VS Code with Roo Cline:**
Edit your MCP settings file:

```json
{
  "mcpServers": {
    "x-mcp": {
      "command": "node",
      "args": ["/path/to/x-mcp-server/build/index.js"],
      "env": {
        "X_OAUTH2_ACCESS_TOKEN": "your_bearer_token_here"
      }
    }
  }
}
```

**For Claude Desktop:**
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x-mcp": {
      "command": "node",
      "args": ["/path/to/x-mcp-server/build/index.js"],
      "env": {
        "X_OAUTH2_ACCESS_TOKEN": "your_bearer_token_here"
      }
    }
  }
}
```

3. Restart your MCP client to load the server

## 📝 Usage Examples

### Verify Authentication
```bash
# Use the verify_auth tool to check your setup
```

### Post a Simple Tweet
```json
{
  "text": "Hello from my MCP server! 🚀"
}
```

### Post a Tweet with Media
```json
{
  "text": "Check out this image!",
  "media_ids": ["1234567890123456789"]
}
```

### Post a Thread
```json
{
  "items": [
    {
      "text": "🧵 Thread about MCP servers (1/3)"
    },
    {
      "text": "MCP (Model Context Protocol) allows AI assistants to connect to external tools and data sources. (2/3)"
    },
    {
      "text": "This X MCP server lets you post tweets and threads directly from your AI assistant! (3/3)"
    }
  ],
  "delay_ms": 1000
}
```

### Reply to a Tweet
```json
{
  "text": "Great point! Thanks for sharing.",
  "in_reply_to_tweet_id": "1234567890123456789"
}
```

## ⚡ API Limits

- Tweet text: 1-280 characters
- Thread delay: 0-5000 milliseconds
- Media uploads: Images supported (PNG, JPEG, GIF, WebP)
- Rate limits apply per X API documentation

## 🔧 Troubleshooting

1. **Authentication errors**: Use `verify_auth` to check your configuration
2. **Rate limiting**: X API has rate limits - space out your requests
3. **Media upload failures**: Ensure base64 data is valid and under size limits
4. **Thread posting issues**: Check that all tweet texts are within character limits

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run directly (for testing)
node build/index.js
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Uses the [X API v2](https://developer.x.com/en/docs/x-api)
- TypeScript and Node.js ecosystem

---

**Made with ❤️ for the MCP community**