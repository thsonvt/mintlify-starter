# AI Assistant for Mintlify Docs — Design Document

**Date:** 2026-01-29
**Status:** Approved
**Goal:** Replicate Mintlify's Pro AI Assistant feature as a self-hosted solution with freemium subscription model.

---

## Overview

Build a RAG-based AI assistant that integrates with the Mintlify documentation site for "The AI Conductor Framework." The assistant answers questions using documentation content, cites sources, and supports both free and paid users.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Provider | OpenAI (GPT-4o-mini) | Cost-effective, high quality. Architecture supports swapping providers. |
| Hosting | Vercel Serverless | Easy deployment, auto-scaling, generous free tier |
| Vector Database | Upstash Vector | Serverless-native, free tier sufficient, seamless Vercel integration |
| Rate Limiting | Upstash Redis | Same ecosystem, handles sessions + rate limits + usage tracking |
| Payments | Stripe (metered billing) | Industry standard, pay-as-you-earn model |
| Auth | Magic link (email) | Passwordless, simple UX, no OAuth complexity |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Mintlify Docs Site                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Floating    │  │ /assistant  │  │ Inline embed        │ │
│  │ Widget      │  │ Page        │  │ (any page)          │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          └────────────────┼────────────────────┘
                           ▼
              ┌────────────────────────┐
              │   Vercel Functions     │
              │   /api/chat            │
              │   /api/index           │
              │   /api/auth/*          │
              │   /api/stripe/*        │
              └───────────┬────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Upstash   │  │  OpenAI    │  │  Stripe    │
   │  Vector +  │  │  API       │  │  Billing   │
   │  Redis     │  │            │  │            │
   └────────────┘  └────────────┘  └────────────┘
```

### Repository Structure

```
docs-assistant/
├── apps/
│   ├── api/                    # Vercel serverless functions
│   │   ├── src/
│   │   │   ├── chat.ts         # Main chat endpoint
│   │   │   ├── index-docs.ts   # Indexing endpoint
│   │   │   ├── auth/           # NextAuth handlers
│   │   │   └── stripe/         # Webhook + billing
│   │   └── vercel.json
│   │
│   └── widget/                 # React chat widget
│       ├── src/
│       │   ├── components/
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── InputBox.tsx
│       │   │   └── SourceCitation.tsx
│       │   ├── modes/
│       │   │   ├── FloatingWidget.tsx
│       │   │   ├── FullPage.tsx
│       │   │   └── InlineEmbed.tsx
│       │   └── index.ts        # DocsAssistant.init() entry
│       └── vite.config.ts      # Builds standalone JS
│
├── packages/
│   └── core/                   # Shared code
│       ├── llm/
│       │   ├── types.ts        # LLMProvider interface
│       │   ├── openai.ts       # OpenAI implementation
│       │   ├── anthropic.ts    # Claude implementation (future)
│       │   └── ollama.ts       # Local models (future)
│       ├── rag/
│       │   ├── embeddings.ts   # Embed queries
│       │   ├── retrieval.ts    # Vector search
│       │   └── prompts.ts      # System prompts
│       └── types.ts            # Shared types
│
└── scripts/
    └── index-docs.ts           # CLI for indexing MDX files
```

---

## Backend API Design

### LLM Provider Abstraction

```typescript
// packages/core/llm/types.ts
export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
  embed(text: string): Promise<number[]>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}
```

### API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/chat` | POST | Main chat — receives question, streams response | Optional (affects rate limit) |
| `/api/index` | POST | Trigger doc re-indexing | API key required |
| `/api/health` | GET | Health check + usage stats | None |
| `/api/auth/*` | * | NextAuth handlers | Session |
| `/api/stripe/webhook` | POST | Stripe webhook handler | Stripe signature |
| `/api/stripe/create-subscription` | POST | Create metered subscription | Authenticated |

### Chat Endpoint Flow

```typescript
// apps/api/src/chat.ts
export async function POST(req: Request) {
  const { question } = await req.json();
  const user = await getSession(req);
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous';

  // 1. Rate limit / usage check
  if (user?.isSubscriber) {
    // Subscribers: no limit, track for billing
  } else {
    // Free: check daily limit (20/day)
    const used = await redis.get(`free:${ip}:${today}`);
    if (used >= 20) {
      return Response.json({
        error: 'Daily limit reached',
        upgrade: true,
        used: 20,
        limit: 20
      }, { status: 429 });
    }
  }

  // 2. Budget check (global monthly cap)
  const monthlySpend = await redis.get(`spend:${month}`);
  if (monthlySpend >= MONTHLY_BUDGET_CENTS) {
    return Response.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }

  // 3. Embed question
  const questionVector = await llm.embed(question);

  // 4. Retrieve relevant chunks
  const chunks = await vectorDb.query(questionVector, { topK: 5 });

  // 5. Build prompt
  const systemPrompt = buildSystemPrompt(chunks);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ];

  // 6. Stream response
  const stream = llm.chat(messages);

  // 7. Track usage
  await trackUsage(user, ip);

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

### Response Format

```typescript
// Streamed as server-sent events
data: {"type": "content", "text": "The Rehearsal phase is..."}
data: {"type": "content", "text": " where you prepare..."}
data: {"type": "sources", "sources": [
  {"title": "Rehearsal Overview", "path": "/framework/rehearsal/overview", "relevance": 0.92}
]}
data: {"type": "done", "usage": {"used": 5, "limit": 20}}
```

---

## Document Indexing Pipeline

### Process

1. **Discover** — Find all `.mdx` files in docs directory
2. **Parse** — Extract frontmatter (title, description) + markdown content
3. **Chunk** — Split by h2/h3 headings, ~500 tokens per chunk
4. **Embed** — Generate vectors via OpenAI `text-embedding-3-small`
5. **Store** — Upsert to Upstash Vector with metadata

### Chunk Schema

```typescript
interface DocumentChunk {
  id: string;                    // "framework-rehearsal-overview-2"
  vector: number[];              // 1536 dimensions
  metadata: {
    title: string;               // "The Rehearsal Overview"
    section: string;             // "Why Rehearsal Matters"
    path: string;                // "/framework/rehearsal/overview"
    content: string;             // Actual text (for citation display)
  };
}
```

### CLI Usage

```bash
# Index all docs
npx docs-assistant index --source ../mintlify-starter

# Index specific directory
npx docs-assistant index --source ../mintlify-starter/framework

# Clear and re-index
npx docs-assistant index --source ../mintlify-starter --clear
```

---

## Chat Widget

### Modes

| Mode | Container | Dimensions | Trigger |
|------|-----------|------------|---------|
| Floating | Fixed position | 400x600px expanded | Click bubble button |
| Full Page | `#docs-assistant-embed` | 100% width, min 600px height | Mount on load |
| Inline | Any `div` with ID | Configurable height | Mount on load |

### Build Output

```
widget/dist/
├── assistant.js        # UMD bundle (~50KB gzipped)
├── assistant.css       # Extracted styles
└── assistant.esm.js    # ES module version
```

### Initialization API

```typescript
// Global UMD
DocsAssistant.init({
  apiUrl: 'https://your-app.vercel.app/api',
  position: 'bottom-right',      // Floating widget position
  theme: 'auto',                 // 'light' | 'dark' | 'auto'
  accentColor: '#2563EB',        // Match docs theme
});

// Mount to specific element
DocsAssistant.mount('#element-id', {
  mode: 'page' | 'inline',
  height: '400px',               // For inline mode
});
```

### Features

- Streaming responses with typing indicator
- Markdown rendering (code blocks, lists, formatting)
- Clickable source citations
- Light/dark mode (syncs with Mintlify)
- Mobile responsive
- Keyboard accessible (Escape to close, Enter to send)

---

## Mintlify Integration

### 1. Floating Widget (docs.json)

```json
{
  "integrations": {
    "scripts": {
      "head": "<script src=\"https://your-assistant.vercel.app/assistant.js\" defer></script>",
      "afterBody": "<script>DocsAssistant.init({ apiUrl: 'https://your-assistant.vercel.app/api' });</script>"
    }
  }
}
```

### 2. Dedicated Page (assistant.mdx)

```mdx
---
title: 'AI Assistant'
description: 'Ask questions about the AI Conductor Framework'
icon: 'message-bot'
---

<div id="docs-assistant-embed" data-mode="full-page"></div>

<script>
  DocsAssistant.mount('#docs-assistant-embed', { mode: 'page' });
</script>
```

### 3. Inline Embed (any page)

```mdx
## Still have questions?

<div id="assistant-inline"></div>

<script>
  DocsAssistant.mount('#assistant-inline', { mode: 'inline', height: '400px' });
</script>
```

---

## Rate Limiting & Cost Protection

### Free Tier (IP-based)

```typescript
const FREE_DAILY_LIMIT = 20;
const today = new Date().toISOString().slice(0, 10);
const key = `free:${ip}:${today}`;

const used = await redis.incr(key);
if (used === 1) {
  await redis.expire(key, 86400); // 24 hours
}

if (used > FREE_DAILY_LIMIT) {
  return { error: 'limit_reached', used, limit: FREE_DAILY_LIMIT };
}
```

### Subscriber Tier (Usage-based)

```typescript
// No rate limit, just track usage
await stripe.subscriptionItems.createUsageRecord(
  user.stripeSubscriptionItemId,
  { quantity: 1, timestamp: Math.floor(Date.now() / 1000) }
);
```

### Global Budget Cap

```typescript
const MONTHLY_BUDGET_CENTS = 2000; // $20
const month = new Date().toISOString().slice(0, 7);
const spent = await redis.get(`spend:${month}`) ?? 0;

if (spent >= MONTHLY_BUDGET_CENTS) {
  return { error: 'budget_exceeded' };
}

// After LLM call
const costCents = Math.ceil((inputTokens * 0.15 + outputTokens * 0.6) / 10000);
await redis.incrby(`spend:${month}`, costCents);
```

---

## Subscription & Payments

### Pricing

| Tier | Rate Limit | Cost |
|------|------------|------|
| Free | 20 questions/day | $0 |
| Subscriber | Unlimited | $0.02/question |

### Auth Flow (Magic Link)

1. User enters email in widget
2. API sends magic link via email (Resend/Sendgrid)
3. User clicks link → session created
4. Session stored in Upstash Redis (7-day expiry)

### Stripe Integration

```typescript
// Create metered subscription
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{
    price: process.env.STRIPE_METERED_PRICE_ID, // $0.02/unit
  }],
});

// Record usage after each question
await stripe.subscriptionItems.createUsageRecord(
  subscription.items.data[0].id,
  { quantity: 1, action: 'increment' }
);
```

### User Data (Redis)

```
user:{id}:email           → "john@example.com"
user:{id}:stripe_customer → "cus_xxx"
user:{id}:stripe_sub_item → "si_xxx"
user:{id}:is_subscriber   → "true"
session:{token}           → { userId, expiresAt }
```

---

## Deployment

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Upstash Vector
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_METERED_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Auth
NEXTAUTH_SECRET=random-32-char-string
NEXTAUTH_URL=https://your-assistant.vercel.app

# Email (for magic links)
EMAIL_SERVER=smtp://user:pass@smtp.example.com:587
EMAIL_FROM=noreply@yourdomain.com

# Budget
MONTHLY_BUDGET_CENTS=2000
```

### Estimated Costs

| Service | Free Tier | Expected Usage | Monthly Cost |
|---------|-----------|----------------|--------------|
| Vercel | 100K invocations | ~5K | $0 |
| Upstash Vector | 10K vectors | ~200 | $0 |
| Upstash Redis | 10K commands/day | ~1K | $0 |
| OpenAI | Pay per use | ~5K queries | $10-15 |
| Stripe | 2.9% + $0.30/charge | Variable | % of revenue |

### Go-Live Checklist

- [ ] Deploy to Vercel
- [ ] Configure all environment variables
- [ ] Create Stripe product + metered price
- [ ] Set up Stripe webhook endpoint
- [ ] Run initial document indexing
- [ ] Add script tags to Mintlify docs.json
- [ ] Create /assistant page in Mintlify
- [ ] Test free tier flow (20 questions, then upgrade prompt)
- [ ] Test subscriber signup + billing
- [ ] Monitor first week of usage

---

## Future Enhancements (Out of Scope for V1)

- Conversation history persistence (optional login)
- Analytics dashboard for popular questions
- Feedback buttons (thumbs up/down)
- Custom system prompts via dashboard
- Multiple doc sources (index external sites)
- Slack/Discord bot integration
