# 📰 CrossbarPuzzles: The Weekly Football Paper for Kids

**One printable page a week. Real Premier League stats and puzzles. No screen needed.**

**[Live site: crossbarpuzzles.com](https://www.crossbarpuzzles.com)**
[How it works](#-how-it-works) · [The agents](#-the-agents-a-newsroom-with-two-keys) · [For judges](#-for-judges-verify-it-in-5-minutes)

> Built for the Microsoft *Inside the Game* Developer Hackathon.

---

## ⚡ Elevator pitch

**CrossbarPuzzles is a weekly, one-page printable football newspaper that lets kids follow the Premier League without a screen. We used AI and the cloud to take the screen away.** Each matchweek, a **builder agent in Microsoft Foundry** fetches CC0 public-domain match data through an **Azure Function** proxy, used as an OpenAPI tool, and commits the new edition to `main`. A separate **verifier agent** checks it and is the only route to `production`, which **GitHub Actions** deploys to **Azure Static Web Apps**. The agents write data, not prose, and code computes every number on the page, so the paper can't print a made-up score. We started with synthetic match data, but young testers weren't interested and couldn't give useful feedback, so we rebuilt around real results. The result is an automated, explainable matchweek recap on the one channel the brief doesn't list: paper. It runs at near-zero cost and is especially useful in the USA, where newspapers rarely print Premier League stats.



*CrossbarPuzzles is an independent project for young football fans.*
