---
title: "Subscribe & Save Prices Went Up? Here's What's Happening and What You Can Do"
description: "Amazon's Subscribe & Save discount isn't a price lock. What the terms say, what a 2026 lawsuit alleges, and how to catch a quiet price increase."
date: "2026-10-20"
slug: subscribe-and-save-price-increase
draft: true
target_keyword: subscribe and save price increase
---

# Subscribe & Save Prices Went Up? Here's What's Happening and What You Can Do

You signed up for Subscribe & Save to get the discount and stop thinking about coffee or paper towels. Months later you notice the charge for the same bag of beans is a lot higher than it used to be. If that's happened to you, you're not imagining it, and you aren't the only one asking about it.

This post covers what's publicly known: what Amazon's own terms say, what a 2026 lawsuit alleges, what shoppers report, and some practical ways to protect yourself. We build Cutoff, a buying backend for AI agents that takes a different approach to recurring purchases, and we'll say where we think that matters. Most of this post is useful whether or not you ever use us.

## What Amazon says about Subscribe & Save pricing

Start with the source. Amazon's [Subscribe & Save help page](https://www.amazon.com/b?ie=UTF8&node=15283820011) says that "individual product prices can go up or down over time," and that if your subscribed product's price changes, "the new price will be displayed in your order review email and will be applied only on future shipments."

So the discount is a percentage off whatever the price is at the time each order ships. It isn't a price lock. According to [OregonLive's reporting](https://www.oregonlive.com/retail/2026/05/amazon-lured-customers-into-enrolling-in-subscribe-save-then-quietly-jacked-up-the-prices-lawsuit-alleges.html), Amazon's Subscribe & Save terms state that it "may change the price for a Subscribe & Save subscription at any time for any reason," and that Amazon can also change sellers.

In a statement quoted in the same article, Amazon said customers get a 5 to 15% discount and that "before each delivery they receive an email showing whether an item is in stock and, if so, the item price, any price changes, and applicable savings," and that customers "can review, modify, skip, or cancel their subscription at any time before their order ships."

That's Amazon's position: prices float, you get notified, and you can opt out.

## What the lawsuit alleges

On May 15, 2026, a proposed nationwide class action, *Herman v. Amazon.com, Inc.*, was filed in federal court in western Washington. The [Stritmatter law firm's case page](https://www.stritmatter.com/amazon-subscribe-save-class-action/) says it alleges that Amazon "entices consumers with artificial 'subscription discount' prices only to then dramatically increase the price for future shipments—often above market prices on Amazon."

[OregonLive](https://www.oregonlive.com/retail/2026/05/amazon-lured-customers-into-enrolling-in-subscribe-save-then-quietly-jacked-up-the-prices-lawsuit-alleges.html) reports the specific example in the complaint. The plaintiffs, a Pennsylvania couple, subscribed to Lavazza ground espresso in February 2024 and paid $16.60 after the 15% discount. According to the suit, later shipments cost $17.04, then $21.25, then $28.69 by October 2024. The suit says the email about the last increase arrived at 8:54 p.m. on the same night the order was processed and charged, and that another Amazon seller was offering the identical item for $25.90.

The complaint argues that even with the disclosures, the "net impression" is that subscribers are getting a special price and that Amazon will keep assigning orders to the best-priced sellers.

These are allegations. The case hasn't been decided, and Amazon disputes the characterization. Still, it describes a pattern a lot of people say they recognize.

## What shoppers report

Outside the courtroom, the same complaints come up in forums:

- In an [r/amazonprime thread titled "Bait and Switch with Subscribe and Save?"](https://www.reddit.com/r/amazonprime/comments/1iuvxzt/bait_and_switch_with_subscribe_and_save/), a user said their coffee beans went from $12.35 to $19.94. Another commenter in the same thread pushed back: Subscribe & Save sends an email before each shipment showing price changes, and third-party sellers set their own prices. Both points are fair.
- In the same thread, another user wrote that they subscribed to paper towels at 40% off, and "less than 24 hours later Amazon had 'converted' my subscription to a different item that was more expensive."
- [Slickdeals](https://daily.slickdeals.net/shopping/amazon-subscribe-and-save-price-changes/) wrote about members who said first orders were canceled and re-placed later at higher prices. In that case, Amazon told Slickdeals that changing the delivery date on a first order can void coupons and promotions, and that some of the confusion came from a customer-service miscommunication.

Anecdotes aren't data, and we can't tell you how common any of this is. What they show is the mechanism. A subscription is built to keep shipping by default, and it's up to you to catch every change.

## Why this happens: defaults do the work

None of this requires anyone to do something sneaky. It follows from how the product is designed:

1. **The price isn't fixed.** The discount applies to a moving base price.
2. **The seller can change.** The terms allow it, and different sellers price differently.
3. **The default is "ship."** If you do nothing, the order goes out at the new price.
4. **The notice comes from the seller.** The email that tells you about an increase is from the same company that benefits if you don't read it.

When defaults favor the seller and your only protection is noticing an email in time, prices will drift up for anyone who's busy. Regulators have been paying attention to subscription design generally. The FTC's case against Amazon over Prime enrollment and cancellation is the best-known example, and it's a separate issue from Subscribe & Save.

> **TODO:** The line above references the FTC case against Amazon over Prime enrollment and cancellation and has no source. Add a citation before publishing.

## What you can do today (no new tools needed)

These steps work with any auto-ship program:

- **Write down your entry price.** Note what you paid on the first order for each subscribed item. Without a baseline, a slow increase is hard to spot.
- **Actually read the pre-shipment email.** It's annoying, but according to Amazon it's where price changes appear. Set a filter or label so it doesn't get buried.
- **Check the regular listing, not just the subscription price.** The Herman complaint's central claim is that the subscription price ended up higher than another seller's price for the same item. A quick search before each cycle is the only way to know.
- **Watch for "converted" or swapped items.** If the product name, size, or seller changes, treat it as a new decision, not a continuation.
- **Skip freely.** Skipping a cycle is allowed, and it's often the easiest way to get a price to reset or to buy elsewhere.
- **Consolidate fewer, longer intervals.** Fewer shipments means fewer chances for a surprise price.
- **Use a price tracker for your highest-spend items.** Even checking manually once a month catches most drift.

All of this works. It also adds up to a lot of chores for something that was supposed to save you from chores.

## What a buyer-side alternative looks like

Here's where we'll explain our own thinking. Feel free to skip it.

The underlying problem is that the subscription works for the seller by default. We think recurring household purchases, especially ones made by AI agents on your behalf, should work the other way: your rules set the limits on the purchase, not the store's defaults.

That's what we're building with [Cutoff](https://callcutoff.com). It's a buying backend that AI agents (in Claude, ChatGPT, Cursor, Grok, or your own code) call over MCP or an API to buy household replenishment items like coffee, filters, pet supplies, and towels. The core ideas map directly onto the problems above:

- **A mandate you set once.** A spending ceiling, a delivery address, and a never-substitute rule. Nothing commits outside those limits, and the agent can't quietly raise the cap.
- **A locked landed quote.** Before each purchase, the agent gets a short-lived price that includes shipping. The commit either honors that price or fails with a clear, typed error. A higher charge doesn't slip through between "yes" and the charge.
- **No substitution.** If the exact item isn't available, the answer is "no," not "we picked something close."
- **Skipping is the normal case.** Your agent buys when you need the item. It doesn't own a subscription that keeps shipping.
- **A receipt you keep.** Each order produces an evidence pack that stays with your household, even if you later revoke the agent's access.

To be clear about where we are: Cutoff is in early access and runs in a sandbox. We haven't published pricing, and we're not claiming it's a live production service yet. If the idea is useful to you, the [pilot waitlist](https://callcutoff.com) is open.

## The bottom line

Subscribe & Save isn't a price lock, and Amazon's own help page and terms say so. Whether the way prices drift amounts to "bait and switch" is now for a court to decide. In the meantime, the practical takeaway doesn't depend on how that case turns out: **if your recurring purchases ship by default, someone has to check every price, every time.** You can do that yourself with the steps above. Or you can set rules once and use tools that refuse to buy outside them.

*Sources: [Amazon Subscribe & Save help](https://www.amazon.com/b?ie=UTF8&node=15283820011) · [OregonLive, May 2026](https://www.oregonlive.com/retail/2026/05/amazon-lured-customers-into-enrolling-in-subscribe-save-then-quietly-jacked-up-the-prices-lawsuit-alleges.html) · [Stritmatter case page](https://www.stritmatter.com/amazon-subscribe-save-class-action/) · [r/amazonprime thread](https://www.reddit.com/r/amazonprime/comments/1iuvxzt/bait_and_switch_with_subscribe_and_save/) · [Slickdeals](https://daily.slickdeals.net/shopping/amazon-subscribe-and-save-price-changes/)*
