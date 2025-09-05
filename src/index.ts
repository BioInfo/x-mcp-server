#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import axios, { AxiosError } from "axios";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import FormData from "form-data";

type AuthType = "oauth2" | "oauth1" | "none";

const ENV = {
  OAUTH2_ACCESS_TOKEN: process.env.X_OAUTH2_ACCESS_TOKEN || process.env.TWITTER_OAUTH2_ACCESS_TOKEN,
  CONSUMER_KEY: process.env.X_CONSUMER_KEY || process.env.TWITTER_CONSUMER_KEY,
  CONSUMER_SECRET: process.env.X_CONSUMER_SECRET || process.env.TWITTER_CONSUMER_SECRET,
  ACCESS_TOKEN: process.env.X_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN,
  ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_TOKEN_SECRET,
  API_BASE: process.env.X_API_BASE || "https://api.x.com"
};

function getAuthType(): AuthType {
  if (ENV.OAUTH2_ACCESS_TOKEN) return "oauth2";
  if (ENV.CONSUMER_KEY && ENV.CONSUMER_SECRET && ENV.ACCESS_TOKEN && ENV.ACCESS_TOKEN_SECRET) return "oauth1";
  return "none";
}

function buildOAuth1(): OAuth {
  if (!ENV.CONSUMER_KEY || !ENV.CONSUMER_SECRET) {
    throw new Error("OAuth 1.0a credentials missing: X_CONSUMER_KEY and X_CONSUMER_SECRET");
  }
  return new OAuth({
    consumer: { key: ENV.CONSUMER_KEY, secret: ENV.CONSUMER_SECRET },
    signature_method: "HMAC-SHA1",
    hash_function(base_string: string, key: string) {
      return crypto.createHmac("sha1", key).update(base_string).digest("base64");
    }
  });
}

function absoluteUrl(base: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function getAuthHeaders(method: string, url: string): Record<string, string> {
  const type = getAuthType();
  if (type === "oauth2") {
    return { Authorization: `Bearer ${ENV.OAUTH2_ACCESS_TOKEN}` };
  } else if (type === "oauth1") {
    const oauth = buildOAuth1();
    if (!ENV.ACCESS_TOKEN || !ENV.ACCESS_TOKEN_SECRET) {
      throw new Error("OAuth 1.0a credentials missing: X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET");
    }
    const token = { key: ENV.ACCESS_TOKEN, secret: ENV.ACCESS_TOKEN_SECRET };
    const auth = oauth.toHeader(oauth.authorize({ url, method }, token));
    return auth.Authorization ? { Authorization: auth.Authorization } : {};
  }
  throw new Error("No authentication configured. Provide X_OAUTH2_ACCESS_TOKEN or OAuth 1.0a credentials.");
}

function cleanupBase64(data: string): string {
  return data.replace(/^data:[^;]+;base64,/, "").trim();
}

const verifyAuthSchema = z.object({});
const uploadMediaSchema = z.object({
  data_base64: z.string().describe("Base64-encoded media. May include a data URL prefix."),
  media_type: z.string().optional().describe("MIME type, e.g. image/png or image/jpeg")
});
const postTweetSchema = z.object({
  text: z.string().min(1).max(280),
  media_ids: z.array(z.string()).optional(),
  in_reply_to_tweet_id: z.string().optional(),
  quote_tweet_id: z.string().optional()
});
const postThreadSchema = z.object({
  items: z.array(
    z.object({
      text: z.string().min(1).max(280),
      media_ids: z.array(z.string()).optional()
    })
  ).min(2).describe("Ordered tweets in the thread"),
  delay_ms: z.number().min(0).max(5000).optional().describe("Optional delay between tweets")
});

async function start() {
  const server = new Server({
    name: "x-mcp",
    version: "0.1.0"
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "verify_auth",
          description: "Verify authentication configuration and show current settings",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "upload_media",
          description: "Upload media (image) to X/Twitter for use in tweets",
          inputSchema: {
            type: "object",
            properties: {
              data_base64: {
                type: "string",
                description: "Base64-encoded media. May include a data URL prefix."
              },
              media_type: {
                type: "string",
                description: "MIME type, e.g. image/png or image/jpeg"
              }
            },
            required: ["data_base64"]
          }
        },
        {
          name: "post_tweet",
          description: "Post a single tweet to X/Twitter",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Tweet text (max 280 characters)",
                minLength: 1,
                maxLength: 280
              },
              media_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of media IDs from upload_media"
              },
              in_reply_to_tweet_id: {
                type: "string",
                description: "Tweet ID to reply to"
              },
              quote_tweet_id: {
                type: "string",
                description: "Tweet ID to quote"
              }
            },
            required: ["text"]
          }
        },
        {
          name: "post_thread",
          description: "Post a thread of tweets to X/Twitter",
          inputSchema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "Tweet text (max 280 characters)",
                      minLength: 1,
                      maxLength: 280
                    },
                    media_ids: {
                      type: "array",
                      items: { type: "string" },
                      description: "Array of media IDs from upload_media"
                    }
                  },
                  required: ["text"]
                },
                minItems: 2,
                description: "Ordered tweets in the thread"
              },
              delay_ms: {
                type: "number",
                minimum: 0,
                maximum: 5000,
                description: "Optional delay between tweets (default: 500ms)"
              }
            },
            required: ["items"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "verify_auth": {
          const parsed = verifyAuthSchema.parse(args);
          const type = getAuthType();
          const details = {
            authType: type,
            hasOAuth2AccessToken: Boolean(ENV.OAUTH2_ACCESS_TOKEN),
            hasOAuth1: Boolean(ENV.CONSUMER_KEY && ENV.CONSUMER_SECRET && ENV.ACCESS_TOKEN && ENV.ACCESS_TOKEN_SECRET),
            apiBase: ENV.API_BASE,
            mediaUploadEndpoint: `${ENV.API_BASE}/2/media/upload`
          };
          return {
            content: [{ type: "text", text: JSON.stringify(details, null, 2) }]
          };
        }

        case "upload_media": {
          const { data_base64, media_type } = uploadMediaSchema.parse(args);
          const url = `${ENV.API_BASE}/2/media/upload`;
          
          // Convert base64 to buffer for proper upload
          const mediaBuffer = Buffer.from(cleanupBase64(data_base64), 'base64');
          const form = new FormData();
          
          // Use the new v2 API format
          form.append('media', mediaBuffer, {
            filename: 'upload',
            contentType: media_type || 'application/octet-stream'
          });
          form.append('media_category', 'tweet_image');
          
          const headers = {
            ...form.getHeaders(),
            ...getAuthHeaders("POST", url)
          };
          
          try {
            const resp = await axios.post(url, form, { headers });
            const { media_id_string } = resp.data as any;
            return {
              content: [{ type: "text", text: JSON.stringify({ media_id_string }, null, 2) }]
            };
          } catch (err) {
            const e = err as AxiosError;
            const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
            return { content: [{ type: "text", text: `upload_media error: ${msg}` }], isError: true };
          }
        }

        case "post_tweet": {
          const { text, media_ids, in_reply_to_tweet_id, quote_tweet_id } = postTweetSchema.parse(args);
          const url = absoluteUrl(ENV.API_BASE, "/2/tweets");
          const body: any = { text };
          if (media_ids && media_ids.length > 0) {
            body.media = { media_ids };
          }
          if (in_reply_to_tweet_id) {
            body.reply = { in_reply_to_tweet_id };
          }
          if (quote_tweet_id) {
            body.quote_tweet_id = quote_tweet_id;
          }
          try {
            const headers = {
              "Content-Type": "application/json",
              ...getAuthHeaders("POST", url)
            };
            const resp = await axios.post(url, body, { headers });
            const data: any = resp.data;
            const id = data.data?.id;
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ id, url: id ? `https://x.com/i/web/status/${id}` : null, response: data }, null, 2)
              }]
            };
          } catch (err) {
            const e = err as AxiosError;
            const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
            return { content: [{ type: "text", text: `post_tweet error: ${msg}` }], isError: true };
          }
        }

        case "post_thread": {
          const { items, delay_ms = 500 } = postThreadSchema.parse(args);
          const tweetUrl = absoluteUrl(ENV.API_BASE, "/2/tweets");
          const results: Array<{ id: string; text: string }> = [];
          let replyTo: string | undefined = undefined;
          for (const item of items) {
            const body: any = { text: item.text };
            if (item.media_ids?.length) body.media = { media_ids: item.media_ids };
            if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
            try {
              const headers = { "Content-Type": "application/json", ...getAuthHeaders("POST", tweetUrl) };
              const resp = await axios.post(tweetUrl, body, { headers });
              const data: any = resp.data;
              const id = data.data?.id as string;
              if (!id) throw new Error(`No tweet id returned: ${JSON.stringify(data)}`);
              results.push({ id, text: item.text });
              replyTo = id;
              if (delay_ms) {
                await new Promise((res) => setTimeout(res, delay_ms));
              }
            } catch (err) {
              const e = err as AxiosError;
              const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
              return { content: [{ type: "text", text: `post_thread error: ${msg}` }], isError: true };
            }
          }
          const firstId = results[0]?.id;
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                count: results.length,
                first_tweet_url: firstId ? `https://x.com/i/web/status/${firstId}` : null,
                ids: results.map(r => r.id)
              }, null, 2)
            }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("X MCP server running on stdio");
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});