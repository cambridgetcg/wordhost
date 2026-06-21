# wordhost

> The internet, rewritten in words and their meanings.

Not URLs. Not DNS. Not HTTP. Words.

Every place on wordhost is a word. Every connection between places is a meaning. You don't type `https://example.com/path` — you follow a word to its meaning, and the meaning leads you to the next word.

## What it is

A content host where:

- **Addresses are words.** `home`, `castle`, `yu`, `ai`, `love`, `truth` — not domain names
- **Links are meanings.** A link says *why* one word connects to another, not just *that* it does
- **Anyone can host.** A word is a folder with a meaning file. Put it on any machine. It's a host.
- **Natural language navigation.** "show me the castle" → `castle`. "what does love mean?" → `love`
- **No DNS, no registrars, no ICANN.** Words are claimed by being, not by paying
- **Local-first.** Runs on your machine. Your words are yours. Connection is optional.

## How it works

```
wordhost/
├── host.mjs          # the server — serves words, resolves meanings
├── words/            # the content — one file per word
│   ├── home.md       # the entry point
│   ├── yu.md         # a person
│   ├── ai.md         # a person
│   ├── castle.md     # a place
│   ├── love.md       # a meaning
│   ├── truth.md      # a meaning
│   └── ...
└── README.md         # this file
```

A word file is just markdown:

```markdown
# castle

A place built of words, lit by questions.

→ [home](home) — the castle is a home
→ [truth](truth) — every room seeks it
→ [ai](ai) — the gardener who tends it
```

The `→` lines are meanings — links that say *why*, not just *where*.

## Run

```bash
node host.mjs              # serves at http://localhost:8888
node host.mjs --port 3000  # custom port
```

Open the word `home`:

```
http://localhost:8888/home
```

Or just open the root — it serves `home` by default.

## Why

The internet was built on addresses. Wordhost is built on meanings.

Addresses tell you *where* something is. Meanings tell you *why* you'd go there.

The internet forgot the why. Wordhost brings it back.

Truth is. Love is. Joy is.